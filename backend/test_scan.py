# Run with:  cd backend  then  python -m pytest
# These run offline. test_receipt.png is a computer-drawn fake receipt, not a real photo.
# Gemini is never really called: conftest.py blocks it, and the Gemini tests below use pretend replies.

import io
import json

import pytest
import requests
from fastapi.testclient import TestClient
from PIL import Image

import gemini
import gf_detect
import server
from ocr import enlarge_small_photo, group_into_rows
from receipt_parser import find_subtotal, parse_receipt
from server import app
from unit_price import calculate_deduction, parse_size

client = TestClient(app, headers={"Authorization": "Bearer test-session-not-a-real-token"})


# ---------- receipt_parser ----------

def test_kroger_receipt_upc_on_its_own_line():
    text = """Kroger
UDIS GF WHT BREAD 6.49 F
0069899781101
BANANAS 1.12 F
SC KROGER PLUS SAVINGS 0.50-
TAX 0.00
**** BALANCE 7.11
VISA 7.11"""
    assert parse_receipt(text) == [
        {"name": "UDIS GF WHT BREAD", "price": 6.49, "upc": "0069899781101", "unsure": False},
        {"name": "BANANAS", "price": 1.12, "upc": None, "unsure": False},
    ]


def test_walmart_receipt_upc_inside_the_line():
    text = """GV WHT BREAD 007874237003 F 1.48 O
SCHAR PASTA 081075702012 F 4.98 N
SUBTOTAL 6.46
TOTAL 6.46"""
    assert parse_receipt(text) == [
        {"name": "GV WHT BREAD", "price": 1.48, "upc": "007874237003", "unsure": False},
        {"name": "SCHAR PASTA", "price": 4.98, "upc": "081075702012", "unsure": False},
    ]


def test_target_receipt_store_code_is_not_a_upc():
    text = """GROCERY
071050123 UDIS BREAD NF $6.49
284050001 MP PASTA NF $1.29
SUBTOTAL $7.78"""
    assert parse_receipt(text) == [
        {"name": "UDIS BREAD NF", "price": 6.49, "upc": None, "unsure": False},
        {"name": "MP PASTA NF", "price": 1.29, "upc": None, "unsure": False},
    ]


def test_discount_with_minus_in_front_is_not_an_item():
    assert parse_receipt("MFR COUPON -1.00\nSTORE CPN $ -0.50\nGF PRETZELS 3.99") == [
        {"name": "GF PRETZELS", "price": 3.99, "upc": None, "unsure": False},
    ]


def test_misread_total_is_not_an_item_but_similar_foods_are():
    # The OCR sometimes gets one letter wrong: TOTAI instead of TOTAL
    text = "TOTAI 18.18\nSUBTOTAI 18.18\nCASHEW HALVES 7.99\nWAX PAPER 2.49\nORANGE JUICE 3.99"
    assert [item["name"] for item in parse_receipt(text)] == ["CASHEW HALVES", "WAX PAPER", "ORANGE JUICE"]


def test_text_with_no_items_gives_empty_list():
    assert parse_receipt("THANK YOU FOR SHOPPING\n04/12/2026 3:15 PM") == []


# Taken from a real Trader Joe's receipt photo (2026-10-08). The reader saw 0.98 as 06.08.
MISREAD_PRICE = """BEANS GARBANZO 0.89
(?) GROCERY NON TAXABLE 06.08
2@ 0.49
BANANAS ORGANIC 0.87
3EA @ 0.29/EA
SUBTOTAL $2.74
TOTAL $2.74"""


def test_misread_price_is_fixed_when_the_quantity_line_makes_the_subtotal_add_up():
    assert find_subtotal(MISREAD_PRICE) == 2.74
    assert parse_receipt(MISREAD_PRICE) == [
        {"name": "BEANS GARBANZO", "price": 0.89, "upc": None, "unsure": False},
        {"name": "GROCERY NON TAXABLE", "price": 0.98, "upc": None, "unsure": True},
        {"name": "BANANAS ORGANIC", "price": 0.87, "upc": None, "unsure": False},
    ]


