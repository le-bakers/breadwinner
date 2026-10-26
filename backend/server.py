import io
import os
import re

import requests
from fastapi import FastAPI, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from PIL import Image

import gemini
import gluten
import kroger
import ocr
import receipt
import units

ENGINE = os.getenv("OCR_ENGINE", "gemini")
LOW, HIGH = 0.01, 999.99
MAX_BYTES = 10 * 1024 * 1024
MAX_PIXELS = 50_000_000
FORMATS = ("JPEG", "PNG", "WEBP")
MATCH, UNKNOWN, MISMATCH = 0, 1, 2

app = FastAPI()
app.add_middleware(CORSMiddleware, allow_origins=["*"], allow_methods=["GET", "POST"], allow_headers=["*"])


@app.get("/")
def health():
    """Tell the website the server is awake"""
    return {"status": "ok"}


def zipcode(zip):
    """Reject anything that is not a five-digit zip code"""
    if not (zip.isdigit() and len(zip) == 5):
        raise HTTPException(422, "Type a 5-digit zip code.")


def limits(prices, quantity):
    """Reject prices or quantities outside the allowed range"""
    for price in prices:
        if not LOW <= price <= HIGH:
            raise HTTPException(422, "Prices must be between $0.01 and $999.99.")
    if not 1 <= quantity <= 99:
        raise HTTPException(422, "How many you bought must be between 1 and 99.")


@app.get("/kroger/search")
def search(zip: str, term: str):
    """Return the top three priced products for a search at the nearest Kroger-family store"""
    zipcode(zip)

    try:
        location = kroger.store(zip)
        products = priced(term, location) if location else []
    except requests.RequestException as error:
        print(f"Kroger search failed: {error}")
        raise HTTPException(502, "Kroger could not be reached right now.")

    if location is None:
        raise HTTPException(404, "No Kroger-banner store near that zip code.")

    return {"location_id": location, "results": products[:3]}


def priced(term, location):
    """Search one store and keep only products with a regular shelf price"""
    term = " ".join(term.split()[:8])
    if len(term) < 3:
        return []
    return [product for product in kroger.search(term, location, limit=10) if product["price"]]


@app.get("/deduction")
def deduction(gf_price: float, gf_size: str = "", quantity: int = 1,
              regular_price: float = None, regular_size: str = ""):
    """Work out the extra cost of one gluten-free line with warnings worth a second look"""
    limits([gf_price] if regular_price is None else [gf_price, regular_price], quantity)

    if regular_price is None:
        return {
            "deduction": round(gf_price, 2),
            "scaled_regular_price": 0,
            "sizes_comparable": True,
            "warnings": ["Counted in full, because you said no regular version of this item exists."],
        }

    result = units.deduct(gf_price, gf_size, regular_price, regular_size, quantity)
    result["warnings"] = []
    if not result["sizes_comparable"]:
        result["warnings"].append(
            "The package sizes could not be compared, so the full prices were compared instead. "
            "Add both sizes (like 14 oz and 20 oz) for a fairer number."
        )
    if result["deduction"] == 0:
        result["warnings"].append("The regular version costs the same or more, so nothing is counted for this item.")

    return result


@app.get("/suggest")
def suggest(zip: str, term: str, gf_price: float, gf_name: str = "", quantity: int = 1, gf_size_guess: str = ""):
    """Draft a comparison for one gluten-free line that the user approves or changes"""
    zipcode(zip)
    limits([gf_price], quantity)

    try:
        location = kroger.store(zip)
        if location is None:
            raise HTTPException(404, "No Kroger-banner store near that zip code.")
        regulars = priced(term, location)[:3]
    except requests.RequestException as error:
        print(f"Kroger suggest failed: {error}")
        raise HTTPException(502, "Kroger could not be reached right now.")

    try:
        listings = priced(gf_name, location)
    except requests.RequestException:
        listings = []

    if not regulars:
        return {"regular": None}

    size = same_price(listings, gf_price / quantity) or same_name(listings, gf_name)
    if not size and units.size(gf_size_guess):
        size = gf_size_guess.strip()
    regular = pick(regulars, size)

    result = deduction(gf_price, size, quantity, regular["price"], regular["size"] or "")
    result["regular"] = regular
    result["gf_size"] = size
    return result


