import functools
import http.client
import http.server
import threading
import unittest

from serve import Handler, folder


class NotFoundTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.server = http.server.ThreadingHTTPServer(
            ("127.0.0.1", 0), functools.partial(Handler, directory=str(folder))
        )
        cls.thread = threading.Thread(target=cls.server.serve_forever, daemon=True)
        cls.thread.start()

    @classmethod
    def tearDownClass(cls):
        cls.server.shutdown()
        cls.server.server_close()
        cls.thread.join()

    def request(self, path, method="GET"):
        connection = http.client.HTTPConnection(*self.server.server_address)
        try:
            connection.request(method, path)
            response = connection.getresponse()
            return response.status, dict(response.getheaders()), response.read()
        finally:
            connection.close()

    def test_missing_pages_and_assets_return_custom_404(self):
        for path in ("/missing", "/nested/missing/page?test=1", "/missing.png"):
            with self.subTest(path=path):
                status, headers, body = self.request(path)
                self.assertEqual(status, 404)
                self.assertEqual(headers["Content-Type"], "text/html; charset=utf-8")
                self.assertEqual(body, (folder / "404.html").read_bytes())

    def test_head_has_same_status_and_length_without_body(self):
        status, headers, body = self.request("/nested/missing?test=1", "HEAD")
        self.assertEqual(status, 404)
        self.assertEqual(int(headers["Content-Length"]), (folder / "404.html").stat().st_size)
        self.assertEqual(body, b"")

    def test_existing_pages_and_assets_still_work(self):
        for path in ("/", "/about?test=1", "/shared.css", "/images/breadwinner_logo_black.png"):
            with self.subTest(path=path):
                self.assertEqual(self.request(path)[0], 200)


if __name__ == "__main__":
    unittest.main()
