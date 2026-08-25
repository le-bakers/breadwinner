seed_list = [
    {"item": "Gluten-Free Bread", "regular_equivalent": "Regular Sandwich Bread", "gf_price": 6.49, "regular_price": 3.49},
    {"item": "Gluten-Free Pasta", "regular_equivalent": "Regular Pasta", "gf_price": 5.99, "regular_price": 2.49},
    {"item": "Gluten-Free All-Purpose Flour", "regular_equivalent": "Regular All-Purpose Flour", "gf_price": 7.29, "regular_price": 3.99},
    {"item": "Gluten-Free Oat Cereal", "regular_equivalent": "Regular Oat Cereal", "gf_price": 4.79, "regular_price": 3.99},
    {"item": "Gluten-Free Tortillas", "regular_equivalent": "Regular Flour Tortillas", "gf_price": 5.49, "regular_price": 2.99},
    {"item": "Gluten-Free Crackers", "regular_equivalent": "Regular Crackers", "gf_price": 4.99, "regular_price": 3.49},
    {"item": "Gluten-Free Pizza Crust", "regular_equivalent": "Regular Pizza Crust", "gf_price": 6.99, "regular_price": 3.99},
    {"item": "Gluten-Free Bagels", "regular_equivalent": "Regular Bagels", "gf_price": 6.49, "regular_price": 3.99},
]


for entry in seed_list:
    print(entry["item"], "costs", entry["gf_price"], "- regular version costs", entry["regular_price"])


def find_match(item_name):
    for entry in seed_list:
        if entry["item"].lower() == item_name.lower():
            return entry
    return None


print(find_match("Gluten-Free Pasta"))
print(find_match("gluten-free pasta"))


def calculate_deduction(entry):
    return round(entry["gf_price"] - entry["regular_price"], 2)


match = find_match("Gluten-Free Pasta")
if match:
    print("Deduction-eligible amount:", calculate_deduction(match))

