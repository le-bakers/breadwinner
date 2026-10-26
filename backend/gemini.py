import base64
import io
import json
import os
import time

import requests
from dotenv import load_dotenv
from PIL import Image, ImageOps

import units

load_dotenv()

KEY = os.getenv("GEMINI_API_KEY")
URL = "https://generativelanguage.googleapis.com/v1beta/models"
TIMEOUT = 45
MODELS = ["gemini-3.8-flash", "gemini-3.5-flash-lite"]
LIMIT = int(os.getenv("GEMINI_DAILY_LIMIT", "200"))
SIDE = 3072
REST = 300

_usage = {"day": None, "count": 0}
_resting = {}

PROMPT = """This is a photo of a store receipt. List every product the shopper bought, in the order printed.

For each product give:
- name: the product text exactly as printed on the receipt. Do not expand abbreviations or fix spelling.
  Leave out barcodes, store codes, quantities and tax letters.
- price: the amount charged for that line, as a number. If the line shows a quantity or a weight
  (like "2 @ 3.99" or "1.25 lb @ 0.59/lb"), use the line total, not the price for one.
- quantity: how many packages of this product the line is for, like 2 for "2 @ 3.99".
  Use 1 when no quantity is printed, and 1 for anything sold by weight.
- upc: the 12 to 14 digit barcode number printed on that product's line or right under it,
  or "" if there is none. Never guess one.

- plain_name: your best guess at what the product is, in plain English, like
  "Udi's gluten-free white bread". It only helps the shopper recognize the line.
  Use the section heading the line is printed under (like GROCERY or HEALTH AND BEAUTY) and short forms
  in the name (like SNCK for snack) as clues. If letters are faded or missing, do not pick a famous brand
  that only looks similar. Use "" if you cannot tell.
- gluten_free: true only for a specialty gluten-free product, made to replace a food that normally
  contains wheat (gluten-free bread, pasta, flour, crackers, cookies, cereal, pizza and so on).
  Use false for foods that never contain gluten anyway (fruit, milk, eggs, meat, rice),
  and false whenever you are not sure.
- regular_version: when gluten_free is true, a short grocery search for the ordinary version of
  the same food, like "white bread" or "penne pasta", with no brand name. Otherwise "".
- package_size: when gluten_free is true, the size of one package, like "12 oz" or "6 ct".
  Use the size printed on the receipt if there is one. Otherwise use the size this exact brand and
  product is normally sold in, but only when you are sure (Barilla gluten-free spaghetti is "12 oz").
  Use "" if you are not sure. A wrong size gives a wrong number, so never guess from similar products.

Do not list subtotal, total, tax, payment, change, coupon, discount, savings or loyalty lines.
If a product's name and price are printed on two lines, join them into one product.
If you cannot read a product's price, leave that product out instead of guessing.
If the photo is not a receipt, return an empty list.

Also give subtotal: the SUBTOTAL printed on the receipt, before tax. Use 0 if no subtotal is
printed, or if the receipt has any coupon or discount lines."""

SCHEMA = {
    "type": "object",
    "properties": {
        "items": {
            "type": "array",
            "items": {
                "type": "object",
                "properties": {
                    "name": {"type": "string"},
                    "price": {"type": "number"},
                    "quantity": {"type": "integer"},
                    "upc": {"type": "string"},
                    "plain_name": {"type": "string"},
                    "gluten_free": {"type": "boolean"},
                    "regular_version": {"type": "string"},
                    "package_size": {"type": "string"},
                },
                "required": ["name", "price", "quantity", "upc", "plain_name", "gluten_free", "regular_version",
                             "package_size"],
            },
        },
        "subtotal": {"type": "number"},
    },
    "required": ["items", "subtotal"],
}


class Unavailable(Exception):
    """Signal that Gemini cannot read this photo right now"""


