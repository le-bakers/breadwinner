import os
import base64
import requests
from dotenv import load_dotenv

load_dotenv()  # reads backend/.env and loads the key into memory

API_KEY = os.getenv("GOOGLE_VISION_API_KEY")
VISION_URL = f"https://vision.googleapis.com/v1/images:annotate?key={API_KEY}"


def extract_text_from_receipt(image_path):
    with open(image_path, "rb") as image_file:
        image_bytes = image_file.read()

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

    response = requests.post(VISION_URL, json=request_body)
    response.raise_for_status()  # stops here with a clear error if the key/request is bad
    result = response.json()

    annotations = result["responses"][0]
    if "fullTextAnnotation" not in annotations:
        return ""  # Google found no readable text in the image

    return annotations["fullTextAnnotation"]["text"]


if __name__ == "__main__":
    text = extract_text_from_receipt("sample_receipt.jpg")
    print(text)