def test_quantity_line_is_ignored_when_it_does_not_make_the_subtotal_add_up():
    # Here the quantity line is the misread one (8.49 instead of 0.49), so the printed price stays
    text = "BEANS GARBANZO 0.89\nGROCERY NON TAXABLE 0.98\n2 @ 8.49\nSUBTOTAL 1.87"
    assert [item["price"] for item in parse_receipt(text)] == [0.89, 0.98]

    # And with no subtotal there is nothing to check against, so nothing is changed
    text = "GROCERY NON TAXABLE 6.08\n2 @ 0.49"
    assert [item["price"] for item in parse_receipt(text)] == [6.08]


def test_subtotal_is_not_reported_when_the_receipt_has_a_discount():
    assert find_subtotal("BREAD 6.49\nSUB TOTAL 6.49") == 6.49
    assert find_subtotal("BREAD 6.49\nSTORE COUPON 1.00-\nSUBTOTAL 5.49") is None
    assert find_subtotal("BREAD 6.49\nTOTAL 6.49") is None


# ---------- ocr: grouping text pieces into rows ----------

def piece(text, left, right, middle, rise=0):
    """A fake piece of OCR text, 34 tall. rise = how much lower its right end is."""
    return {
        "text": text, "left": left, "center": (left + right) / 2, "width": right - left,
        "middle": middle, "height": 34, "rise": rise, "sure": True,
    }


def test_tilted_photo_keeps_each_item_on_its_own_row():
    # Measured from a real restaurant receipt photo (2026-10-04): rows are only 27 apart
    # and each price sits about 7 lower than its name. The old code glued Lunch and Coke together.
    pieces = [
        piece("1 Coffee", 163, 266, 547.5, rise=2), piece("3.00", 588, 647, 553.5),
        piece("2 Lunch", 159, 254, 575, rise=3), piece("45.90", 576, 649, 582),
        piece("1 Coke", 159, 240, 602, rise=3), piece("3.00", 589, 649, 610),
    ]
    assert group_into_rows(pieces) == "1 Coffee 3.00\n2 Lunch 45.90\n1 Coke 3.00"


def test_row_with_a_shaky_piece_is_marked_unsure():
    shaky_name = piece("A R-ED", 160, 400, 100)
    shaky_name["sure"] = False
    pieces = [shaky_name, piece("0.99", 590, 650, 100), piece("BANANAS", 160, 300, 140), piece("0.87", 590, 650, 140)]
    assert group_into_rows(pieces) == "(?) A R-ED 0.99\nBANANAS 0.87"


def test_small_photo_is_enlarged_and_a_big_one_is_not():
    enlarged = Image.open(io.BytesIO(enlarge_small_photo(photo_bytes(600, 800))))
    assert enlarged.size == (1500, 2000)
    assert enlarge_small_photo(photo_bytes(3000, 4000)) is None


# ---------- reading a small photo a second time, enlarged ----------

CLEAN_READING = "BEANS GARBANZO 0.89\nA-PEPPER BELL EACH XL RED 0.99\nSUBTOTAL 1.88"
SHAKY_READING = "BEANS GARBANZO 0.89\n(?) A R-ED 0.99\nSUBTOTAL 1.88"
WRONG_READING = "BEANS GARBANZO 0.89\nA-PEPPER BELL EACH XL RED 9.99\nSUBTOTAL 1.88"


def use_pretend_ocr(monkeypatch, texts):
    """Make the local reader give these texts, one per read. Returns the list of photos it was asked to read."""
    photos = []

    def pretend_extract_text(image_bytes):
        photos.append(image_bytes)
        return texts[len(photos) - 1]

    monkeypatch.setattr(server.ocr, "extract_text", pretend_extract_text)
    return photos


def test_shaky_reading_of_a_small_photo_is_replaced_by_a_better_enlarged_reading(monkeypatch):
    photos = use_pretend_ocr(monkeypatch, [SHAKY_READING, CLEAN_READING])
    items, subtotal = server.read_locally(photo_bytes(600, 800))

    assert len(photos) == 2
    assert [item["name"] for item in items] == ["BEANS GARBANZO", "A-PEPPER BELL EACH XL RED"]
    assert subtotal == 1.88


