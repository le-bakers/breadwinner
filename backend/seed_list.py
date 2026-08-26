seed_list = [
    {"item": "Sandwich Bread",      "gf_price": 6.49, "regular_price": 3.49},
    {"item": "Pasta",               "gf_price": 5.99, "regular_price": 2.49},
    {"item": "All-Purpose Flour",   "gf_price": 7.29, "regular_price": 3.99},
    {"item": "Oat Cereal",          "gf_price": 4.79, "regular_price": 3.99},
    {"item": "Flour Tortillas",     "gf_price": 5.49, "regular_price": 2.99},
    {"item": "Crackers",            "gf_price": 4.99, "regular_price": 3.49},
    {"item": "Pizza Crust",         "gf_price": 6.99, "regular_price": 3.99},
    {"item": "Bagels",              "gf_price": 6.49, "regular_price": 3.99},
]


def find_match(item_name):
    for entry in seed_list:
        if entry["item"].lower() == item_name.lower():
            return entry
    return None

def calculate_deduction(entry):
    return round(entry["gf_price"] - entry["regular_price"], 2)


for entry in seed_list:
    print(f"Gluten-Free {entry['item']} costs {entry['gf_price']} "
          f"- regular version costs {entry['regular_price']}")

match = find_match("Pasta")
if match:
    print("Deduction-eligible amount:", calculate_deduction(match))