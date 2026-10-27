import io
import json

import pytest
import requests
from fastapi.testclient import TestClient
from PIL import Image

import gemini
import gluten
import ocr
import receipt
import server
import units
from server import app

client = TestClient(app)


def test_kroger_receipt_upc_on_its_own_line():
    text = """Kroger
UDIS GF WHT BREAD 6.49 F
0069899781101
BANANAS 1.12 F
SC KROGER PLUS SAVINGS 0.50-
TAX 0.00
**** BALANCE 7.11
VISA 7.11"""
    assert receipt.parse(text) == [
        {"name": "UDIS GF WHT BREAD", "price": 6.49, "upc": "0069899781101", "unsure": False},
        {"name": "BANANAS", "price": 1.12, "upc": None, "unsure": False},
    ]


def test_walmart_receipt_upc_inside_the_line():
    text = """GV WHT BREAD 007874237003 F 1.48 O
SCHAR PASTA 081075702012 F 4.98 N
SUBTOTAL 6.46
TOTAL 6.46"""
    assert receipt.parse(text) == [
        {"name": "GV WHT BREAD", "price": 1.48, "upc": "007874237003", "unsure": False},
        {"name": "SCHAR PASTA", "price": 4.98, "upc": "081075702012", "unsure": False},
    ]


def test_target_receipt_store_code_is_not_a_upc():
    text = """GROCERY
071050123 UDIS BREAD NF $6.49
284050001 MP PASTA NF $1.29
SUBTOTAL $7.78"""
    assert receipt.parse(text) == [
        {"name": "UDIS BREAD NF", "price": 6.49, "upc": None, "unsure": False},
        {"name": "MP PASTA NF", "price": 1.29, "upc": None, "unsure": False},
    ]


def test_discount_with_minus_in_front_is_not_an_item():
    assert receipt.parse("MFR COUPON -1.00\nSTORE CPN $ -0.50\nGF PRETZELS 3.99") == [
        {"name": "GF PRETZELS", "price": 3.99, "upc": None, "unsure": False},
    ]


def test_misread_total_is_not_an_item_but_similar_foods_are():
    text = "TOTAI 18.18\nSUBTOTAI 18.18\nCASHEW HALVES 7.99\nWAX PAPER 2.49\nORANGE JUICE 3.99"
    assert [item["name"] for item in receipt.parse(text)] == ["CASHEW HALVES", "WAX PAPER", "ORANGE JUICE"]


def test_text_with_no_items_gives_empty_list():
    assert receipt.parse("THANK YOU FOR SHOPPING\n04/12/2026 3:15 PM") == []


MISREAD_PRICE = """BEANS GARBANZO 0.89
(?) GROCERY NON TAXABLE 06.08
2@ 0.49
BANANAS ORGANIC 0.87
3EA @ 0.29/EA
SUBTOTAL $2.74
TOTAL $2.74"""


def test_misread_price_is_fixed_when_the_quantity_line_makes_the_subtotal_add_up():
    assert receipt.subtotal(MISREAD_PRICE) == 2.74
    assert receipt.parse(MISREAD_PRICE) == [
        {"name": "BEANS GARBANZO", "price": 0.89, "upc": None, "unsure": False},
        {"name": "GROCERY NON TAXABLE", "price": 0.98, "upc": None, "unsure": True},
        {"name": "BANANAS ORGANIC", "price": 0.87, "upc": None, "unsure": False},
    ]


def test_quantity_line_is_ignored_when_it_does_not_make_the_subtotal_add_up():
    text = "BEANS GARBANZO 0.89\nGROCERY NON TAXABLE 0.98\n2 @ 8.49\nSUBTOTAL 1.87"
    assert [item["price"] for item in receipt.parse(text)] == [0.89, 0.98]

    text = "GROCERY NON TAXABLE 6.08\n2 @ 0.49"
    assert [item["price"] for item in receipt.parse(text)] == [6.08]


