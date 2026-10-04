# Run with:  cd backend  then  python -m pytest
# These run offline. test_receipt.png is a computer-drawn fake receipt, not a real photo.

from fastapi.testclient import TestClient

from receipt_parser import parse_receipt
from server import app
from unit_price import calculate_deduction, parse_size

client = TestClient(app)


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
        {"name": "UDIS GF WHT BREAD", "price": 6.49, "upc": "0069899781101"},
        {"name": "BANANAS", "price": 1.12, "upc": None},
    ]


def test_walmart_receipt_upc_inside_the_line():
    text = """GV WHT BREAD 007874237003 F 1.48 O
SCHAR PASTA 081075702012 F 4.98 N
SUBTOTAL 6.46
TOTAL 6.46"""
    assert parse_receipt(text) == [
        {"name": "GV WHT BREAD", "price": 1.48, "upc": "007874237003"},
        {"name": "SCHAR PASTA", "price": 4.98, "upc": "081075702012"},
    ]


def test_target_receipt_store_code_is_not_a_upc():
    text = """GROCERY
071050123 UDIS BREAD NF $6.49
284050001 MP PASTA NF $1.29
SUBTOTAL $7.78"""
    assert parse_receipt(text) == [
        {"name": "UDIS BREAD NF", "price": 6.49, "upc": None},
        {"name": "MP PASTA NF", "price": 1.29, "upc": None},
    ]


def test_discount_with_minus_in_front_is_not_an_item():
    assert parse_receipt("MFR COUPON -1.00\nSTORE CPN $ -0.50\nGF PRETZELS 3.99") == [
        {"name": "GF PRETZELS", "price": 3.99, "upc": None},
    ]


def test_misread_total_is_not_an_item_but_similar_foods_are():
    # The OCR sometimes gets one letter wrong: TOTAI instead of TOTAL
    text = "TOTAI 18.18\nSUBTOTAI 18.18\nCASHEW HALVES 7.99\nWAX PAPER 2.49\nORANGE JUICE 3.99"
    assert [item["name"] for item in parse_receipt(text)] == ["CASHEW HALVES", "WAX PAPER", "ORANGE JUICE"]


def test_text_with_no_items_gives_empty_list():
    assert parse_receipt("THANK YOU FOR SHOPPING\n04/12/2026 3:15 PM") == []


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


# ---------- POST /scan ----------

def test_scan_reads_items_from_a_receipt_image():
    with open("test_receipt.png", "rb") as image_file:
        response = client.post("/scan", files={"file": image_file})
    assert response.status_code == 200

    items = response.json()["items"]
    assert items == [
        {"name": "UDIS GF WHT BREAD", "price": 6.49, "upc": "0069899781101"},
        {"name": "KRO 2% MILK GAL", "price": 3.29, "upc": None},
        {"name": "BANANAS", "price": 1.12, "upc": None},
        {"name": "SCHAR GF PASTA PENNE", "price": 4.99, "upc": None},
        {"name": "KRO LRG EGGS 12CT", "price": 2.79, "upc": None},
    ]


def test_scan_rejects_a_file_that_is_not_an_image():
    response = client.post("/scan", files={"file": ("notes.txt", b"this is not a picture")})
    assert response.status_code == 422


def test_scan_rejects_an_empty_file():
    response = client.post("/scan", files={"file": ("empty.png", b"")})
    assert response.status_code == 400