def read(photo):
    """Send a receipt photo to Gemini and return its items and subtotal"""
    if not KEY:
        raise Unavailable("there is no GEMINI_API_KEY in .env")

    body = {
        "contents": [{
            "parts": [
                {"inline_data": {"mime_type": "image/jpeg", "data": base64.b64encode(shrink(photo)).decode("utf-8")}},
                {"text": PROMPT},
            ],
        }],
        "generationConfig": {
            "responseFormat": {"text": {"mimeType": "APPLICATION_JSON", "schema": SCHEMA}},
        },
    }

    for model in MODELS:
        if time.time() < _resting.get(model, 0):
            continue
        if not count():
            raise Unavailable(f"the daily limit of {LIMIT} requests is used up")

        try:
            response = requests.post(
                f"{URL}/{model}:generateContent",
                json=body,
                headers={"x-goog-api-key": KEY},
                timeout=TIMEOUT,
            )
        except requests.RequestException as error:
            print(f"Gemini {model} could not be reached: {type(error).__name__}")
            continue

        if response.status_code != 200:
            _resting[model] = time.time() + REST
            print(f"Gemini {model} said no ({response.status_code}): {reason(response)}")
            continue

        try:
            data = answer(response.json())
            return clean(data["items"]), subtotal(data.get("subtotal"))
        except (KeyError, IndexError, TypeError, ValueError, AttributeError):
            print(f"Gemini {model} gave an answer that could not be understood")

    raise Unavailable("no Gemini model could read the photo")


def shrink(photo):
    """Turn any photo into a smaller upright JPEG without hidden location details"""
    image = Image.open(io.BytesIO(photo))
    image = ImageOps.exif_transpose(image).convert("RGB")
    image.thumbnail((SIDE, SIDE))

    buffer = io.BytesIO()
    image.save(buffer, format="JPEG", quality=85)
    return buffer.getvalue()


def count():
    """Count one request for today and return False once the daily limit is reached"""
    today = time.strftime("%Y-%m-%d")
    if _usage["day"] != today:
        _usage["day"] = today
        _usage["count"] = 0

    if _usage["count"] >= LIMIT:
        return False

    _usage["count"] += 1
    return True


def reason(response):
    """Describe why Google refused a request with its exact reason code in front"""
    try:
        error = response.json()["error"]
        message = error["message"]
        code = error.get("status")
        for detail in error.get("details") or []:
            if detail.get("reason"):
                code = detail["reason"]
                break
    except (KeyError, TypeError, ValueError, AttributeError):
        return "no details given"

    return f"[{code}] {message}" if code else message


def answer(data):
    """Pull the JSON answer out of Gemini's reply while skipping its thinking notes"""
    parts = data["candidates"][0]["content"]["parts"]
    text = "".join(part["text"] for part in parts if "text" in part and not part.get("thought"))
    return json.loads(text)


def clean(raw):
    """Keep only items with a real name and price and tidy every field"""
    items = []
    for item in raw:
        name = str(item.get("name") or "").strip()
        price = item.get("price")
        upc = item.get("upc")

        if not name or not isinstance(price, (int, float)) or price <= 0:
            continue
        if not (isinstance(upc, str) and upc.isdigit() and 12 <= len(upc) <= 14):
            upc = None

        qty = item.get("quantity")
        if type(qty) is not int or not 1 <= qty <= 99:
            qty = 1

        gf = item.get("gluten_free") is True
        items.append({
            "name": name,
            "price": round(float(price), 2),
            "quantity": qty,
            "upc": upc,
            "unsure": False,
            "plain_name": tidy(item.get("plain_name")),
            "gf": gf,
            "regular_term": tidy(item.get("regular_version")),
            "package_size": size(item.get("package_size")) if gf else None,
        })

    return items


def tidy(value):
    """Trim a piece of text to 60 letters or return None when it is empty"""
    if not isinstance(value, str):
        return None
    return value.strip()[:60] or None


def size(value):
    """Keep a package size only when the deduction math can read it"""
    text = tidy(value)
    if text and units.size(text):
        return text
    return None


def subtotal(value):
    """Turn Gemini's subtotal into a number or None when it found none"""
    if isinstance(value, (int, float)) and value > 0:
        return round(float(value), 2)
    return None


if __name__ == "__main__":
    import sys

    with open(sys.argv[1], "rb") as file:
        found, total = read(file.read())

    for item in found:
        print(item)
    print("Subtotal:", total)