def test_subtotal_is_not_reported_when_the_receipt_has_a_discount():
    assert receipt.subtotal("BREAD 6.49\nSUB TOTAL 6.49") == 6.49
    assert receipt.subtotal("BREAD 6.49\nSTORE COUPON 1.00-\nSUBTOTAL 5.49") is None
    assert receipt.subtotal("BREAD 6.49\nTOTAL 6.49") is None


def piece(text, left, right, middle, rise=0):
    """Build a fake 34-pixel-tall piece of OCR text"""
    return {
        "text": text, "left": left, "center": (left + right) / 2, "width": right - left,
        "middle": middle, "height": 34, "rise": rise, "sure": True,
    }


def test_tilted_photo_keeps_each_item_on_its_own_row():
    pieces = [
        piece("1 Coffee", 163, 266, 547.5, rise=2), piece("3.00", 588, 647, 553.5),
        piece("2 Lunch", 159, 254, 575, rise=3), piece("45.90", 576, 649, 582),
        piece("1 Coke", 159, 240, 602, rise=3), piece("3.00", 589, 649, 610),
    ]
    assert ocr.rows(pieces) == "1 Coffee 3.00\n2 Lunch 45.90\n1 Coke 3.00"


def test_row_with_a_shaky_piece_is_marked_unsure():
    shaky_name = piece("A R-ED", 160, 400, 100)
    shaky_name["sure"] = False
    pieces = [shaky_name, piece("0.99", 590, 650, 100), piece("BANANAS", 160, 300, 140), piece("0.87", 590, 650, 140)]
    assert ocr.rows(pieces) == "(?) A R-ED 0.99\nBANANAS 0.87"


def test_small_photo_is_enlarged_and_a_big_one_is_not():
    enlarged = Image.open(io.BytesIO(ocr.enlarge(photo(600, 800))))
    assert enlarged.size == (1500, 2000)
    assert ocr.enlarge(photo(3000, 4000)) is None


CLEAN_READING = "BEANS GARBANZO 0.89\nA-PEPPER BELL EACH XL RED 0.99\nSUBTOTAL 1.88"
SHAKY_READING = "BEANS GARBANZO 0.89\n(?) A R-ED 0.99\nSUBTOTAL 1.88"
WRONG_READING = "BEANS GARBANZO 0.89\nA-PEPPER BELL EACH XL RED 9.99\nSUBTOTAL 1.88"


def fake_ocr(monkeypatch, texts):
    """Make the local reader return these texts in turn and record each photo it reads"""
    photos = []

    def pretend_read(image_bytes):
        photos.append(image_bytes)
        return texts[len(photos) - 1]

    monkeypatch.setattr(server.ocr, "read", pretend_read)
    return photos


def test_shaky_reading_of_a_small_photo_is_replaced_by_a_better_enlarged_reading(monkeypatch):
    photos = fake_ocr(monkeypatch, [SHAKY_READING, CLEAN_READING])
    items, subtotal = server.local(photo(600, 800))

    assert len(photos) == 2
    assert [item["name"] for item in items] == ["BEANS GARBANZO", "A-PEPPER BELL EACH XL RED"]
    assert subtotal == 1.88


def test_enlarged_reading_is_thrown_away_when_it_is_worse(monkeypatch):
    fake_ocr(monkeypatch, [SHAKY_READING, WRONG_READING])
    items, subtotal = server.local(photo(600, 800))
    assert [item["price"] for item in items] == [0.89, 0.99]


def test_photo_is_read_only_once_when_the_first_reading_is_fine_or_the_photo_is_big(monkeypatch):
    photos = fake_ocr(monkeypatch, [CLEAN_READING])
    server.local(photo(600, 800))
    assert len(photos) == 1

    photos = fake_ocr(monkeypatch, [SHAKY_READING])
    server.local(photo(3000, 4000))
    assert len(photos) == 1


def test_size():
    assert units.size("14 oz") == ("weight", 14 * 28.3495)
    assert units.size("1 gal") == ("volume", 3785.41)
    assert units.size("12 ct") == ("count", 12)
    assert units.size("family size") is None
    assert units.size(None) is None


def test_bread_is_scaled_to_the_gf_size():
    result = units.deduct(6.49, "14 oz", 3.49, "20 oz")
    assert result["deduction"] == 4.05
    assert result["sizes_comparable"] is True


