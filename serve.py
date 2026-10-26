import functools
import http.server
import json
import pathlib

folder = pathlib.Path(__file__).parent / "frontend"
rewrites = {r["source"]: r["destination"] for r in json.loads((folder / "vercel.json").read_text())["rewrites"]}


class Handler(http.server.SimpleHTTPRequestHandler):
    def send_error(self, code, message=None, explain=None):
        """Show the site's own 404 page instead of the default error page"""
        if code != 404:
            return super().send_error(code, message, explain)
        content = (folder / "404.html").read_bytes()
        self.send_response(404)
        self.send_header("Content-Type", "text/html; charset=utf-8")
        self.send_header("Content-Length", str(len(content)))
        self.end_headers()
        if self.command != "HEAD":
            self.wfile.write(content)

    def do_GET(self):
        """Serve a page using the same clean addresses as Vercel"""
        path, _, query = self.path.partition("?")
        if path in rewrites:
            self.path = rewrites[path] + ("?" + query if query else "")
        super().do_GET()

    def do_HEAD(self):
        """Answer a header-only request using the same clean addresses as Vercel"""
        self.path = rewrites.get(self.path.partition("?")[0], self.path)
        super().do_HEAD()


if __name__ == "__main__":
    http.server.ThreadingHTTPServer(("", 5500), functools.partial(Handler, directory=str(folder))).serve_forever()
