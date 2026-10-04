import os
import base64
import requests
from dotenv import load_dotenv

load_dotenv()  # reads backend/.env and loads the settings into memory

# Which OCR to use: "local" (free, runs on this computer) or "google" (needs billing turned on)
OCR_ENGINE = os.getenv("OCR_ENGINE", "local")

API_KEY = os.getenv("GOOGLE_VISION_API_KEY")
VISION_URL = "https://vision.googleapis.com/v1/images:annotate"

_local_engine = None  # the local OCR model is slow to load, so we load it once and reuse it


def extract_text(image_bytes):
    """Turn a receipt photo (raw bytes) into text, one receipt row per line."""
    if OCR_ENGINE == "google":
        return extract_text_google(image_bytes)
    return extract_text_local(image_bytes)


def extract_text_local(image_bytes):
    global _local_engine
    if _local_engine is None:
        from rapidocr import RapidOCR
        _local_engine = RapidOCR()

    result = _local_engine(image_bytes)
    if result.boxes is None:
        return ""  # no readable text in the image

    # Each piece of text comes with a box: 4 corner points, starting top-left
    pieces = []
    for box, text in zip(result.boxes, result.txts):
        top = box[0][1]
        bottom = box[2][1]
        pieces.append({
            "text": text,
            "left": box[0][0],
            "middle": (top + bottom) / 2,
            "height": bottom - top,
        })

    return group_into_rows(pieces)


def group_into_rows(pieces):
    """The OCR reads an item name and its price as two separate pieces.
    Pieces at about the same height on the page belong to the same row."""
    pieces.sort(key=lambda piece: piece["middle"])

    rows = []
    for piece in pieces:
        last_row = rows[-1] if rows else None
        if last_row and abs(piece["middle"] - last_row[-1]["middle"]) < piece["height"] * 0.6:
            last_row.append(piece)
        else:
            rows.append([piece])

    lines = []
    for row in rows:
        row.sort(key=lambda piece: piece["left"])
        lines.append(" ".join(piece["text"] for piece in row))

    return "\n".join(lines)


def extract_text_google(image_bytes):
    # NOT TESTED YET: Google returns 403 until billing is turned on for the project.
    # Google's API only accepts images as base64 text, not raw bytes
    image_base64 = base64.b64encode(image_bytes).decode("utf-8")

    request_body = {
        "requests": [
            {
                "image": {"content": image_base64},
                "features": [{"type": "TEXT_DETECTION"}],
            }
        ]
    }

    # The key goes in a header, not the URL, so an error message can never print it
    response = requests.post(
        VISION_URL,
        json=request_body,
        headers={"X-Goog-Api-Key": API_KEY},
        timeout=30,
    )
    response.raise_for_status()  # stops here with a clear error if the key/request is bad
    result = response.json()

    annotations = result["responses"][0]
    if "fullTextAnnotation" not in annotations:
        return ""  # Google found no readable text in the image

    return annotations["fullTextAnnotation"]["text"]


if __name__ == "__main__":
    with open("sample_receipt.jpg", "rb") as image_file:
        print(extract_text(image_file.read()))