def test_different_units_of_the_same_kind_still_compare():
    result = units.deduct(5.00, "1 lb", 2.00, "16 oz")
    assert result["deduction"] == 3.00
    assert result["sizes_comparable"] is True


def test_missing_or_mismatched_size_falls_back_and_is_flagged():
    assert units.deduct(6.49, None, 3.49, "20 oz") == {
        "deduction": 3.00, "scaled_regular_price": 3.49, "sizes_comparable": False,
    }
    assert units.deduct(6.49, "14 oz", 3.49, "12 ct")["sizes_comparable"] is False


def test_cheaper_gf_item_is_zero_not_negative():
    assert units.deduct(2.00, "14 oz", 3.49, "14 oz")["deduction"] == 0


def test_two_packages_on_one_receipt_line_count_twice():
    assert units.deduct(12.98, "14 oz", 3.49, "20 oz", qty=2)["deduction"] == 8.09


def test_sizes_typed_by_hand_are_understood():
    assert units.size("14oz") == units.size("14 ounces") == units.size("14 OZ")
    assert units.size("1.5 lbs") == ("weight", 1.5 * 453.592)


def guess(name, **extra):
    """Run the gluten-free guesser on one item"""
    return gluten.guess([{"name": name, **extra}])[0]


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

    item = guess("CYN BKHSE 7GRN", plain_name="Canyon Bakehouse 7-grain bread", gf=False)
    assert item["gf_reason"] == "Canyon Bakehouse is a gluten-free brand"
    assert item["regular_term"] == "white bread"


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


def test_kroger_search_rejects_a_bad_zip_without_asking_kroger():
    assert client.get("/kroger/search", params={"zip": "4520", "term": "bread"}).status_code == 422


def test_kroger_search_says_so_when_kroger_is_down(monkeypatch):
    def kroger_is_down(zip_code):
        raise requests.ConnectionError()

    monkeypatch.setattr(server.kroger, "store", kroger_is_down)
    assert client.get("/kroger/search", params={"zip": "45202", "term": "bread"}).status_code == 502


def test_kroger_search_gives_three_products_and_skips_ones_with_no_price(monkeypatch):
    products = [{"name": f"Bread {n}", "size": "20 oz", "price": price, "promo_price": 0}
                for n, price in enumerate([None, 2.49, 0, 3.49, 1.99, 4.29])]
    monkeypatch.setattr(server.kroger, "store", lambda zip_code: "01400943")
    monkeypatch.setattr(server.kroger, "search", lambda term, location_id, limit: products)

    results = client.get("/kroger/search", params={"zip": "45202", "term": "bread"}).json()["results"]
    assert [product["price"] for product in results] == [2.49, 3.49, 1.99]


def product(name, size, price, promo_price=0):
    """Build a fake Kroger product"""
    return {"name": name, "size": size, "price": price, "promo_price": promo_price}


def fake_kroger(monkeypatch, shelves):
    """Make Kroger answer each search with these products and record each search"""
    asked = []

    def pretend_search(term, location_id, limit):
        asked.append(term)
        return shelves.get(term, [])

    monkeypatch.setattr(server.kroger, "store", lambda zip_code: "01400943")
    monkeypatch.setattr(server.kroger, "search", pretend_search)
    return asked


BREAD_LINE = {"zip": "45202", "term": "white bread", "gf_name": "Udi's gluten-free white bread", "gf_price": 6.49}


def test_suggest_fills_in_the_whole_bread_comparison(monkeypatch):
    fake_kroger(monkeypatch, {
        "white bread": [product("Kroger White Bread", "20 oz", 3.49), product("Fancy White Bread", "24 oz", 4.99)],
        "Udi's gluten-free white bread": [product("Udi's GF Bagels", "14 oz", 5.99), product("Udi's GF White Bread", "14 oz", 6.49)],
    })
    assert client.get("/suggest", params=BREAD_LINE).json() == {
        "regular": product("Kroger White Bread", "20 oz", 3.49), "gf_size": "14 oz",
        "deduction": 4.05, "scaled_regular_price": 2.44, "sizes_comparable": True, "warnings": [],
    }