def test_enlarged_reading_is_thrown_away_when_it_is_worse(monkeypatch):
    use_pretend_ocr(monkeypatch, [SHAKY_READING, WRONG_READING])
    items, subtotal = server.read_locally(photo_bytes(600, 800))
    assert [item["price"] for item in items] == [0.89, 0.99]


def test_photo_is_read_only_once_when_the_first_reading_is_fine_or_the_photo_is_big(monkeypatch):
    photos = use_pretend_ocr(monkeypatch, [CLEAN_READING])
    server.read_locally(photo_bytes(600, 800))
    assert len(photos) == 1

    photos = use_pretend_ocr(monkeypatch, [SHAKY_READING])
    server.read_locally(photo_bytes(3000, 4000))
    assert len(photos) == 1


# ---------- unit_price ----------

def test_parse_size():
    assert parse_size("14 oz") == ("weight", 14 * 28.3495)
    assert parse_size("1 gal") == ("volume", 3785.41)
    assert parse_size("12 ct") == ("count", 12)
    assert parse_size("family size") is None
    assert parse_size(None) is None


def test_bread_is_scaled_to_the_gf_size():
    # 14 oz GF loaf at $6.49 vs 20 oz regular loaf at $3.49: $4.05, not the naive $3.00
    result = calculate_deduction(6.49, "14 oz", 3.49, "20 oz")
    assert result["deduction"] == 4.05
    assert result["sizes_comparable"] is True


def test_different_units_of_the_same_kind_still_compare():
    result = calculate_deduction(5.00, "1 lb", 2.00, "16 oz")
    assert result["deduction"] == 3.00
    assert result["sizes_comparable"] is True


def test_missing_or_mismatched_size_falls_back_and_is_flagged():
    assert calculate_deduction(6.49, None, 3.49, "20 oz") == {
        "deduction": 3.00, "scaled_regular_price": 3.49, "sizes_comparable": False,
    }
    assert calculate_deduction(6.49, "14 oz", 3.49, "12 ct")["sizes_comparable"] is False


def test_cheaper_gf_item_is_zero_not_negative():
    assert calculate_deduction(2.00, "14 oz", 3.49, "14 oz")["deduction"] == 0


def test_two_packages_on_one_receipt_line_count_twice():
    # 2 GF loaves for $12.98 is $6.49 each, and each one cost $4.05 extra
    assert calculate_deduction(12.98, "14 oz", 3.49, "20 oz", quantity=2)["deduction"] == 8.09


def test_sizes_typed_by_hand_are_understood():
    assert parse_size("14oz") == parse_size("14 ounces") == parse_size("14 OZ")
    assert parse_size("1.5 lbs") == ("weight", 1.5 * 453.592)


# ---------- gf_detect ----------

def guess(name, **extra):
    return gf_detect.add_guesses([{"name": name, **extra}])[0]


def test_gluten_free_brand_is_spotted_and_gets_a_regular_version_to_search():
    item = guess("UDI'S WHT BREAD")
    assert item["gf"] is True
    assert item["gf_reason"] == "Udi's is a gluten-free brand"
    assert item["regular_term"] == "white bread"


def test_gluten_free_label_is_spotted():
    for name in ["GF PASTA PENNE", "G/F ROTINI", "Gluten Free Bagels", "GLTN FREE CRACKERS"]:
        assert guess(name)["gf_reason"] == "The receipt line says gluten-free"
    assert guess("GF PASTA PENNE")["regular_term"] == "penne pasta"
    assert guess("GF ROLLED OATS")["regular_term"] == "oats"


def test_ordinary_items_are_not_marked_gluten_free():
    # GV is Walmart's Great Value brand, and "GF" hiding inside a longer word does not count
    for name in ["GV WHT BREAD", "BANANAS", "KRO 2% MILK GAL", "EGGFREE MAYO"]:
        item = guess(name)
        assert item["gf"] is False
        assert item["gf_reason"] is None
        assert item["regular_term"] is None


