# pytest runs this file before every test. Its one job: make it impossible for a test to
# reach the real Gemini API, so running tests never uses up free requests or costs money.

import os

# Set before server.py and gemini.py are imported, so they start up with Gemini switched off
os.environ["OCR_ENGINE"] = "local"
os.environ["GEMINI_API_KEY"] = ""
os.environ["CLOUD_OCR_APPROVED"] = "false"

import types

import pytest
import requests

import gemini


@pytest.fixture(autouse=True)
def isolated_api(monkeypatch):
    import security
    import server
    security.limiter = security.WindowLimiter()
    # Business-logic tests use a pretend identity. test_security removes the override.
    server.app.dependency_overrides[security.require_user] = lambda: {"id": "test-user"}
    monkeypatch.setattr(server, "CLOUD_OCR_APPROVED", False)
    monkeypatch.setattr(requests.sessions.Session, "request", lambda *a, **k: (_ for _ in ()).throw(AssertionError("Tests must not access external services")))
    yield
    server.app.dependency_overrides.clear()


@pytest.fixture(autouse=True)
def no_real_gemini(monkeypatch):
    def blocked(*args, **kwargs):
        raise AssertionError("A test tried to call the real Gemini API.")

    # gemini.py gets a pretend "requests" whose post() refuses to send anything.
    # Tests that want a Gemini answer swap in their own pretend post() (see test_scan.py).
    pretend_requests = types.SimpleNamespace(post=blocked, RequestException=requests.RequestException)
    monkeypatch.setattr(gemini, "requests", pretend_requests)

    # Start every test with no key, no requests counted and no model resting
    monkeypatch.setattr(gemini, "API_KEY", "")
    monkeypatch.setattr(gemini, "_usage", {"day": None, "count": 0})
    monkeypatch.setattr(gemini, "_resting_until", {})
