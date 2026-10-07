import re

# A price at the end of a line, like "6.49", "$6.49 F", "0.50-" or "-0.50" (a minus means a discount)
PRICE_AT_END = re.compile(r"(-?)\$?(\d+[.,]\d{2})\s*(-?)\s*[A-Z]{0,2}$")

# A barcode number (UPC): 12 to 14 digits in a row
UPC = re.compile(r"\b\d{12,14}\b")

# Target prints its own 9-digit product code at the start of the line. It is not a UPC.
STORE_CODE_AT_START = re.compile(r"^\d{6,11}\s+")

# Lines that end in a price but are not something the shopper bought
NOT_AN_ITEM = [
    "TOTAL", "SUBTOTAL", "TAX", "BALANCE", "CHANGE", "CASH", "TEND", "PAYMENT",
    "VISA", "MASTERCARD", "AMEX", "DISCOVER", "DEBIT", "CREDIT",
    "SAVINGS", "SAVED", "COUPON", "DISCOUNT",
]


def is_not_an_item(word):
    """True for words like TOTAL. Long words also count when the OCR got one letter wrong (TOTAI)."""
    for skip_word in NOT_AN_ITEM:
        if word == skip_word:
            return True
        if len(word) >= 5 and len(word) == len(skip_word):
            wrong_letters = sum(a != b for a, b in zip(word, skip_word))
            if wrong_letters == 1:
                return True
    return False


def parse_receipt(text):
    print(text)
    """Turn receipt text into a list of items: [{"name": ..., "price": ..., "upc": ...}]"""
    items = []

    for line in text.upper().splitlines():
        line = line.strip()

        # Kroger prints the barcode on its own line, under the item it belongs to
        if UPC.fullmatch(line):
            if items and items[-1]["upc"] is None:
                items[-1]["upc"] = line
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

        price = float(price_match.group(2).replace(",", "."))
        items.append({"name": name, "price": price, "upc": upc})

    return items