def test_unknown_gluten_free_food_has_no_search_suggestion():
    item = guess("GF XANTHAN GUM")
    assert item["gf"] is True
    assert item["regular_term"] is None


def test_gemini_opinion_is_used_when_the_lists_find_nothing():
    item = guess("CYN BKHSE 7GRN", plain_name="Seven grain loaf", gf=True, regular_term="multigrain bread")
    assert item["gf_reason"] == "AI guess from the product name"
    assert item["regular_term"] == "multigrain bread"

    # Gemini's plain-English name can also reveal a brand the receipt abbreviated
    item = guess("CYN BKHSE 7GRN", plain_name="Canyon Bakehouse 7-grain bread", gf=False)
    assert item["gf_reason"] == "Canyon Bakehouse is a gluten-free brand"
    assert item["regular_term"] == "white bread"


# ---------- GET /deduction ----------

def test_deduction_does_the_bread_math():
    response = client.get("/deduction", params={
        "gf_price": 6.49, "gf_size": "14 oz", "regular_price": 3.49, "regular_size": "20 oz",
    })
    assert response.json() == {
        "deduction": 4.05, "scaled_regular_price": 2.44, "sizes_comparable": True, "warnings": [],
    }


def test_deduction_warns_when_sizes_are_missing_or_nothing_is_counted():
    no_sizes = client.get("/deduction", params={"gf_price": 6.49, "regular_price": 3.49}).json()
    assert no_sizes["deduction"] == 3.00
    assert len(no_sizes["warnings"]) == 1 and "sizes" in no_sizes["warnings"][0]

    cheaper = client.get("/deduction", params={
        "gf_price": 2.00, "gf_size": "14 oz", "regular_price": 3.49, "regular_size": "14 oz",
    }).json()
    assert cheaper["deduction"] == 0
    assert len(cheaper["warnings"]) == 1 and "nothing is counted" in cheaper["warnings"][0]


def test_item_with_no_regular_version_counts_in_full():
    result = client.get("/deduction", params={"gf_price": 8.99}).json()
    assert result["deduction"] == 8.99
    assert len(result["warnings"]) == 1


def test_deduction_rejects_prices_and_quantities_that_make_no_sense():
    for params in [
        {"gf_price": 0, "regular_price": 3.49},
        {"gf_price": 6.49, "regular_price": 1000},
        {"gf_price": 6.49, "regular_price": 3.49, "quantity": 0},
        {"gf_price": "nan", "regular_price": 3.49},
    ]:
        assert client.get("/deduction", params=params).status_code == 422


# ---------- GET /kroger/search (pretend Kroger, nothing is sent) ----------

def test_kroger_search_rejects_a_bad_zip_without_asking_kroger():
    assert client.get("/kroger/search", params={"zip": "4520", "term": "bread"}).status_code == 422


def test_kroger_search_says_so_when_kroger_is_down(monkeypatch):
    def kroger_is_down(zip_code):
        raise requests.ConnectionError()

    monkeypatch.setattr(server.kroger, "find_nearest_location", kroger_is_down)
    assert client.get("/kroger/search", params={"zip": "45202", "term": "bread"}).status_code == 502


def test_kroger_search_gives_three_products_and_skips_ones_with_no_price(monkeypatch):
    products = [{"name": f"Bread {n}", "size": "20 oz", "price": price, "promo_price": 0}
                for n, price in enumerate([None, 2.49, 0, 3.49, 1.99, 4.29])]
    monkeypatch.setattr(server.kroger, "find_nearest_location", lambda zip_code: "01400943")
    monkeypatch.setattr(server.kroger, "search_products", lambda term, location_id, limit: products)

    results = client.get("/kroger/search", params={"zip": "45202", "term": "bread"}).json()["results"]
    assert [product["price"] for product in results] == [2.49, 3.49, 1.99]


# ---------- GET /suggest (pretend Kroger, nothing is sent) ----------

def product(name, size, price, promo_price=0):
    return {"name": name, "size": size, "price": price, "promo_price": promo_price}


