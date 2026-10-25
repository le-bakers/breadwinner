# Local website server. Same clean addresses as Vercel (reads frontend/vercel.json).
# Run:  py serve.py   ->  http://localhost:5500/home
import functools, http.server, json, pathlib

folder = pathlib.Path(__file__).parent / "frontend"
rewrites = {r["source"]: r["destination"] for r in json.loads((folder / "vercel.json").read_text())["rewrites"]}

class Handler(http.server.SimpleHTTPRequestHandler):
    def send_error(self, code, message=None, explain=None):
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
        path, _, query = self.path.partition("?")
        if path in rewrites:
            self.path = rewrites[path] + ("?" + query if query else "")
        super().do_GET()

    def do_HEAD(self):
        self.path = rewrites.get(self.path.partition("?")[0], self.path)
        super().do_HEAD()

if __name__ == "__main__":
    http.server.ThreadingHTTPServer(("", 5500), functools.partial(Handler, directory=str(folder))).serve_forever()
