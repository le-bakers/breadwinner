"""Trust-boundary regressions, never live Supabase/Gemini calls."""
import asyncio
import io
import math
import types

import pytest
from fastapi.testclient import TestClient
from PIL import Image

import gemini
import security
import server

TOKEN = "Bearer " + "a" * 40


def client():
    return TestClient(server.app, headers={"Authorization": TOKEN})


def image_bytes(format="PNG", size=(20, 30)):
    out = io.BytesIO()
    image = Image.new("RGB", size)
    image.save(out, format)
    return out.getvalue()


@pytest.mark.parametrize("route", ["/scan", "/suggest?zip=12345&term=bread&gf_price=4", "/kroger/search?zip=12345&term=bread"])
def test_api_cannot_be_authorized_with_browser_identity_flag(route):
    server.app.dependency_overrides.clear()
    anonymous = TestClient(server.app)
    result = anonymous.post(route, files={"file": ("receipt.png", image_bytes(), "image/png")}) if route == "/scan" else anonymous.get(route)
    assert result.status_code == 401
    assert result.headers["www-authenticate"] == "Bearer"


def test_rejected_origin_host_and_docs():
    assert client().get("/", headers={"Origin": "https://evil.example"}).status_code == 403
    assert client().get("/", headers={"Host": "evil.example"}).status_code == 400
    assert client().get("/docs").status_code == 404
    response = client().get("/", headers={"Origin": "http://localhost:5500"})
    assert response.headers["access-control-allow-origin"] == "http://localhost:5500"
    assert response.headers["cache-control"] == "no-store"
    assert response.headers["x-content-type-options"] == "nosniff"


def test_cors_preflight_supports_bearer_header():
    result = client().options("/scan", headers={"Origin": "http://localhost:5500", "Access-Control-Request-Method": "POST", "Access-Control-Request-Headers": "authorization,content-type"})
    assert result.status_code == 200
    assert "authorization" in result.headers["access-control-allow-headers"].lower()


def test_upload_limits_apply_before_image_decoder(monkeypatch):
    monkeypatch.setattr(server, "read_items", lambda _: pytest.fail("invalid image reached OCR"))
    response = client().post("/scan", content=b"x", headers={"Content-Length": str(security.MAX_BODY_BYTES + 1)})
    assert response.status_code == 413
    response = client().post("/scan", files={"file": ("fake.jpg", b"<svg onload='alert(1)'/>", "image/jpeg")})
    assert response.status_code == 422
    response = client().post("/scan", files={"file": ("moving.gif", image_bytes("GIF"), "image/gif")})
    assert response.status_code == 415


def test_chunked_limit_does_not_trust_content_length():
    events = iter([
        {"type": "http.request", "body": b"x" * security.MAX_BODY_BYTES, "more_body": True},
        {"type": "http.request", "body": b"x", "more_body": False},
    ])
    sent = []
    async def receive():
        return next(events)
    async def send(message):
        sent.append(message)
    async def downstream(*args):
        pytest.fail("oversized multipart reached downstream")
    middleware = security.SecurityMiddleware(downstream)
    scope = {"type": "http", "method": "POST", "path": "/scan", "query_string": b"", "client": ("test", 1), "headers": [(b"authorization", TOKEN.encode())]}
    asyncio.run(middleware(scope, receive, send))
    assert sent[0]["status"] == 413
    assert middleware.active_uploads == 0


def test_dimensions_and_metadata():
    with pytest.raises(Exception) as error:
        security.normalize_photo(image_bytes(size=(4100, 4000)))
    assert error.value.status_code == 413
    out = io.BytesIO()
    photo = Image.new("RGB", (20, 20))
    exif = Image.Exif()
    exif[270] = "private identifying information"
    photo.save(out, "JPEG", exif=exif)
    clean = Image.open(io.BytesIO(security.normalize_photo(out.getvalue())))
    assert not clean.getexif()
    assert clean.format == "JPEG"


