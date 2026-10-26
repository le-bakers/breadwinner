import re

BRANDS = {
    "UDIS": "Udi's",
    "SCHAR": "Schar",
    "GLUTINO": "Glutino",
    "CANYON BAKEHOUSE": "Canyon Bakehouse",
    "BANZA": "Banza",
    "KINNIKINNICK": "Kinnikinnick",
    "KATZ": "Katz",
    "BFREE": "BFree",
    "TINKYADA": "Tinkyada",
    "CRUNCHMASTER": "Crunchmaster",
    "CAULIPOWER": "Caulipower",
    "SIMPLE MILLS": "Simple Mills",
    "ENJOY LIFE": "Enjoy Life",
    "PAMELAS": "Pamela's",
    "THREE BAKERS": "Three Bakers",
    "LITTLE NORTHERN": "Little Northern Bakehouse",
    "AGAINST THE GRAIN": "Against the Grain",
    "MARYS GONE CRACKERS": "Mary's Gone Crackers",
    "ENER G": "Ener-G",
    "ALEIAS": "Aleia's",
}

LABELS = ["GF", "G F", "GLUTEN FREE", "GLUTENFREE", "GLUTEN FR", "GLTN FREE", "GLTN FR"]

FOODS = [
    ("BREADCRUMB", "bread crumbs"),
    ("PANKO", "bread crumbs"),
    ("BAGEL", "bagels"),
    ("TORTILLA", "flour tortillas"),
    ("WRAP", "flour tortillas"),
    ("PIZZA", "frozen pizza"),
    ("PENNE", "penne pasta"),
    ("SPAGHETTI", "spaghetti"),
    ("ROTINI", "rotini pasta"),
    ("FUSILLI", "fusilli pasta"),
    ("MACARONI", "elbow macaroni"),
    ("NOODLE", "egg noodles"),
    ("PASTA", "pasta"),
    ("CRACKER", "crackers"),
    ("PRETZEL", "pretzels"),
    ("COOKIE", "cookies"),
    ("BROWNIE", "brownie mix"),
    ("PANCAKE", "pancake mix"),
    ("WAFFLE", "frozen waffles"),
    ("MUFFIN", "muffins"),
    ("DONUT", "donuts"),
    ("CAKE", "cake mix"),
    ("CEREAL", "cereal"),
    ("GRANOLA", "granola"),
    ("OAT", "oats"),
    ("FLOUR", "all purpose flour"),
    ("BUN", "hamburger buns"),
    ("ROLL", "dinner rolls"),
    ("BREAD", "white bread"),
]


def split(text):
    """Turn a receipt line into capital-letter words without apostrophes"""
    text = text.upper().replace("'", "").replace("’", "").replace("Ä", "A")
    return re.findall(r"[A-Z]+", text)


def why(words):
    """Explain why these words look like a gluten-free product or return None"""
    text = " " + " ".join(words) + " "

    for printed, brand in BRANDS.items():
        if f" {printed} " in text:
            return f"{brand} is a gluten-free brand"

    for label in LABELS:
        if f" {label} " in text:
            return "The receipt line says gluten-free"

    return None


def search(words):
    """Pick a grocery search for the regular version of the food or return None"""
    for food, term in FOODS:
        for word in words:
            if word == food or word == food + "S":
                return term
    return None


def guess(items):
    """Mark each item as gluten-free or not with a reason and a search for its regular version"""
    for item in items:
        item.setdefault("plain_name", None)
        ai = item.get("gf") is True
        term = item.get("regular_term")

        words = split(item["name"] + " " + (item["plain_name"] or ""))
        reason = why(words)
        if reason is None and ai:
            reason = "AI guess from the product name"

        item["gf"] = reason is not None
        item["gf_reason"] = reason
        item["regular_term"] = (term or search(words)) if item["gf"] else None

    return items
