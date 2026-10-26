import os
import time

import requests
from dotenv import load_dotenv

load_dotenv()

ID = os.getenv("KROGER_CLIENT_ID")
SECRET = os.getenv("KROGER_CLIENT_SECRET")
LOGIN = "https://api.kroger.com/v1/connect/oauth2/token"
BASE = "https://api.kroger.com/v1"
TIMEOUT = 10
AGENT = "BreadWinner/1.0 (celiac receipt tracker)"
PROXY = os.getenv("KROGER_PROXY_URL")
KEY = os.getenv("KROGER_PROXY_KEY")

print(f"Kroger forwarder: {PROXY or 'off, asking Kroger directly'}, password {'set' if KEY else 'missing'}")

_login = {"token": None, "expires": 0}
_stores = {}


def check(response):
    """Raise an error when Kroger says no and log Kroger's own reply"""
    try:
        response.raise_for_status()
    except requests.HTTPError:
        print(f"Kroger said {response.status_code}: {response.text[:300]}")
        raise


def ask(path, params):
    """Ask Kroger for store or product data through the Vercel forwarder when one is set"""
    headers = {"Authorization": f"Bearer {token()}", "User-Agent": AGENT}
    if PROXY:
        headers["X-Proxy-Key"] = KEY
        response = requests.get(PROXY, headers=headers, params={**params, "path": path}, timeout=TIMEOUT)
    else:
        response = requests.get(BASE + path, headers=headers, params=params, timeout=TIMEOUT)
    check(response)
    return response.json()["data"]


def token():
    """Return the saved Kroger login token or fetch a new one when it is about to expire"""
    if _login["token"] and time.time() < _login["expires"]:
        return _login["token"]

    response = requests.post(
        LOGIN,
        data={"grant_type": "client_credentials", "scope": "product.compact"},
        auth=(ID, SECRET),
        headers={"Content-Type": "application/x-www-form-urlencoded", "User-Agent": AGENT},
        timeout=TIMEOUT,
    )
    check(response)
    data = response.json()

    _login["token"] = data["access_token"]
    _login["expires"] = time.time() + data["expires_in"] - 60
    return _login["token"]


def store(code):
    """Find the nearest Kroger-family store to a zip code once and remember it"""
    if code not in _stores:
        found = ask("/locations", {"filter.zipCode.near": code, "filter.limit": 1})
        _stores[code] = found[0]["locationId"] if found else None
    return _stores[code]


def search(term, location, limit):
    """Search one store and return each product's name size regular price and sale price"""
    products = ask("/products", {
        "filter.term": term,
        "filter.locationId": location,
        "filter.limit": limit,
    })

    results = []
    for product in products:
        items = product.get("items", [])
        if not items:
            continue
        price = items[0].get("price", {})
        results.append({
            "name": product.get("description"),
            "size": items[0].get("size"),
            "price": price.get("regular"),
            "promo_price": price.get("promo"),
        })

    return results