def test_suggest_uses_a_same_named_kroger_product_even_at_a_different_price(monkeypatch):
    fake_kroger(monkeypatch, {
        "white bread": [product("Kroger White Bread", "20 oz", 3.49)],
        "Udi's gluten-free white bread": [product("Udi's® GF White Bread", "14 oz", 7.29)],
    })
    result = client.get("/suggest", params={**BREAD_LINE, "gf_size_guess": "24 oz"}).json()
    assert result["gf_size"] == "14 oz"
    assert result["sizes_comparable"] is True


def test_suggest_name_match_skips_products_with_the_words_in_a_different_order(monkeypatch):
    fake_kroger(monkeypatch, {
        "spaghetti": [product("Harris Teeter Spaghetti Pasta", "16 oz", 1.69)],
        "Barilla gluten-free spaghetti": [
            product("Barilla Gluten Free Spaghetti Non-GMO Project Certified Pasta", "12 oz", 3.39),
            product("Barilla Chickpea Spaghetti Naturally Gluten Free Non-GMO Pasta", "8.8 oz", 3.19),
        ],
    })
    line = {"zip": "45202", "term": "spaghetti", "gf_name": "Barilla gluten-free spaghetti", "gf_price": 2.99}
    assert client.get("/suggest", params=line).json()["gf_size"] == "12 oz"


def test_suggest_does_not_use_a_name_match_that_comes_in_two_sizes(monkeypatch):
    fake_kroger(monkeypatch, {
        "white bread": [product("Kroger White Bread", "20 oz", 3.49)],
        "Udi's gluten-free white bread": [product("Udi's GF White Bread", "14 oz", 7.29),
                                          product("Udi's GF White Bread Family Size", "24 oz", 9.99)],
    })
    assert client.get("/suggest", params=BREAD_LINE).json()["gf_size"] == ""


def test_suggest_does_not_guess_a_size_when_no_kroger_price_or_name_matches(monkeypatch):
    fake_kroger(monkeypatch, {
        "white bread": [product("Kroger White Bread", "20 oz", 3.49)],
        "Udi's gluten-free white bread": [product("Udi's GF Bagels", "14 oz", 7.29)],
    })
    result = client.get("/suggest", params=BREAD_LINE).json()
    assert result["gf_size"] == ""
    assert result["deduction"] == 3.00
    assert result["sizes_comparable"] is False and len(result["warnings"]) == 1


def test_suggest_uses_the_readers_size_guess_when_kroger_has_no_matching_price(monkeypatch):
    fake_kroger(monkeypatch, {"spaghetti": [product("Harris Teeter Spaghetti Pasta", "16 oz", 1.69)]})
    line = {"zip": "45202", "term": "spaghetti", "gf_name": "Barilla gluten-free spaghetti", "gf_price": 3.49}

    result = client.get("/suggest", params={**line, "gf_size_guess": "12 oz"}).json()
    assert result["gf_size"] == "12 oz"
    assert result["scaled_regular_price"] == 1.27
    assert result["sizes_comparable"] is True

    assert client.get("/suggest", params={**line, "gf_size_guess": "1 box"}).json()["gf_size"] == ""


def test_suggest_matches_a_sale_price_and_a_line_for_two_packages(monkeypatch):
    fake_kroger(monkeypatch, {
        "white bread": [product("Kroger White Bread", "20 oz", 3.49)],
        "Udi's gluten-free white bread": [product("Udi's GF White Bread", "14 oz", 7.29, promo_price=6.49)],
    })
    result = client.get("/suggest", params={**BREAD_LINE, "gf_price": 12.98, "quantity": 2}).json()
    assert result["gf_size"] == "14 oz"
    assert result["deduction"] == 8.09