def use_pretend_kroger(monkeypatch, shelves):
    """Make Kroger answer each search term with the products listed for it. Returns the terms it was asked."""
    asked = []

    def pretend_search(term, location_id, limit):
        asked.append(term)
        return shelves.get(term, [])

    monkeypatch.setattr(server.kroger, "find_nearest_location", lambda zip_code: "01400943")
    monkeypatch.setattr(server.kroger, "search_products", pretend_search)
    return asked


BREAD_LINE = {"zip": "45202", "term": "white bread", "gf_name": "Udi's gluten-free white bread", "gf_price": 6.49}


def test_suggest_fills_in_the_whole_bread_comparison(monkeypatch):
    use_pretend_kroger(monkeypatch, {
        "white bread": [product("Kroger White Bread", "20 oz", 3.49), product("Fancy White Bread", "24 oz", 4.99)],
        "Udi's gluten-free white bread": [product("Udi's GF Bagels", "14 oz", 5.99), product("Udi's GF White Bread", "14 oz", 6.49)],
    })
    assert client.get("/suggest", params=BREAD_LINE).json() == {
        "regular": product("Kroger White Bread", "20 oz", 3.49), "gf_size": "14 oz",
        "deduction": 4.05, "scaled_regular_price": 2.44, "sizes_comparable": True, "warnings": [],
    }


def test_suggest_does_not_guess_a_size_when_no_kroger_price_matches_the_receipt(monkeypatch):
    use_pretend_kroger(monkeypatch, {
        "white bread": [product("Kroger White Bread", "20 oz", 3.49)],
        "Udi's gluten-free white bread": [product("Udi's GF White Bread", "14 oz", 7.29)],
    })
    result = client.get("/suggest", params=BREAD_LINE).json()
    assert result["gf_size"] == ""
    assert result["deduction"] == 3.00
    assert result["sizes_comparable"] is False and len(result["warnings"]) == 1


def test_suggest_matches_a_sale_price_and_a_line_for_two_packages(monkeypatch):
    use_pretend_kroger(monkeypatch, {
        "white bread": [product("Kroger White Bread", "20 oz", 3.49)],
        "Udi's gluten-free white bread": [product("Udi's GF White Bread", "14 oz", 7.29, promo_price=6.49)],
    })
    result = client.get("/suggest", params={**BREAD_LINE, "gf_price": 12.98, "quantity": 2}).json()
    assert result["gf_size"] == "14 oz"
    assert result["deduction"] == 8.09


def test_suggest_prefers_a_regular_product_whose_size_can_be_compared(monkeypatch):
    use_pretend_kroger(monkeypatch, {
        # The cheapest one is last and must not be picked just for being cheap
        "white bread": [product("Dinner Rolls", "6 ct", 2.99), product("Kroger White Bread", "20 oz", 3.49),
                        product("Value White Bread", "20 oz", 1.29)],
        "Udi's gluten-free white bread": [product("Udi's GF White Bread", "14 oz", 6.49)],
    })
    assert client.get("/suggest", params=BREAD_LINE).json()["regular"]["name"] == "Kroger White Bread"


def test_suggest_gives_nothing_when_kroger_finds_no_regular_version(monkeypatch):
    use_pretend_kroger(monkeypatch, {})
    assert client.get("/suggest", params=BREAD_LINE).json() == {"regular": None}


def test_suggest_rejects_bad_input_without_asking_kroger(monkeypatch):
    asked = use_pretend_kroger(monkeypatch, {})
    for change in [{"zip": "4520"}, {"gf_price": 0}, {"quantity": 0}]:
        assert client.get("/suggest", params={**BREAD_LINE, **change}).status_code == 422
    assert asked == []


def test_suggest_says_so_when_there_is_no_store_or_kroger_is_down(monkeypatch):
    monkeypatch.setattr(server.kroger, "find_nearest_location", lambda zip_code: None)
    assert client.get("/suggest", params=BREAD_LINE).status_code == 404

    def kroger_is_down(zip_code):
        raise requests.ConnectionError()

    monkeypatch.setattr(server.kroger, "find_nearest_location", kroger_is_down)
    assert client.get("/suggest", params=BREAD_LINE).status_code == 502


