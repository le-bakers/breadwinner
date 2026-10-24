# TEMPORARY test page, run by Vercel at /api/kroger_check.
# Kroger's firewall blocks data requests from Render (2026-10-23). This asks the same 4 questions from
# Vercel's computers, to see whether Kroger accepts them there. Shows no keys and no user data.
# Uses only Python's built-in tools, so Vercel needs no requirements file. Delete once Kroger is solved.
import base64
import json
import os
import urllib.parse
import urllib.request
from http.server import BaseHTTPRequestHandler

KROGER = "https://api.kroger.com/v1"
USER_AGENT = "BreadWinner/1.0 (celiac receipt tracker)"


def ask(url, headers, data=None):
    """Send one request. Returns (status code, reply text), even when Kroger says no."""
    request = urllib.request.Request(url, data=data, headers={**headers, "User-Agent": USER_AGENT})
    try:
        with urllib.request.urlopen(request, timeout=10) as reply:
            return reply.status, reply.read().decode()
    except urllib.error.HTTPError as error:
        return error.code, error.read().decode(errors="replace")
    except OSError as error:
        return 0, str(error)


def run_checks():
    report = {"server_address": ask("https://api.ipify.org", {})[1]}

    keys = f"{os.getenv('KROGER_CLIENT_ID')}:{os.getenv('KROGER_CLIENT_SECRET')}"
    status, text = ask(
        f"{KROGER}/connect/oauth2/token",
        {
            "Authorization": "Basic " + base64.b64encode(keys.encode()).decode(),
            "Content-Type": "application/x-www-form-urlencoded",
        },
        data=b"grant_type=client_credentials&scope=product.compact",
    )
    if status != 200:
        report["1_login"] = f"{status} (are the Kroger keys set in Vercel?)"
        return report
    report["1_login"] = "worked"
    token = json.loads(text)["access_token"]

    # Store 09700409 is the Harris Teeter nearest zip 20871
    steps = {
        "2_store_lookup_by_zip": "/locations?" + urllib.parse.urlencode({"filter.zipCode.near": "20871", "filter.limit": 1}),
        "3_store_lookup_by_id": "/locations/09700409",
        "4_product_search_at_store": "/products?" + urllib.parse.urlencode({"filter.term": "carrots", "filter.locationId": "09700409", "filter.limit": 1}),
        "5_product_search_no_store": "/products?" + urllib.parse.urlencode({"filter.term": "carrots", "filter.limit": 1}),
    }
    for name, path in steps.items():
        status, text = ask(KROGER + path, {"Authorization": f"Bearer {token}"})
        report[name] = f"{status} (firewall page)" if "Access Denied" in text else str(status)
    return report


class handler(BaseHTTPRequestHandler):
    def do_GET(self):
        body = json.dumps(run_checks()).encode()
        self.send_response(200)
        self.send_header("Content-Type", "application/json")
        self.end_headers()
        self.wfile.write(body)
