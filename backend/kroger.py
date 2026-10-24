import os
import time
import requests
from dotenv import load_dotenv

load_dotenv()

CLIENT_ID = os.getenv("KROGER_CLIENT_ID")
CLIENT_SECRET = os.getenv("KROGER_CLIENT_SECRET")
TOKEN_URL = "https://api.kroger.com/v1/connect/oauth2/token"
BASE_URL = "https://api.kroger.com/v1"
TIMEOUT = 10  # seconds to wait for Kroger before giving up
USER_AGENT = "BreadWinner/1.0 (celiac receipt tracker)"

# Kroger's firewall refuses store and product requests from Render's address (but not the login), and accepts
# Vercel's (tested 2026-10-23). So on Render these requests go through our forwarder on Vercel
# (frontend/api/kroger.py). Unset on the laptop = ask Kroger directly.
PROXY_URL = os.getenv("KROGER_PROXY_URL")
PROXY_KEY = os.getenv("KROGER_PROXY_KEY")  # shared secret, so only our server can use the forwarder
print(f"Kroger forwarder: {PROXY_URL or 'off, asking Kroger directly'}, password {'set' if PROXY_KEY else 'missing'}")

_token_cache = {"access_token": None, "expires_at": 0}


def check_reply(response):
    """Stop with an error if Kroger said no, and print Kroger's own words so the server log shows why."""
    try:
        response.raise_for_status()
    except requests.HTTPError:
        print(f"Kroger said {response.status_code}: {response.text[:300]}")  # never contains our keys
        raise


def ask_kroger(path, params):
    """Ask Kroger for store or product data (path like "/locations"), through the Vercel forwarder when one is set."""
    headers = {"Authorization": f"Bearer {get_access_token()}", "User-Agent": USER_AGENT}
    if PROXY_URL:
        headers["X-Proxy-Key"] = PROXY_KEY
        response = requests.get(PROXY_URL, headers=headers, params={**params, "path": path}, timeout=TIMEOUT)
    else:
        response = requests.get(BASE_URL + path, headers=headers, params=params, timeout=TIMEOUT)
    check_reply(response)
    return response.json()["data"]


def get_access_token():
    """Return a cached token if still valid, otherwise fetch a new one."""
    if _token_cache["access_token"] and time.time() < _token_cache["expires_at"]:
        return _token_cache["access_token"]

    response = requests.post(
        TOKEN_URL,
        data={"grant_type": "client_credentials", "scope": "product.compact"},
        auth=(CLIENT_ID, CLIENT_SECRET),
        headers={"Content-Type": "application/x-www-form-urlencoded", "User-Agent": USER_AGENT},
        timeout=TIMEOUT,
    )
    check_reply(response)
    data = response.json()

    _token_cache["access_token"] = data["access_token"]
    # Refresh 60 seconds early so we never fire a request on an expired token
    _token_cache["expires_at"] = time.time() + data["expires_in"] - 60

    return _token_cache["access_token"]

_location_cache = {}  # zip code -> locationId, so each zip is only looked up once


def find_nearest_location(zip_code):
    """Return the locationId of the nearest Kroger-banner store to a zip code."""
    if zip_code in _location_cache:
        return _location_cache[zip_code]

    locations = ask_kroger("/locations", {"filter.zipCode.near": zip_code, "filter.limit": 1})

    # None means no Kroger-banner store is near that zip code
    location_id = locations[0]["locationId"] if locations else None
    _location_cache[zip_code] = location_id
    return location_id

def search_products(search_term, location_id, limit=3):
    """Search for products at a specific store, return top matches with size + price."""
    products = ask_kroger("/products", {
        "filter.term": search_term,
        "filter.locationId": location_id,
        "filter.limit": limit,
    })

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

    if location_id is None:
        print("No Kroger-banner store near that zip code.")
    else:
        results = search_products("white bread", location_id)
        for r in results:
            print(r)
