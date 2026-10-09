import os
import io
import json
import time
import base64
import requests
from PIL import Image, ImageOps
from dotenv import load_dotenv

load_dotenv()

API_KEY = os.getenv("GEMINI_API_KEY")
API_URL = "https://generativelanguage.googleapis.com/v1beta/models"
TIMEOUT = 45  # seconds to wait for Gemini before giving up

# Tried in this order. Each model has its own free daily allowance, so when the
# first one runs out the second one still works. Model names: ai.google.dev/gemini-api/docs/models
MODELS = ["gemini-3.8-flash", "gemini-3.5-flash-lite"]

# Safety net against a surprise bill: never send more than this many requests in one day.
# On a key with no billing account Google cannot charge anything at all.
DAILY_LIMIT = int(os.getenv("GEMINI_DAILY_LIMIT", "200"))

MAX_PHOTO_SIDE = 3072          # pixels. Phone photos are bigger than Gemini needs
REST_AFTER_REFUSAL = 300       # seconds to leave a model alone after Google refuses a request

_usage = {"day": None, "count": 0}
_resting_until = {}  # model name -> the time it can be tried again

PROMPT = """This is a photo of a store receipt. List every product the shopper bought, in the order printed.

For each product give:
- name: the product text exactly as printed on the receipt. Do not expand abbreviations or fix spelling.
  Leave out barcodes, store codes, quantities and tax letters.
- price: the amount charged for that line, as a number. If the line shows a quantity or a weight
  (like "2 @ 3.99" or "1.25 lb @ 0.59/lb"), use the line total, not the price for one.
- upc: the 12 to 14 digit barcode number printed on that product's line or right under it,
  or null if there is none. Never guess one.

Do not list subtotal, total, tax, payment, change, coupon, discount, savings or loyalty lines.
If a product's name and price are printed on two lines, join them into one product.
If you cannot read a product's price, leave that product out instead of guessing.
If the photo is not a receipt, return an empty list."""

# The exact shape Gemini must answer in, so the answer is always the same kind of JSON
ANSWER_SHAPE = {
    "type": "object",
    "properties": {
        "items": {
            "type": "array",
            "items": {
                "type": "object",
                "properties": {
                    "name": {"type": "string"},
                    "price": {"type": "number"},
                    "upc": {"type": ["string", "null"]},
                },
                "required": ["name", "price", "upc"],
            },
        },
    },
    "required": ["items"],
}


class GeminiUnavailable(Exception):
    """Gemini could not read this photo right now (no key, out of free requests, no internet...)."""


def read_receipt(image_bytes):
    """Send a receipt photo to Gemini and get back [{"name": ..., "price": ..., "upc": ...}].
    Raises GeminiUnavailable when no model could do it, so the caller can use the local reader."""
    if not API_KEY:
        raise GeminiUnavailable("there is no GEMINI_API_KEY in .env")

    photo = base64.b64encode(prepare_photo(image_bytes)).decode("utf-8")

    request_body = {
        "contents": [{
            "parts": [
                {"inline_data": {"mime_type": "image/jpeg", "data": photo}},
                {"text": PROMPT},
            ],
        }],
        "generationConfig": {
            "responseFormat": {"text": {"mimeType": "application/json", "schema": ANSWER_SHAPE}},
        },
    }

    for model in MODELS:
        if time.time() < _resting_until.get(model, 0):
            continue
        if not count_request():
            raise GeminiUnavailable(f"the daily limit of {DAILY_LIMIT} requests is used up")

        try:
            # The key goes in a header, not the URL, so an error message can never print it
            response = requests.post(
                f"{API_URL}/{model}:generateContent",
                json=request_body,
                headers={"x-goog-api-key": API_KEY},
                timeout=TIMEOUT,
            )
        except requests.RequestException as error:
            print(f"Gemini {model} could not be reached: {type(error).__name__}")
            continue

        if response.status_code != 200:
            # Out of free requests (429), a key problem (403), a wrong model name (404)...
            # Asking again right away would only fail again, so leave this model alone for a while.
            _resting_until[model] = time.time() + REST_AFTER_REFUSAL
            print(f"Gemini {model} said no ({response.status_code}): {error_message(response)}")
            continue

        try:
            return clean_items(read_answer(response.json()))
        except (KeyError, IndexError, TypeError, ValueError, AttributeError):
            print(f"Gemini {model} gave an answer that could not be understood")

    raise GeminiUnavailable("no Gemini model could read the photo")


def prepare_photo(image_bytes):
    """Turn any photo into a smaller JPEG. Raises an error if the file is not a picture.
    Saving a fresh copy also drops hidden details phones add, like where the photo was taken."""
    image = Image.open(io.BytesIO(image_bytes))
    image = ImageOps.exif_transpose(image)  # stand the photo upright the way the phone meant it
    image = image.convert("RGB")
    image.thumbnail((MAX_PHOTO_SIDE, MAX_PHOTO_SIDE))

    buffer = io.BytesIO()
    image.save(buffer, format="JPEG", quality=85)
    return buffer.getvalue()


def count_request():
    """Add one to today's count. Returns False once today's limit is reached."""
    today = time.strftime("%Y-%m-%d")
    if _usage["day"] != today:
        _usage["day"] = today
        _usage["count"] = 0

    if _usage["count"] >= DAILY_LIMIT:
        return False

    _usage["count"] += 1
    return True


def error_message(response):
    """Google's own explanation of what went wrong, if it sent one."""
    try:
        return response.json()["error"]["message"]
    except (KeyError, TypeError, ValueError):
        return "no details given"


def read_answer(data):
    """Pull the list of items out of Gemini's reply."""
    parts = data["candidates"][0]["content"]["parts"]
    # Skip the model's private "thinking" notes; the real answer is the rest
    text = "".join(part["text"] for part in parts if "text" in part and not part.get("thought"))
    return json.loads(text)["items"]


def clean_items(raw_items):
    """Never trust an AI answer blindly: keep only items with a real name and a real price."""
    items = []
    for raw in raw_items:
        name = str(raw.get("name") or "").strip()
        price = raw.get("price")
        upc = raw.get("upc")

        if not name or not isinstance(price, (int, float)) or price <= 0:
            continue
        if not (isinstance(upc, str) and upc.isdigit() and 12 <= len(upc) <= 14):
            upc = None

        items.append({"name": name, "price": round(float(price), 2), "upc": upc})

    return items


if __name__ == "__main__":
    # One real request, to check the key works:  py gemini.py test_receipt.png
    import sys

    with open(sys.argv[1], "rb") as image_file:
        for item in read_receipt(image_file.read()):
            print(item)