def test_suggest_prefers_a_regular_product_whose_size_can_be_compared(monkeypatch):
    fake_kroger(monkeypatch, {
        "white bread": [product("Dinner Rolls", "6 ct", 2.99), product("Kroger White Bread", "20 oz", 3.49),
                        product("Value White Bread", "20 oz", 1.29)],
        "Udi's gluten-free white bread": [product("Udi's GF White Bread", "14 oz", 6.49)],
    })
    assert client.get("/suggest", params=BREAD_LINE).json()["regular"]["name"] == "Kroger White Bread"


def test_suggest_gives_nothing_when_kroger_finds_no_regular_version(monkeypatch):
    fake_kroger(monkeypatch, {})
    assert client.get("/suggest", params=BREAD_LINE).json() == {"regular": None}


def test_suggest_rejects_bad_input_without_asking_kroger(monkeypatch):
    asked = fake_kroger(monkeypatch, {})
    for change in [{"zip": "4520"}, {"gf_price": 0}, {"quantity": 0}]:
        assert client.get("/suggest", params={**BREAD_LINE, **change}).status_code == 422
    assert asked == []


def test_suggest_says_so_when_there_is_no_store_or_kroger_is_down(monkeypatch):
    monkeypatch.setattr(server.kroger, "store", lambda zip_code: None)
    assert client.get("/suggest", params=BREAD_LINE).status_code == 404

    def kroger_is_down(zip_code):
        raise requests.ConnectionError()

    monkeypatch.setattr(server.kroger, "store", kroger_is_down)
    assert client.get("/suggest", params=BREAD_LINE).status_code == 502


def test_suggest_still_works_when_the_size_lookup_fails(monkeypatch):
    def pretend_search(term, location_id, limit):
        if term == "white bread":
            return [product("Kroger White Bread", "20 oz", 3.49)]
        raise requests.ConnectionError()

    monkeypatch.setattr(server.kroger, "store", lambda zip_code: "01400943")
    monkeypatch.setattr(server.kroger, "search", pretend_search)

    result = client.get("/suggest", params=BREAD_LINE).json()
    assert result["regular"]["name"] == "Kroger White Bread"
    assert result["gf_size"] == ""


def test_kroger_is_never_sent_a_search_it_would_refuse(monkeypatch):
    asked = fake_kroger(monkeypatch, {"white bread": [product("Kroger White Bread", "20 oz", 3.49)]})

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

    monkeypatch.setattr(server.kroger, "token", lambda: "pretend-token")
    monkeypatch.setattr(server.kroger.requests, "get", pretend_get)
    monkeypatch.setattr(server.kroger, "_stores", {})

    assert server.kroger.store("45202") == "01400943"
    assert server.kroger.store("45202") == "01400943"
    assert asked == ["45202"]


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
    assert response.status_code == 422


def test_scan_rejects_an_empty_file():
    response = client.post("/scan", files={"file": ("empty.png", b"")})
    assert response.status_code == 400


def picture(kind="PNG", size=(40, 40)):
    """Make a blank picture file of the given type and size"""
    buffer = io.BytesIO()
    Image.new("RGB", size, "white").save(buffer, format=kind)
    return buffer.getvalue()


def test_scan_rejects_a_file_over_the_size_limit(monkeypatch):
    asked = []
    monkeypatch.setattr(server, "read", lambda image_bytes: asked.append(1))
    monkeypatch.setattr(server, "MAX_BYTES", 1000)

    response = client.post("/scan", files={"file": ("big.png", b"x" * 1001)})
    assert response.status_code == 413
    assert asked == []


def test_scan_rejects_a_picture_that_is_not_jpeg_png_or_webp():
    response = client.post("/scan", files={"file": ("receipt.gif", picture("GIF"))})
    assert response.status_code == 415


def test_scan_rejects_a_picture_with_too_many_pixels(monkeypatch):
    monkeypatch.setattr(server, "MAX_PIXELS", 100)

    response = client.post("/scan", files={"file": ("wide.png", picture("PNG", (50, 50)))})
    assert response.status_code == 413


