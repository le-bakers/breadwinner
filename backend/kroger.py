import os
import time
import requests
from dotenv import load_dotenv

load_dotenv()

CLIENT_ID = os.getenv("KROGER_CLIENT_ID")
CLIENT_SECRET = os.getenv("KROGER_CLIENT_SECRET")
TOKEN_URL = "https://api.kroger.com/v1/connect/oauth2/token"
BASE_URL = "https://api.kroger.com/v1"

_token_cache = {"access_token": None, "expires_at": 0}


def get_access_token():
    """Return a cached token if still valid, otherwise fetch a new one."""
    if _token_cache["access_token"] and time.time() < _token_cache["expires_at"]:
        return _token_cache["access_token"]

    response = requests.post(
        TOKEN_URL,
        data={"grant_type": "client_credentials", "scope": "product.compact"},
        auth=(CLIENT_ID, CLIENT_SECRET),
        headers={"Content-Type": "application/x-www-form-urlencoded"},
    )
    response.raise_for_status()
    data = response.json()

    _token_cache["access_token"] = data["access_token"]
    # Refresh 60 seconds early so we never fire a request on an expired token
    _token_cache["expires_at"] = time.time() + data["expires_in"] - 60

    return _token_cache["access_token"]

def find_nearest_location(zip_code):
    """Return the locationId of the nearest Kroger-banner store to a zip code."""
    token = get_access_token()
    response = requests.get(
        f"{BASE_URL}/locations",
        headers={"Authorization": f"Bearer {token}"},
        params={"filter.zipCode.near": zip_code, "filter.limit": 1},
    )
    response.raise_for_status()
    locations = response.json()["data"]

    if not locations:
        return None

    return locations[0]["locationId"]

def search_products(search_term, location_id, limit=3):
    """Search for products at a specific store, return top matches with size + price."""
    token = get_access_token()
    response = requests.get(
        f"{BASE_URL}/products",
        headers={"Authorization": f"Bearer {token}"},
        params={
            "filter.term": search_term,
            "filter.locationId": location_id,
            "filter.limit": limit,
        },
    )
    response.raise_for_status()
    products = response.json()["data"]

    results = []
    for product in products:
        items = product.get("items", [])
        if not items:
            continue
        item = items[0]
        price_info = item.get("price", {})

        results.append({
            "name": product.get("description"),
            "size": item.get("size"),
            "price": price_info.get("regular"),
            "promo_price": price_info.get("promo"),
        })

    return results

if __name__ == "__main__":
    zip_code = "45202"  # replace with a real zip near a Kroger-banner store
    location_id = find_nearest_location(zip_code)
    print(f"Nearest location: {location_id}")

    results = search_products("white bread", location_id)
    for r in results:
        print(r)