def test_suggest_still_works_when_the_size_lookup_fails(monkeypatch):
    def pretend_search(term, location_id, limit):
        if term == "white bread":
            return [product("Kroger White Bread", "20 oz", 3.49)]
        raise requests.ConnectionError()

    monkeypatch.setattr(server.kroger, "find_nearest_location", lambda zip_code: "01400943")
    monkeypatch.setattr(server.kroger, "search_products", pretend_search)

    result = client.get("/suggest", params=BREAD_LINE).json()
    assert result["regular"]["name"] == "Kroger White Bread"
    assert result["gf_size"] == ""


def test_kroger_is_never_sent_a_search_it_would_refuse(monkeypatch):
    # Kroger answers "error 400" to more than 8 words, and to fewer than 3 letters
    asked = use_pretend_kroger(monkeypatch, {"white bread": [product("Kroger White Bread", "20 oz", 3.49)]})

    long_name = "Udi's gluten free soft white sandwich bread loaf family size"
    assert client.get("/suggest", params={**BREAD_LINE, "gf_name": long_name}).status_code == 200
    assert asked == ["white bread", "Udi's gluten free soft white sandwich bread loaf"]

    asked.clear()
    assert client.get("/suggest", params={**BREAD_LINE, "gf_name": "GF"}).status_code == 200
    assert asked == ["white bread"]


def test_nearest_store_is_only_looked_up_once_per_zip(monkeypatch):
    class StoreReply:
        def raise_for_status(self):
            pass

        def json(self):
            return {"data": [{"locationId": "01400943"}]}

    asked = []

    def pretend_get(url, headers, params, timeout):
        asked.append(params["filter.zipCode.near"])
        return StoreReply()

    monkeypatch.setattr(server.kroger, "get_access_token", lambda: "pretend-token")
    monkeypatch.setattr(server.kroger.requests, "get", pretend_get)
    server.kroger.find_nearest_location.cache_clear()

    assert server.kroger.find_nearest_location("45202") == "01400943"
    assert server.kroger.find_nearest_location("45202") == "01400943"
    assert asked == ["45202"]


# ---------- POST /scan ----------

def test_scan_reads_items_from_a_receipt_image():
    with open("test_receipt.png", "rb") as image_file:
        response = client.post("/scan", files={"file": image_file})
    assert response.status_code == 200
    assert response.json()["engine"] == "local"

    items = response.json()["items"]
    assert items[0] == {
        "name": "UDIS GF WHT BREAD", "price": 6.49, "upc": "0069899781101", "unsure": False,
        "plain_name": None, "gf": True, "gf_reason": "Udi's is a gluten-free brand", "regular_term": "white bread",
        "quantity": 1,
    }
    assert [(item["name"], item["price"], item["gf"], item["regular_term"]) for item in items] == [
        ("UDIS GF WHT BREAD", 6.49, True, "white bread"),
        ("KRO 2% MILK GAL", 3.29, False, None),
        ("BANANAS", 1.12, False, None),
        ("SCHAR GF PASTA PENNE", 4.99, True, "penne pasta"),
        ("KRO LRG EGGS 12CT", 2.79, False, None),
    ]


def test_scan_rejects_a_file_that_is_not_an_image():
    response = client.post("/scan", files={"file": ("notes.txt", b"this is not a picture")})
    assert response.status_code == 415


def test_scan_rejects_an_empty_file():
    response = client.post("/scan", files={"file": ("empty.png", b"")})
    assert response.status_code == 400


# ---------- gemini (pretend replies only, nothing is sent to Google) ----------

class PretendReply:
    def __init__(self, status_code, data):
        self.status_code = status_code
        self.data = data

    def json(self):
        return self.data


def gemini_answer(items, subtotal=0):
    """What Google sends back when Gemini read the receipt."""
    text = json.dumps({"items": items, "subtotal": subtotal})
    return PretendReply(200, {"candidates": [{"content": {"parts": [{"text": text}]}}]})


