import os

from fastapi import FastAPI, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware

import gemini
import kroger
import ocr
import receipt_parser

app = FastAPI()

# Who reads the receipt photo. Set OCR_ENGINE in .env:
#   "gemini" (the default) = Google's Gemini reads the photo. Most accurate, free allowance per day.
#   "local"                = RapidOCR reads it on this computer. Free and unlimited, less accurate.
# Gemini always falls back to local when it can't be used, so a scan never fails just because of Gemini.
OCR_ENGINE = os.getenv("OCR_ENGINE", "gemini")

# Lets the website (a different address than this server) ask this server for data
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["GET", "POST"],
    allow_headers=["*"],
)


@app.get("/")
def health_check():
    return {"status": "ok"}


@app.get("/kroger/search")
def kroger_search(zip: str, term: str):
    location_id = kroger.find_nearest_location(zip)

    if location_id is None:
        raise HTTPException(status_code=404, detail="No Kroger-banner store near that zip code.")

    results = kroger.search_products(term, location_id)

    return {"location_id": location_id, "results": results}


@app.post("/scan")
def scan(file: UploadFile):
    # The photo is read, turned into text, and thrown away. Nothing is saved on the server.
    image_bytes = file.file.read()

    if not image_bytes:
        raise HTTPException(status_code=400, detail="The uploaded file was empty.")

    try:
        engine, items, subtotal = read_items(image_bytes)
    except Exception:
        raise HTTPException(status_code=422, detail="Could not read that file as a receipt photo.")

    # "engine" says who read it ("gemini" or "local"), which helps when an item looks wrong.
    # "subtotal" is the receipt's own subtotal (or null). The website warns when the items don't add up to it.
    return {"engine": engine, "items": items, "subtotal": subtotal}


def read_items(image_bytes):
    """Returns who read the photo, the list of items they found, and the receipt's subtotal."""
    if OCR_ENGINE == "gemini":
        try:
            # Gemini is not asked for the subtotal yet, so there is nothing to check its items against
            return "gemini", gemini.read_receipt(image_bytes), None
        except gemini.GeminiUnavailable as reason:
            print(f"Gemini was skipped ({reason}). Reading the photo on this computer instead.")

    items, subtotal = read_locally(image_bytes)
    return "local", items, subtotal


def read_locally(image_bytes):
    """Reads the photo on this computer and returns (items, subtotal).
    A small photo sometimes reads better enlarged and sometimes worse. So when the first reading
    looks shaky, an enlarged copy is read too, and whichever reading has less trouble is kept."""
    first = read_text(ocr.extract_text(image_bytes))

    check, unsure_rows = trouble(first)
    if check != DOES_NOT_ADD_UP and unsure_rows == 0:
        return first

    bigger_photo = ocr.enlarge_small_photo(image_bytes)
    if bigger_photo is None:
        return first

    second = read_text(ocr.extract_text(bigger_photo))
    return min(first, second, key=trouble)  # on a tie, min() keeps the first reading


def read_text(text):
    return receipt_parser.parse_receipt(text), receipt_parser.find_subtotal(text)


ADDS_UP, NOTHING_TO_CHECK, DOES_NOT_ADD_UP = 0, 1, 2


def trouble(reading):
    """How much is wrong with a reading, smaller is better: first whether the prices
    add up to the receipt's subtotal, then how many rows the reader was unsure about."""
    items, subtotal = reading
    total = round(sum(item["price"] for item in items), 2)
    unsure_rows = sum(item["unsure"] for item in items)

    if subtotal is None:
        return NOTHING_TO_CHECK, unsure_rows
    if total == subtotal:
        return ADDS_UP, unsure_rows
    return DOES_NOT_ADD_UP, unsure_rows