@pytest.mark.parametrize("gf_price", ["nan", "inf", "-inf"])
def test_nonfinite_prices_cannot_reach_calculations(gf_price):
    assert client().get("/deduction", params={"gf_price": gf_price}).status_code == 422


def test_ai_output_rejects_nonfinite_and_unbounded_prices():
    assert gemini.clean_items([{"name": "bad", "price": p} for p in [math.nan, math.inf, True, 1000]]) == []
    assert gemini.clean_subtotal(math.inf) is None


def test_rate_limit_and_capacity_do_not_grow_without_bound():
    rate = security.WindowLimiter(capacity=1)
    assert rate.allow("one", 2)
    assert rate.allow("one", 2)
    assert not rate.allow("one", 2)
    assert not rate.allow("two", 2)
    assert len(rate.entries) == 1


def test_cloud_ocr_requires_operator_approval(monkeypatch):
    monkeypatch.setattr(server, "OCR_ENGINE", "gemini")
    monkeypatch.setattr(server, "CLOUD_OCR_APPROVED", False)
    monkeypatch.setattr(server, "read_locally", lambda _: ([], None))
    monkeypatch.setattr(gemini, "read_receipt", lambda _: pytest.fail("unapproved provider reached"))
    assert server.read_items(image_bytes()) == ("local", [], None)


def test_auth_is_verified_with_provider_and_current_consent(monkeypatch):
    server.app.dependency_overrides.clear()
    monkeypatch.setattr(security, "SUPABASE_URL", "https://project.supabase.co")
    monkeypatch.setattr(security, "SUPABASE_KEY", "public-key")
    calls = []
    def get(url, **kwargs):
        calls.append((url, kwargs))
        payload = {"id": "user-1"} if url.endswith('/user') else [{"user_id": "user-1"}]
        return types.SimpleNamespace(status_code=200, json=lambda: payload)
    monkeypatch.setattr(security.requests, "get", get)
    monkeypatch.setattr(server.kroger, "find_nearest_location", lambda _: None)
    assert client().get("/kroger/search?zip=12345&term=bread").status_code == 404
    assert len(calls) == 2
    assert calls[0][1]["headers"]["Authorization"] == TOKEN
    assert calls[0][1]["allow_redirects"] is False
    assert calls[1][1]["params"]["user_id"] == "eq.user-1"


@pytest.mark.parametrize("status, payload, expected", [(401, {}, 401), (500, {}, 503), (200, {}, 401)])
def test_invalid_or_unavailable_identity_fails_closed(monkeypatch, status, payload, expected):
    server.app.dependency_overrides.clear()
    monkeypatch.setattr(security, "SUPABASE_URL", "https://project.supabase.co")
    monkeypatch.setattr(security, "SUPABASE_KEY", "public-key")
    monkeypatch.setattr(security.requests, "get", lambda *a, **k: types.SimpleNamespace(status_code=status, json=lambda: payload))
    assert client().get("/kroger/search?zip=12345&term=bread").status_code == expected


def test_missing_or_withdrawn_consent_blocks_authenticated_processing(monkeypatch):
    server.app.dependency_overrides.clear()
    monkeypatch.setattr(security, "SUPABASE_URL", "https://project.supabase.co")
    monkeypatch.setattr(security, "SUPABASE_KEY", "public-key")
    def get(url, **kwargs):
        payload = {"id": "user-1"} if url.endswith('/user') else []
        return types.SimpleNamespace(status_code=200, json=lambda: payload)
    monkeypatch.setattr(security.requests, "get", get)
    monkeypatch.setattr(server.kroger, "find_nearest_location", lambda _: pytest.fail("Unconsented request reached Kroger"))
    assert client().get("/kroger/search?zip=12345&term=bread").status_code == 403


def test_missing_auth_configuration_never_falls_back_to_demo(monkeypatch):
    server.app.dependency_overrides.clear()
    monkeypatch.setattr(security, "SUPABASE_URL", "")
    assert client().get("/kroger/search?zip=12345&term=bread").status_code == 503
