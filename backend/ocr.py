import os
import base64
import requests
from dotenv import load_dotenv

load_dotenv()  

# Which OCR to use: "local" (free, runs on this computer) or "google" (needs billing turned on)
OCR_ENGINE = os.getenv("OCR_ENGINE", "local")

API_KEY = os.getenv("GOOGLE_VISION_API_KEY")
VISION_URL = "https://vision.googleapis.com/v1/images:annotate"

_local_engine = None  

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

    # Each piece of text comes with a box: 4 corner points (each one is x, y)
    pieces = []
    for box, text in zip(result.boxes, result.txts):
        top_left, top_right, bottom_right, bottom_left = box
        pieces.append({
            "text": text,
            "left": top_left[0],
            "center": (top_left[0] + bottom_right[0]) / 2,
            "middle": (top_left[1] + bottom_right[1]) / 2,
            "height": bottom_left[1] - top_left[1],
            "width": top_right[0] - top_left[0],
            "rise": top_right[1] - top_left[1],  # how much lower the right end is than the left end
        })

    return group_into_rows(pieces)


def straighten(pieces):
    """A photo is almost never perfectly level, so a price on the right sits a little
    lower (or higher) than its item name on the left. Measure that tilt and undo it."""
    total_width = sum(piece["width"] for piece in pieces)
    if total_width <= 0:
        return

    tilt = sum(piece["rise"] for piece in pieces) / total_width
    for piece in pieces:
        piece["middle"] = piece["middle"] - tilt * piece["center"]


def group_into_rows(pieces):
    """The OCR reads an item name and its price as two separate pieces.
    Pieces at about the same height on the page belong to the same row."""
    straighten(pieces)
    pieces.sort(key=lambda piece: piece["middle"])

    rows = []
    for piece in pieces:
        last_row = rows[-1] if rows else None
        if last_row and abs(piece["middle"] - last_row[0]["middle"]) < piece["height"] * 0.6:
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
    response.raise_for_status()  
    result = response.json()

    annotations = result["responses"][0]
    if "fullTextAnnotation" not in annotations:
        return ""  

    return annotations["fullTextAnnotation"]["text"]


if __name__ == "__main__":
    with open("sample_receipt.jpg", "rb") as image_file:
        print(extract_text(image_file.read()))
