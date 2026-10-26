import os

os.environ["OCR_ENGINE"] = "local"
os.environ["GEMINI_API_KEY"] = ""

import types

import pytest
import requests

import gemini


@pytest.fixture(autouse=True)
def offline(monkeypatch):
    """Stop every test from reaching the real Gemini API and reset its counters"""
    def blocked(*args, **kwargs):
        """Fail the test when it tries to send a real Gemini request"""
        raise AssertionError("A test tried to call the real Gemini API.")

    monkeypatch.setattr(gemini, "requests", types.SimpleNamespace(post=blocked, RequestException=requests.RequestException))
    monkeypatch.setattr(gemini, "KEY", "")
    monkeypatch.setattr(gemini, "_usage", {"day": None, "count": 0})
    monkeypatch.setattr(gemini, "_resting", {})