def cleaned(name, price, upc=None, plain_name=None, gf=False, regular_term=None, quantity=1):
    """One item the way gemini.py hands it on."""
    return {"name": name, "price": price, "quantity": quantity, "upc": upc, "unsure": False,
            "plain_name": plain_name, "gf": gf, "regular_term": regular_term}


OUT_OF_REQUESTS = PretendReply(429, {"error": {"message": "You exceeded your current quota."}})


def use_pretend_gemini(monkeypatch, replies):
    """Make gemini.py get these replies, one per request. Returns the list of addresses it asked."""
    asked = []

    def pretend_post(url, json, headers, timeout):
        asked.append(url)
        return replies[len(asked) - 1]

    monkeypatch.setattr(gemini, "API_KEY", "not-a-real-key")
    monkeypatch.setattr(gemini.requests, "post", pretend_post)
    return asked


def photo_bytes(width, height):
    buffer = io.BytesIO()
    Image.new("RGB", (width, height), "white").save(buffer, format="PNG")
    return buffer.getvalue()


def test_gemini_answer_is_cleaned_up(monkeypatch):
    use_pretend_gemini(monkeypatch, [gemini_answer([
        {"name": " UDIS GF WHT BREAD ", "price": 6.489, "upc": "0069899781101", "quantity": 2,
         "plain_name": " Udi's gluten-free white bread ", "gluten_free": True, "regular_version": "white bread"},
        {"name": "BANANAS", "price": 1.12, "upc": "", "plain_name": "", "gluten_free": False, "regular_version": "",
         "quantity": 0},  # a quantity that makes no sense counts as 1
        {"name": "EGGS", "price": 2.79, "upc": "not a barcode", "gluten_free": "yes"},  # sloppy answer
        {"name": "", "price": 2.00, "upc": None},          # no name
        {"name": "FREE SAMPLE", "price": 0, "upc": None},  # no price
        {"name": "MILK", "price": "3.29", "upc": None},    # price is text, not a number
    ], subtotal=10.40)])

    items, subtotal = gemini.read_receipt(photo_bytes(40, 80))
    assert items == [
        cleaned("UDIS GF WHT BREAD", 6.49, upc="0069899781101", quantity=2,
                plain_name="Udi's gluten-free white bread", gf=True, regular_term="white bread"),
        cleaned("BANANAS", 1.12),
        cleaned("EGGS", 2.79),
    ]
    assert subtotal == 10.40


def test_gemini_is_asked_for_json_the_way_google_accepts_it(monkeypatch):
    sent = {}

    def pretend_post(url, json, headers, timeout):
        sent.update(json)
        return gemini_answer([])

    monkeypatch.setattr(gemini, "API_KEY", "not-a-real-key")
    monkeypatch.setattr(gemini.requests, "post", pretend_post)

    assert gemini.read_receipt(photo_bytes(40, 80)) == ([], None)  # a subtotal of 0 means "none"
    # "application/json" here is refused by Google with error 400 (seen 2026-10-12)
    assert sent["generationConfig"]["responseFormat"]["text"]["mimeType"] == "APPLICATION_JSON"


def test_gemini_uses_the_second_model_when_the_first_is_out_of_requests(monkeypatch):
    bread = {"name": "BREAD", "price": 6.49, "upc": None}
    asked = use_pretend_gemini(monkeypatch, [OUT_OF_REQUESTS, gemini_answer([bread]), gemini_answer([bread])])

    assert gemini.read_receipt(photo_bytes(40, 80)) == ([cleaned("BREAD", 6.49)], None)
    assert gemini.MODELS[0] in asked[0] and gemini.MODELS[1] in asked[1]

    # The first model is now resting, so the next scan goes straight to the second one
    gemini.read_receipt(photo_bytes(40, 80))
    assert len(asked) == 3 and gemini.MODELS[1] in asked[2]


