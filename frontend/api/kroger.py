import hmac
import os
import urllib.error
import urllib.parse
import urllib.request
from http.server import BaseHTTPRequestHandler

KROGER = "https://api.kroger.com/v1"
PATHS = ("/locations", "/products")
AGENT = "BreadWinner/1.0 (celiac receipt tracker)"


def allowed(path):
    """Check that a path is a Kroger store or product lookup"""
    if ".." in path:
        return False
    return any(path == start or path.startswith(start + "/") for start in PATHS)


class handler(BaseHTTPRequestHandler):
    def do_GET(self):
        """Pass our server's store and product lookups on to Kroger from Vercel's address"""
        secret = os.getenv("KROGER_PROXY_KEY", "")
        if not secret or not hmac.compare_digest(self.headers.get("X-Proxy-Key", ""), secret):
            return self.reply(403, b'{"error": "not allowed"}')

        query = dict(urllib.parse.parse_qsl(urllib.parse.urlsplit(self.path).query))
        path = query.pop("path", "")
        if not allowed(path):
            return self.reply(400, b'{"error": "only store and product lookups"}')

        request = urllib.request.Request(
            KROGER + path + "?" + urllib.parse.urlencode(query),
            headers={
                "Authorization": self.headers.get("Authorization", ""),
                "Accept": "application/json",
                "User-Agent": AGENT,
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
        """Send a JSON answer with the given status code"""
        self.send_response(status)
        self.send_header("Content-Type", "application/json")
        self.end_headers()
        self.wfile.write(body)
