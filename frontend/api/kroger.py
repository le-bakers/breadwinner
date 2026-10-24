# Kroger forwarder, run by Vercel at /api/kroger.
# Kroger's firewall refuses store and product requests from Render's address but accepts Vercel's
# (tested 2026-10-23). So the Python server on Render sends those requests here, and this passes them on.
# The server still logs in to Kroger itself and sends its own token along, so no Kroger keys live here.
# Only our server may use it (secret KROGER_PROXY_KEY), and only for Kroger's store and product lookups.
import hmac
import os
import urllib.error
import urllib.parse
import urllib.request
from http.server import BaseHTTPRequestHandler

KROGER = "https://api.kroger.com/v1"
ALLOWED = ("/locations", "/products")
USER_AGENT = "BreadWinner/1.0 (celiac receipt tracker)"


def is_allowed(path):
    """True for "/locations", "/products" and the pages under them (like "/locations/09700409")."""
    if ".." in path:
        return False
    return any(path == start or path.startswith(start + "/") for start in ALLOWED)


class handler(BaseHTTPRequestHandler):
    def do_GET(self):
        secret = os.getenv("KROGER_PROXY_KEY", "")
        if not secret or not hmac.compare_digest(self.headers.get("X-Proxy-Key", ""), secret):
            return self.reply(403, b'{"error": "not allowed"}')

        # Everything in the address except "path" is passed on to Kroger unchanged
        query = dict(urllib.parse.parse_qsl(urllib.parse.urlsplit(self.path).query))
        path = query.pop("path", "")
        if not is_allowed(path):
            return self.reply(400, b'{"error": "only store and product lookups"}')

        request = urllib.request.Request(
            KROGER + path + "?" + urllib.parse.urlencode(query),
            headers={
                "Authorization": self.headers.get("Authorization", ""),
                "Accept": "application/json",
                "User-Agent": USER_AGENT,
            },
        )
        try:
            with urllib.request.urlopen(request, timeout=10) as answer:
                self.reply(answer.status, answer.read())
        except urllib.error.HTTPError as error:
            self.reply(error.code, error.read())
        except OSError:
            self.reply(504, b'{"error": "Kroger did not answer"}')

    def reply(self, status, body):
        self.send_response(status)
        self.send_header("Content-Type", "application/json")
        self.end_headers()
        self.wfile.write(body)
