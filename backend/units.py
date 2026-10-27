import re

UNITS = {
    "oz": ("weight", 28.3495),
    "ounce": ("weight", 28.3495),
    "ounces": ("weight", 28.3495),
    "lb": ("weight", 453.592),
    "lbs": ("weight", 453.592),
    "pound": ("weight", 453.592),
    "pounds": ("weight", 453.592),
    "g": ("weight", 1),
    "grams": ("weight", 1),
    "kg": ("weight", 1000),
    "fl oz": ("volume", 29.5735),
    "ml": ("volume", 1),
    "l": ("volume", 1000),
    "liter": ("volume", 1000),
    "liters": ("volume", 1000),
    "pt": ("volume", 473.176),
    "qt": ("volume", 946.353),
    "gal": ("volume", 3785.41),
    "gallon": ("volume", 3785.41),
    "ct": ("count", 1),
    "count": ("count", 1),
}

PATTERN = re.compile(r"^(\d+(?:\.\d+)?)\s*(" + "|".join(UNITS) + r")$")


def size(text):
    """Turn a size like 14 oz into its kind and amount in grams milliliters or pieces"""
    if not text:
        return None

    match = PATTERN.match(text.lower().strip())
    if not match:
        return None

    kind, scale = UNITS[match.group(2)]
    return kind, float(match.group(1)) * scale


def deduct(price, gfsize, regular, regsize, qty=1):
    """Work out how much more a gluten-free line cost than the same amount of the regular item"""
    gf = size(gfsize)
    reg = size(regsize)
    same = gf is not None and reg is not None and gf[0] == reg[0]

    scaled = regular / reg[1] * gf[1] if same else regular
    extra = max(price / qty - scaled, 0) * qty

    return {
        "deduction": round(extra, 2),
        "scaled_regular_price": round(scaled, 2),
        "sizes_comparable": same,
    }