def same_price(products, price):
    """Return the size of a listing sold at exactly the receipt price or an empty string"""
    for product in products:
        for amount in [product["price"], product["promo_price"]]:
            if amount and product["size"] and abs(amount - price) < 0.005:
                return product["size"]
    return ""


def same_name(products, name):
    """Return the one size shared by listings whose names hold every word of the item in order"""
    wanted = tokens(name)
    if len(wanted) < 2:
        return ""

    sizes = []
    for product in products:
        if ordered(tokens(product["name"]), wanted) and units.size(product["size"]):
            sizes.append(product["size"])

    if len({size.lower().strip() for size in sizes}) == 1:
        return sizes[0]
    return ""


def ordered(words, wanted):
    """Check that every wanted word appears among the words in the same order"""
    position = 0
    for word in words:
        if position < len(wanted) and word == wanted[position]:
            position += 1
    return position == len(wanted)


def tokens(name):
    """Split a product name into lowercase words with GF spelled out as gluten free"""
    name = (name or "").lower().replace("'", "").replace("’", "")
    words = []
    for word in re.findall(r"[a-z0-9]+", name):
        if word == "gf":
            words += ["gluten", "free"]
        else:
            words.append(word)
    return words


def pick(products, size):
    """Pick the best Kroger match whose size can be compared or else the top match"""
    wanted = units.size(size)
    if wanted:
        for product in products:
            found = units.size(product["size"])
            if found and found[0] == wanted[0]:
                return product
    return products[0]


def check(photo):
    """Reject a photo that is too big or not a picture or damaged before any reader sees it"""
    if len(photo) > MAX_BYTES:
        raise HTTPException(413, "That photo is too big. The limit is 10 MB.")

    try:
        image = Image.open(io.BytesIO(photo))
        kind = image.format
        huge = image.width * image.height > MAX_PIXELS
        if kind in FORMATS and not huge:
            image.load()
    except Exception:
        raise HTTPException(422, "Could not read that file as a receipt photo.")

    if kind not in FORMATS:
        raise HTTPException(415, "Use a JPEG, PNG or WebP photo.")
    if huge:
        raise HTTPException(413, "That photo has too many pixels. Use a smaller one.")


@app.post("/scan")
def scan(file: UploadFile):
    """Read a receipt photo into items with gluten-free guesses without saving the photo"""
    photo = file.file.read(MAX_BYTES + 1)
    if not photo:
        raise HTTPException(400, "The uploaded file was empty.")

    check(photo)

    try:
        engine, items, subtotal = read(photo)
    except Exception:
        raise HTTPException(422, "Could not read that file as a receipt photo.")

    gluten.guess(items)
    for item in items:
        item.setdefault("quantity", 1)

    return {"engine": engine, "items": items, "subtotal": subtotal}


def read(photo):
    """Read a photo with Gemini and fall back to the local reader when Gemini is unavailable"""
    if ENGINE == "gemini":
        try:
            items, subtotal = gemini.read(photo)
            return "gemini", items, subtotal
        except gemini.Unavailable as why:
            print(f"Gemini was skipped ({why}). Reading the photo on this computer instead.")

    items, subtotal = local(photo)
    return "local", items, subtotal


def local(photo):
    """Read a photo on this computer and retry it enlarged when the first reading looks shaky"""
    first = parse(ocr.read(photo))

    status, unsure = trouble(first)
    if status != MISMATCH and unsure == 0:
        return first

    bigger = ocr.enlarge(photo)
    if bigger is None:
        return first

    return min(first, parse(ocr.read(bigger)), key=trouble)


def parse(text):
    """Turn receipt text into its items and printed subtotal"""
    return receipt.parse(text), receipt.subtotal(text)


def trouble(reading):
    """Score a reading by whether it adds up to the subtotal and then by how many rows are unsure"""
    items, subtotal = reading
    total = round(sum(item["price"] for item in items), 2)
    unsure = sum(item["unsure"] for item in items)

    if subtotal is None:
        return UNKNOWN, unsure
    if total == subtotal:
        return MATCH, unsure
    return MISMATCH, unsure
