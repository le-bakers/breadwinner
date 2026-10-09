import re

from ocr import UNSURE_MARK

# A price at the end of a line, like "6.49", "$6.49 F", "0.50-" or "-0.50" (a minus means a discount)
PRICE_AT_END = re.compile(r"(-?)\$?(\d+[.,]\d{2})\s*(-?)\s*[A-Z]{0,2}$")

# A barcode number (UPC): 12 to 14 digits in a row
UPC = re.compile(r"\b\d{12,14}\b")

# Target prints its own 9-digit product code at the start of the line. It is not a UPC.
STORE_CODE_AT_START = re.compile(r"^\d{6,11}\s+")

# A "how many, at what price each" line, like "2 @ 0.49", "3EA @ 0.29/EA" or "1.25 LB @ 0.59/LB"
QUANTITY_LINE = re.compile(r"^(\d+(?:\.\d+)?)\s*[A-Z]{0,3}\s*@\s*\$?(\d+[.,]\d{2})(\s*/\s*[A-Z]+)?$")

# Lines that end in a price but are not something the shopper bought
NOT_AN_ITEM = [
    "TOTAL", "SUBTOTAL", "TAX", "BALANCE", "CHANGE", "CASH", "TEND", "PAYMENT",
    "VISA", "MASTERCARD", "AMEX", "DISCOVER", "DEBIT", "CREDIT",
    "SAVINGS", "SAVED", "COUPON", "DISCOUNT",
]


def same_word(word, skip_word):
    """True when the two words match. Long words also match when the OCR got one letter wrong (TOTAI)."""
    if word == skip_word:
        return True
    if len(word) >= 5 and len(word) == len(skip_word):
        wrong_letters = sum(a != b for a, b in zip(word, skip_word))
        return wrong_letters == 1
    return False


def is_not_an_item(word):
    """True for words like TOTAL."""
    return any(same_word(word, skip_word) for skip_word in NOT_AN_ITEM)


def to_number(price_text):
    return float(price_text.replace(",", "."))


def parse_receipt(text):
    """Turn receipt text into a list of items: [{"name": ..., "price": ..., "upc": ..., "unsure": ...}]
    "unsure" is True when the reader was not confident about that row, so the user should check it."""
    print(text)
    items = []
    quantity_totals = {}  # item number -> what the "2 @ 0.49" line under that item multiplies out to

    for line in text.upper().splitlines():
        line = line.strip()

        unsure = line.startswith(UNSURE_MARK)
        if unsure:
            line = line[len(UNSURE_MARK):].strip()

        # Kroger prints the barcode on its own line, under the item it belongs to
        if UPC.fullmatch(line):
            if items and items[-1]["upc"] is None:
                items[-1]["upc"] = line
            continue

        quantity_match = QUANTITY_LINE.match(line)
        if quantity_match:
            if items:
                how_many = float(quantity_match.group(1))
                price_for_one = to_number(quantity_match.group(2))
                quantity_totals[len(items) - 1] = round(how_many * price_for_one, 2)
            continue

        price_match = PRICE_AT_END.search(line)
        if not price_match:
            continue
        if price_match.group(1) == "-" or price_match.group(3) == "-":
            continue  # a discount, not an item

        name = line[:price_match.start()]

        # Walmart prints the barcode in the middle of the line
        upc = None
        upc_match = UPC.search(name)
        if upc_match:
            upc = upc_match.group()
            name = name[:upc_match.start()]

        name = STORE_CODE_AT_START.sub("", name).strip()

        words = re.findall(r"[A-Z]+", name)
        if any(is_not_an_item(word) for word in words):
            continue
        if len("".join(words)) < 2:
            continue  # no real name, e.g. a stray number

        price = to_number(price_match.group(2))
        items.append({"name": name, "price": price, "upc": upc, "unsure": unsure})

    fix_price_using_quantity(items, quantity_totals, find_subtotal(text))
    return items


def find_subtotal(text):
    """The SUBTOTAL printed on the receipt, or None if there isn't one.
    The item prices should add up to it, which makes it a free way to catch a misread price.
    A receipt with a coupon or discount gives None: its items add up to more than its subtotal."""
    subtotal = None

    for line in text.upper().splitlines():
        line = line.strip()
        price_match = PRICE_AT_END.search(line)
        if not price_match:
            continue
        if price_match.group(1) == "-" or price_match.group(3) == "-":
            return None

        # Joining the letters makes "SUB TOTAL" and "SUBTOTAL:" both read as SUBTOTAL
        letters = "".join(re.findall(r"[A-Z]+", line[:price_match.start()]))
        if subtotal is None and same_word(letters, "SUBTOTAL"):
            subtotal = to_number(price_match.group(2))

    return subtotal


def fix_price_using_quantity(items, quantity_totals, subtotal):
    """When the prices don't add up to the subtotal, one of them was probably misread.
    A line like "2 @ 0.49" gives a second opinion on the price of the item above it (0.98).
    That second opinion is only used when it makes everything add up exactly."""
    if subtotal is None:
        return

    total = sum(item["price"] for item in items)
    if round(total, 2) == subtotal:
        return

    for item_number, quantity_total in quantity_totals.items():
        item = items[item_number]
        if round(total - item["price"] + quantity_total, 2) == subtotal:
            item["price"] = quantity_total
            return
