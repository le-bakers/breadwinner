from fastapi import FastAPI, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware
import requests

import kroger
import ocr
import receipt_parser

app = FastAPI()

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
        text = ocr.extract_text(image_bytes)
    except requests.RequestException:
        # Only happens with the Google engine: bad key, billing off, or no internet
        raise HTTPException(status_code=502, detail="The text-reading service is not available right now.")
    except Exception:
        raise HTTPException(status_code=422, detail="Could not read that file as a receipt photo.")

    items = receipt_parser.parse_receipt(text)

    return {"text": text, "items": items}
