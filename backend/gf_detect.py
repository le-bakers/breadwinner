import re

# Receipts almost never print the words "gluten free", so this file GUESSES which items are
# gluten-free products. Every guess is shown to the user, who confirms or corrects it.

# Brands that only make gluten-free products. Written the way a receipt prints them:
# capital letters, no apostrophes. The second part is the brand's real name, shown to the user.
GF_BRANDS = {
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

# Ways a receipt line can say "gluten free"
GF_LABELS = ["GF", "G F", "GLUTEN FREE", "GLUTENFREE", "GLUTEN FR", "GLTN FREE", "GLTN FR"]

# A food word on the gluten-free item -> what to search for to find the regular version.
# The first one that matches wins, so the more exact words come first.
REGULAR_VERSIONS = [
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


def to_words(text):
    """ "Udi's GF Wht Bread" -> ["UDIS", "GF", "WHT", "BREAD"] """
    text = text.upper().replace("'", "").replace("’", "").replace("Ä", "A")
    return re.findall(r"[A-Z]+", text)


def why_gluten_free(words):
    """The reason these words look like a gluten-free product, or None when they don't."""
    text = " " + " ".join(words) + " "  # spaces on both ends so only whole words match

    for printed, brand in GF_BRANDS.items():
        if f" {printed} " in text:
            return f"{brand} is a gluten-free brand"

    for label in GF_LABELS:
        if f" {label} " in text:
            return "The receipt line says gluten-free"

    return None


def regular_version(words):
    """What to search for to find the ordinary version: ["SCHAR", "GF", "PENNE"] -> "penne pasta".
    None when no food word is recognized, and then the user types the search themselves."""
    for food_word, search in REGULAR_VERSIONS:
        for word in words:
            if word == food_word or word == food_word + "S":
                return search
    return None


def add_guesses(items):
    """Adds three things to every item:
    "gf"           True when the item looks like a gluten-free product
    "gf_reason"    why, in plain English (None when "gf" is False)
    "regular_term" what to search for to price the regular version (None when "gf" is False)

    The brand and label lists above are checked first. Items read by Gemini also arrive with
    Gemini's own opinion in "gf" and "regular_term", used when the lists find nothing."""
    for item in items:
        item.setdefault("plain_name", None)
        ai_says_gf = item.get("gf") is True
        ai_regular_term = item.get("regular_term")

        words = to_words(item["name"] + " " + (item["plain_name"] or ""))
        reason = why_gluten_free(words)
        if reason is None and ai_says_gf:
            reason = "AI guess from the product name"

        item["gf"] = reason is not None
        item["gf_reason"] = reason
        item["regular_term"] = (ai_regular_term or regular_version(words)) if item["gf"] else None

    return items
