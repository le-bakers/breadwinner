import re

# How much one of each unit is, in a shared base unit:
# weight -> grams, volume -> milliliters, count -> pieces
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

# A number, then one of the units above: "14 oz", "14oz", "1.5 lb"
SIZE = re.compile(r"^(\d+(?:\.\d+)?)\s*(" + "|".join(UNITS) + r")$")


def parse_size(size_text):
    """Turn "14 oz" into ("weight", 396.9). Returns None if the size can't be read."""
    if not size_text:
        return None

    match = SIZE.match(size_text.lower().strip())
    if not match:
        return None

    amount = float(match.group(1))
    kind, base_per_unit = UNITS[match.group(2)]
    return kind, amount * base_per_unit


def calculate_deduction(gf_price, gf_size, regular_price, regular_size, quantity=1):
    """How much extra the gluten-free item cost compared to the regular one.

    The regular price is scaled to the gluten-free package's size first, so a
    14 oz GF loaf is compared to 14 oz of regular bread, not a whole 20 oz loaf.
    gf_price is what the receipt line cost. When that line was for 2 loaves (quantity=2),
    each loaf is compared on its own and the extra cost is counted twice.
    This is an organized estimate, not tax advice.
    """
    gf = parse_size(gf_size)
    regular = parse_size(regular_size)

    # Sizes can only be compared when both are known and the same kind (weight vs weight)
    comparable = gf is not None and regular is not None and gf[0] == regular[0]

    if comparable:
        regular_unit_price = regular_price / regular[1]
        scaled_regular_price = regular_unit_price * gf[1]
    else:
        scaled_regular_price = regular_price

    # You can't deduct a negative extra cost
    gf_price_for_one = gf_price / quantity
    deduction = max(gf_price_for_one - scaled_regular_price, 0) * quantity

    return {
        "deduction": round(deduction, 2),
        "scaled_regular_price": round(scaled_regular_price, 2),  # for one package
        "sizes_comparable": comparable,  # False = raw comparison, the user should review it
    }