def test_scan_rejects_a_cut_off_picture_before_reading_it(monkeypatch):
    asked = []
    monkeypatch.setattr(server, "read", lambda image_bytes: asked.append(1))
    whole = picture("PNG", (200, 200))

    response = client.post("/scan", files={"file": ("cut.png", whole[: len(whole) // 2])})
    assert response.status_code == 422
    assert asked == []


def test_scan_accepts_a_jpeg_and_a_webp(monkeypatch):
    monkeypatch.setattr(server, "read", lambda image_bytes: ("local", [], None))

    for kind in ("JPEG", "WEBP"):
        response = client.post("/scan", files={"file": ("receipt", picture(kind))})
        assert response.status_code == 200


class PretendReply:
    def __init__(self, status_code, data):
        self.status_code = status_code
        self.data = data

    def json(self):
        return self.data


def answer(items, subtotal=0):
    """Build the reply Google sends after Gemini reads a receipt"""
    text = json.dumps({"items": items, "subtotal": subtotal})
    return PretendReply(200, {"candidates": [{"content": {"parts": [{"text": text}]}}]})


def cleaned(name, price, upc=None, plain_name=None, gf=False, regular_term=None, quantity=1, package_size=None):
    """Build one item the way gemini.py hands it on"""
    return {"name": name, "price": price, "quantity": quantity, "upc": upc, "unsure": False,
            "plain_name": plain_name, "gf": gf, "regular_term": regular_term, "package_size": package_size}


OUT_OF_REQUESTS = PretendReply(429, {"error": {"message": "You exceeded your current quota."}})


def fake_gemini(monkeypatch, replies):
    """Make Gemini give these replies in turn and record each address it was sent to"""
    asked = []

    def pretend_post(url, json, headers, timeout):
        asked.append(url)
        return replies[len(asked) - 1]

    monkeypatch.setattr(gemini, "KEY", "not-a-real-key")
    monkeypatch.setattr(gemini.requests, "post", pretend_post)
    return asked


def photo(width, height):
    """Make a blank white PNG photo of the given size"""
    buffer = io.BytesIO()
    Image.new("RGB", (width, height), "white").save(buffer, format="PNG")
    return buffer.getvalue()


def test_gemini_answer_is_cleaned_up(monkeypatch):
    fake_gemini(monkeypatch, [answer([
        {"name": " UDIS GF WHT BREAD ", "price": 6.489, "upc": "0069899781101", "quantity": 2,
         "plain_name": " Udi's gluten-free white bread ", "gluten_free": True, "regular_version": "white bread",
         "package_size": " 14 oz "},
        {"name": "BANANAS", "price": 1.12, "upc": "", "plain_name": "", "gluten_free": False, "regular_version": "",
         "quantity": 0, "package_size": "3 lb"},
        {"name": "EGGS", "price": 2.79, "upc": "not a barcode", "gluten_free": "yes"},
        {"name": "", "price": 2.00, "upc": None},
        {"name": "FREE SAMPLE", "price": 0, "upc": None},
        {"name": "MILK", "price": "3.29", "upc": None},
    ], subtotal=10.40)])

    items, subtotal = gemini.read(photo(40, 80))
    assert items == [
        cleaned("UDIS GF WHT BREAD", 6.49, upc="0069899781101", quantity=2,
                plain_name="Udi's gluten-free white bread", gf=True, regular_term="white bread", package_size="14 oz"),
        cleaned("BANANAS", 1.12),
        cleaned("EGGS", 2.79),
    ]
    assert subtotal == 10.40


def test_gemini_is_asked_for_json_the_way_google_accepts_it(monkeypatch):
    sent = {}

    def pretend_post(url, json, headers, timeout):
        sent.update(json)
        return answer([])

    monkeypatch.setattr(gemini, "KEY", "not-a-real-key")
    monkeypatch.setattr(gemini.requests, "post", pretend_post)

    assert gemini.read(photo(40, 80)) == ([], None)
    assert sent["generationConfig"]["responseFormat"]["text"]["mimeType"] == "APPLICATION_JSON"


def test_gemini_uses_the_second_model_when_the_first_is_out_of_requests(monkeypatch):
    bread = {"name": "BREAD", "price": 6.49, "upc": None}
    asked = fake_gemini(monkeypatch, [OUT_OF_REQUESTS, answer([bread]), answer([bread])])

    assert gemini.read(photo(40, 80)) == ([cleaned("BREAD", 6.49)], None)
    assert gemini.MODELS[0] in asked[0] and gemini.MODELS[1] in asked[1]

    gemini.read(photo(40, 80))
    assert len(asked) == 3 and gemini.MODELS[1] in asked[2]


def test_gemini_stops_at_the_daily_limit(monkeypatch):
    asked = fake_gemini(monkeypatch, [answer([])])
    monkeypatch.setattr(gemini, "LIMIT", 1)

    gemini.read(photo(40, 80))
    with pytest.raises(gemini.Unavailable):
        gemini.read(photo(40, 80))
    assert len(asked) == 1


def test_gemini_refusal_shows_googles_reason_code():
    blocked = PretendReply(403, {"error": {"message": "Requests are blocked.", "status": "PERMISSION_DENIED",
                                           "details": [{"reason": "API_KEY_SERVICE_BLOCKED"}]}})
    assert gemini.reason(blocked) == "[API_KEY_SERVICE_BLOCKED] Requests are blocked."

    no_credits = PretendReply(402, {"error": {"message": "Credits are depleted.", "status": "FAILED_PRECONDITION"}})
    assert gemini.reason(no_credits) == "[FAILED_PRECONDITION] Credits are depleted."

    assert gemini.reason(OUT_OF_REQUESTS) == "You exceeded your current quota."
    assert gemini.reason(PretendReply(500, {})) == "no details given"
    assert gemini.reason(PretendReply(500, {"error": "broken"})) == "no details given"


def test_gemini_without_a_key_sends_nothing():
    with pytest.raises(gemini.Unavailable):
        gemini.read(photo(40, 80))


def test_big_photo_is_shrunk_before_sending():
    small = Image.open(io.BytesIO(gemini.shrink(photo(3000, 6000))))
    assert small.format == "JPEG"
    assert small.size == (1536, 3072)


def test_scan_uses_gemini_when_it_is_switched_on(monkeypatch):
    fake_gemini(monkeypatch, [answer([
        {"name": "UDIS WHT BRD", "price": 6.49, "upc": "", "plain_name": "Udi's white bread",
         "gluten_free": True, "regular_version": "white sandwich bread"},
        {"name": "BANANAS", "price": 1.12, "upc": "", "plain_name": "Bananas",
         "gluten_free": False, "regular_version": ""},
    ], subtotal=7.61)])
    monkeypatch.setattr(server, "ENGINE", "gemini")

    with open("test_receipt.png", "rb") as image_file:
        response = client.post("/scan", files={"file": image_file})
    assert response.json() == {"engine": "gemini", "subtotal": 7.61, "items": [
        {"name": "UDIS WHT BRD", "price": 6.49, "quantity": 1, "upc": None, "unsure": False,
         "plain_name": "Udi's white bread",
         "gf": True, "gf_reason": "Udi's is a gluten-free brand", "regular_term": "white sandwich bread",
         "package_size": None},
        {"name": "BANANAS", "price": 1.12, "quantity": 1, "upc": None, "unsure": False, "plain_name": "Bananas",
         "gf": False, "gf_reason": None, "regular_term": None, "package_size": None},
    ]}


def test_scan_falls_back_to_the_local_reader_when_gemini_is_out_of_requests(monkeypatch):
    asked = fake_gemini(monkeypatch, [OUT_OF_REQUESTS, OUT_OF_REQUESTS])
    monkeypatch.setattr(server, "ENGINE", "gemini")

    with open("test_receipt.png", "rb") as image_file:
        response = client.post("/scan", files={"file": image_file})
    assert len(asked) == 2
    assert response.json()["engine"] == "local"
    assert len(response.json()["items"]) == 5


def test_scan_does_not_spend_a_gemini_request_on_a_file_that_is_not_an_image(monkeypatch):
    asked = fake_gemini(monkeypatch, [])
    monkeypatch.setattr(server, "ENGINE", "gemini")

    response = client.post("/scan", files={"file": ("notes.txt", b"this is not a picture")})
    assert response.status_code == 422
    assert asked == []
