import re

from ocr import MARK

PRICE = re.compile(r"(-?)\$?(\d+[.,]\d{2})\s*(-?)\s*[A-Z]{0,2}$")
UPC = re.compile(r"\b\d{12,14}\b")
CODE = re.compile(r"^\d{6,11}\s+")
QTY = re.compile(r"^(\d+(?:\.\d+)?)\s*[A-Z]{0,3}\s*@\s*\$?(\d+[.,]\d{2})(\s*/\s*[A-Z]+)?$")
IGNORE = [
    "TOTAL", "SUBTOTAL", "TAX", "BALANCE", "CHANGE", "CASH", "TEND", "PAYMENT",
    "VISA", "MASTERCARD", "AMEX", "DISCOVER", "DEBIT", "CREDIT",
    "SAVINGS", "SAVED", "COUPON", "DISCOUNT",
]


def same(word, target):
    """Check whether two words match while allowing one misread letter in long words"""
    if word == target:
        return True
    if len(word) >= 5 and len(word) == len(target):
        return sum(a != b for a, b in zip(word, target)) == 1
    return False


def ignored(word):
    """Check whether a word marks a line that is not something the shopper bought"""
    return any(same(word, skip) for skip in IGNORE)


def number(text):
    """Turn a printed price into a number"""
    return float(text.replace(",", "."))


def parse(text):
    """Turn receipt text into a list of items with a name price barcode and unsure flag"""
    items = []
    totals = {}

    for line in text.upper().splitlines():
        line = line.strip()

        unsure = line.startswith(MARK)
        if unsure:
            line = line[len(MARK):].strip()

        if UPC.fullmatch(line):
            if items and items[-1]["upc"] is None:
                items[-1]["upc"] = line
            continue

        qty = QTY.match(line)
        if qty:
            if items:
                totals[len(items) - 1] = round(float(qty.group(1)) * number(qty.group(2)), 2)
            continue

        match = PRICE.search(line)
        if not match or "-" in (match.group(1), match.group(3)):
            continue

        name = line[:match.start()]
        upc = None
        found = UPC.search(name)
        if found:
            upc = found.group()
            name = name[:found.start()]
        name = CODE.sub("", name).strip()

        words = re.findall(r"[A-Z]+", name)
        if any(ignored(word) for word in words) or len("".join(words)) < 2:
            continue

        items.append({"name": name, "price": number(match.group(2)), "upc": upc, "unsure": unsure})

    fix(items, totals, subtotal(text))
    return items


def subtotal(text):
    """Find the printed subtotal or None when there is none or the receipt has a discount"""
    found = None

    for line in text.upper().splitlines():
        line = line.strip()
        match = PRICE.search(line)
        if not match:
            continue
        if "-" in (match.group(1), match.group(3)):
            return None

        letters = "".join(re.findall(r"[A-Z]+", line[:match.start()]))
        if found is None and same(letters, "SUBTOTAL"):
            found = number(match.group(2))

    return found


def fix(items, totals, target):
    """Swap in a quantity line total when that is what makes the prices add up to the subtotal"""
    if target is None:
        return

    total = sum(item["price"] for item in items)
    if round(total, 2) == target:
        return

    for index, amount in totals.items():
        item = items[index]
        if round(total - item["price"] + amount, 2) == target:
            item["price"] = amount
            return
