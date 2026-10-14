import os

import requests
from fastapi import FastAPI, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware

import gemini
import gf_detect
import kroger
import ocr
import receipt_parser
import unit_price

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
    if not (zip.isdigit() and len(zip) == 5):
        raise HTTPException(status_code=422, detail="Type a 5-digit zip code.")

    try:
        location_id = kroger.find_nearest_location(zip)
        products = priced_products(term, location_id) if location_id else []
    except requests.RequestException:
        raise HTTPException(status_code=502, detail="Kroger could not be reached right now.")

    if location_id is None:
        raise HTTPException(status_code=404, detail="No Kroger-banner store near that zip code.")

    return {"location_id": location_id, "results": products[:3]}


def priced_products(term, location_id):
    """Kroger's matches for a search at one store, best match first, leaving out products with no price."""
    # Ask for more than 3, because some products come back without a price at this store
    products = kroger.search_products(term, location_id, limit=10)

    # "price" is Kroger's regular shelf price, not a sale price. A sale would make the
    # regular item look cheaper than usual and the extra cost look bigger than it is.
    return [product for product in products if product["price"]]


LOWEST_PRICE, HIGHEST_PRICE = 0.01, 999.99


@app.get("/deduction")
def deduction(gf_price: float, gf_size: str = "", quantity: int = 1,
              regular_price: float = None, regular_size: str = ""):
    """The extra cost of one gluten-free receipt line, compared with the regular version.
    Leave regular_price out when no regular version exists. An organized estimate, not tax advice."""
    prices = [gf_price] if regular_price is None else [gf_price, regular_price]
    for price in prices:
        if not LOWEST_PRICE <= price <= HIGHEST_PRICE:
            raise HTTPException(status_code=422, detail="Prices must be between $0.01 and $999.99.")
    if not 1 <= quantity <= 99:
        raise HTTPException(status_code=422, detail="How many you bought must be between 1 and 99.")

    if regular_price is None:
        # Some gluten-free items have no regular version (xanthan gum), so the whole price is extra cost
        return {
            "deduction": round(gf_price, 2),
            "scaled_regular_price": 0,
            "sizes_comparable": True,
            "warnings": ["Counted in full, because you said no regular version of this item exists."],
        }

    result = unit_price.calculate_deduction(gf_price, gf_size, regular_price, regular_size, quantity)

    # Warnings never block anything. They tell the user which numbers deserve a second look.
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
def suggest(zip: str, term: str, gf_price: float, gf_name: str = "", quantity: int = 1):
    """A first guess at the comparison for one gluten-free receipt line, so the user only has to
    approve it or change it. The website never counts a suggestion until the user approves it.
    term is what to search for to find the regular version, gf_name is the gluten-free item itself."""
    if not (zip.isdigit() and len(zip) == 5):
        raise HTTPException(status_code=422, detail="Type a 5-digit zip code.")
    if not LOWEST_PRICE <= gf_price <= HIGHEST_PRICE:
        raise HTTPException(status_code=422, detail="Prices must be between $0.01 and $999.99.")
    if not 1 <= quantity <= 99:
        raise HTTPException(status_code=422, detail="How many you bought must be between 1 and 99.")

    try:
        location_id = kroger.find_nearest_location(zip)
        if location_id is None:
            raise HTTPException(status_code=404, detail="No Kroger-banner store near that zip code.")
        regular_products = priced_products(term, location_id)[:3]
        gf_products = priced_products(gf_name, location_id) if gf_name else []
    except requests.RequestException:
        raise HTTPException(status_code=502, detail="Kroger could not be reached right now.")

    if not regular_products:
        return {"regular": None}  # nothing to suggest, so the user compares this one by hand

    gf_size = size_of_same_priced_product(gf_products, gf_price / quantity)
    regular = pick_regular(regular_products, gf_size)

    result = deduction(gf_price, gf_size, quantity, regular["price"], regular["size"] or "")
    result["regular"] = regular
    result["gf_size"] = gf_size  # "" when it could not be found; the user types it in then
    return result


def size_of_same_priced_product(products, price_for_one):
    """The package size Kroger lists for the gluten-free item, or "" when we can't be sure.
    A product only counts as the same one when its Kroger price equals the price on the receipt.
    A size taken from the wrong product would quietly give a wrong number, so no match means no guess."""
    for product in products:
        for kroger_price in [product["price"], product["promo_price"]]:
            if kroger_price and product["size"] and abs(kroger_price - price_for_one) < 0.005:
                return product["size"]
    return ""


def pick_regular(products, gf_size):
    """Kroger's best match, unless only a lower match can be compared by size.
    (A 12 oz gluten-free loaf compares with a 20 oz loaf, not with a 6 ct pack of rolls.)
    The price is never used to choose: picking the cheapest would make the extra cost look bigger."""
    wanted = unit_price.parse_size(gf_size)
    if wanted:
        for product in products:
            size = unit_price.parse_size(product["size"])
            if size and size[0] == wanted[0]:
                return product
    return products[0]


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

    # Guess which items are gluten-free products. The website shows the guesses and the user corrects them.
    gf_detect.add_guesses(items)

    # How many packages each line is for. Only Gemini reads this off the receipt so far.
    for item in items:
        item.setdefault("quantity", 1)

    # "engine" says who read it ("gemini" or "local"), which helps when an item looks wrong.
    # "subtotal" is the receipt's own subtotal (or null). The website warns when the items don't add up to it.
    return {"engine": engine, "items": items, "subtotal": subtotal}


def read_items(image_bytes):
    """Returns who read the photo, the list of items they found, and the receipt's subtotal."""
    if OCR_ENGINE == "gemini":
        try:
            items, subtotal = gemini.read_receipt(image_bytes)
            return "gemini", items, subtotal
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