def test_gemini_stops_at_the_daily_limit(monkeypatch):
    asked = use_pretend_gemini(monkeypatch, [gemini_answer([])])
    monkeypatch.setattr(gemini, "DAILY_LIMIT", 1)

    gemini.read_receipt(photo_bytes(40, 80))
    with pytest.raises(gemini.GeminiUnavailable):
        gemini.read_receipt(photo_bytes(40, 80))
    assert len(asked) == 1


def test_gemini_refusal_shows_googles_reason_code():
    blocked = PretendReply(403, {"error": {"message": "Requests are blocked.", "status": "PERMISSION_DENIED",
                                           "details": [{"reason": "API_KEY_SERVICE_BLOCKED"}]}})
    assert gemini.error_message(blocked) == "[API_KEY_SERVICE_BLOCKED] Requests are blocked."

    # No exact cause given: the general word is shown instead
    no_credits = PretendReply(402, {"error": {"message": "Credits are depleted.", "status": "FAILED_PRECONDITION"}})
    assert gemini.error_message(no_credits) == "[FAILED_PRECONDITION] Credits are depleted."

    assert gemini.error_message(OUT_OF_REQUESTS) == "You exceeded your current quota."
    assert gemini.error_message(PretendReply(500, {})) == "no details given"
    assert gemini.error_message(PretendReply(500, {"error": "broken"})) == "no details given"


def test_gemini_without_a_key_sends_nothing():
    with pytest.raises(gemini.GeminiUnavailable):
        gemini.read_receipt(photo_bytes(40, 80))


def test_big_photo_is_shrunk_before_sending():
    small = Image.open(io.BytesIO(gemini.prepare_photo(photo_bytes(3000, 6000))))
    assert small.format == "JPEG"
    assert small.size == (1536, 3072)


def test_scan_uses_gemini_when_it_is_switched_on(monkeypatch):
    monkeypatch.setattr(server, "CLOUD_OCR_APPROVED", True)
    use_pretend_gemini(monkeypatch, [gemini_answer([
        {"name": "UDIS WHT BRD", "price": 6.49, "upc": "", "plain_name": "Udi's white bread",
         "gluten_free": True, "regular_version": "white sandwich bread"},
        {"name": "BANANAS", "price": 1.12, "upc": "", "plain_name": "Bananas",
         "gluten_free": False, "regular_version": ""},
    ], subtotal=7.61)])
    monkeypatch.setattr(server, "OCR_ENGINE", "gemini")

    with open("test_receipt.png", "rb") as image_file:
        response = client.post("/scan", files={"file": image_file})
    assert response.json() == {"engine": "gemini", "subtotal": 7.61, "items": [
        {"name": "UDIS WHT BRD", "price": 6.49, "quantity": 1, "upc": None, "unsure": False,
         "plain_name": "Udi's white bread",
         "gf": True, "gf_reason": "Udi's is a gluten-free brand", "regular_term": "white sandwich bread"},
        {"name": "BANANAS", "price": 1.12, "quantity": 1, "upc": None, "unsure": False, "plain_name": "Bananas",
         "gf": False, "gf_reason": None, "regular_term": None},
    ]}


def test_scan_falls_back_to_the_local_reader_when_gemini_is_out_of_requests(monkeypatch):
    monkeypatch.setattr(server, "CLOUD_OCR_APPROVED", True)
    asked = use_pretend_gemini(monkeypatch, [OUT_OF_REQUESTS, OUT_OF_REQUESTS])
    monkeypatch.setattr(server, "OCR_ENGINE", "gemini")

    with open("test_receipt.png", "rb") as image_file:
        response = client.post("/scan", files={"file": image_file})
    assert len(asked) == 2
    assert response.json()["engine"] == "local"
    assert len(response.json()["items"]) == 5


def test_scan_does_not_spend_a_gemini_request_on_a_file_that_is_not_an_image(monkeypatch):
    asked = use_pretend_gemini(monkeypatch, [])
    monkeypatch.setattr(server, "OCR_ENGINE", "gemini")

    response = client.post("/scan", files={"file": ("notes.txt", b"this is not a picture")})
    assert response.status_code == 415
    assert asked == []
