"""API trust boundaries. Limits are per process; deploy one worker behind an edge limiter."""
import asyncio
import hashlib
import io
import os
import re
import threading
import time
import warnings
from collections import OrderedDict, deque
from urllib.parse import urlsplit

import requests
from fastapi import HTTPException, Request
from PIL import Image, ImageOps, UnidentifiedImageError
from dotenv import load_dotenv
from starlette.responses import JSONResponse

load_dotenv(os.path.join(os.path.dirname(__file__), '.env'))

MAX_FILE_BYTES = 6 * 1024 * 1024
MAX_BODY_BYTES = MAX_FILE_BYTES + 64 * 1024
MAX_PIXELS = 16_000_000
SUPABASE_URL = os.getenv("SUPABASE_URL", "").rstrip("/")
SUPABASE_KEY = os.getenv("SUPABASE_PUBLISHABLE_KEY", "")
ALLOWED_ORIGINS = [value.strip().rstrip("/") for value in os.getenv(
    "ALLOWED_ORIGINS", "http://localhost:5500,http://127.0.0.1:5500,http://localhost:3000,http://127.0.0.1:3000"
).split(",") if value.strip()]
ALLOWED_HOSTS = [value.strip() for value in os.getenv(
    "ALLOWED_HOSTS", "localhost,127.0.0.1,testserver"
).split(",") if value.strip()]
if any(origin == "*" or urlsplit(origin).path or urlsplit(origin).query
       or urlsplit(origin).fragment or not urlsplit(origin).hostname
       or urlsplit(origin).scheme not in {"http", "https"} for origin in ALLOWED_ORIGINS):
    raise RuntimeError("ALLOWED_ORIGINS must contain exact http(s) origins without paths or wildcards")


class WindowLimiter:
    def __init__(self, capacity=10000):
        self.entries = OrderedDict()
        self.lock = threading.Lock()
        self.capacity = capacity

    def allow(self, key, limit, seconds=60):
        now = time.monotonic()
        # Hash identifiers: no receipt, token, email, or raw IP is retained in this map.
        key = hashlib.sha256(key.encode()).digest()
        with self.lock:
            hits = self.entries.get(key)
            if hits is None:
                if len(self.entries) >= self.capacity:
                    # Remove an expired bucket, never evict active limits to allow bypass.
                    oldest, previous = next(iter(self.entries.items()))
                    if previous and previous[-1] > now - seconds:
                        return False
                    self.entries.pop(oldest)
                hits = self.entries[key] = deque()
            while hits and hits[0] <= now - seconds:
                hits.popleft()
            if len(hits) >= limit:
                return False
            hits.append(now)
            self.entries.move_to_end(key)
            return True


limiter = WindowLimiter()


def require_user(request: Request):
    """Validate with Supabase Auth, never trust a browser flag or an unsigned JWT payload."""
    authorization = request.headers.get("authorization", "")
    if not re.fullmatch(r"Bearer [A-Za-z0-9_.-]{20,8192}", authorization):
        raise HTTPException(401, "Sign in to continue.", headers={"WWW-Authenticate": "Bearer"})
    parsed = urlsplit(SUPABASE_URL)
    if parsed.scheme != "https" or not parsed.hostname or parsed.username or parsed.path or not SUPABASE_KEY:
        raise HTTPException(503, "Account verification is not configured.")
    try:
        response = requests.get(
            SUPABASE_URL + "/auth/v1/user",
            headers={"Authorization": authorization, "apikey": SUPABASE_KEY},
            timeout=(3, 8), allow_redirects=False,
        )
        if response.status_code in {401, 403}:
            raise HTTPException(401, "Your session expired. Sign in again.", headers={"WWW-Authenticate": "Bearer"})
        if response.status_code != 200:
            raise HTTPException(503, "Account verification is temporarily unavailable.")
        user = response.json()
        if not isinstance(user, dict) or not isinstance(user.get("id"), str) or not user["id"] or user.get("is_anonymous"):
            raise HTTPException(401, "A registered account is required.")
    except (requests.RequestException, ValueError):
        raise HTTPException(503, "Account verification is temporarily unavailable.") from None
    scan = request.url.path == "/scan"
    if not limiter.allow("user:" + user["id"] + (":scan" if scan else ":api"), 6 if scan else 60):
        raise HTTPException(429, "Too many requests. Try again in a minute.", headers={"Retry-After": "60"})
    try:
        consent = requests.get(
            SUPABASE_URL + "/rest/v1/account_consents",
            headers={"Authorization": authorization, "apikey": SUPABASE_KEY},
            params={"select": "user_id", "user_id": "eq." + user["id"],
                    "terms_version": "eq.2026-10-22", "health_version": "eq.2026-10-22", "limit": "1"},
            timeout=(3, 8), allow_redirects=False,
        )
        if consent.status_code != 200:
            raise HTTPException(503, "Privacy preferences are temporarily unavailable.")
        rows = consent.json()
        if not isinstance(rows, list) or not rows:
            raise HTTPException(403, "Review the Terms and Consumer Health Data notice in your dashboard before continuing.")
    except (requests.RequestException, ValueError):
        raise HTTPException(503, "Privacy preferences are temporarily unavailable.") from None
    return user


def normalize_photo(raw):
    """Decode and re-encode approved formats, rejecting bombs and removing metadata."""
    try:
        with warnings.catch_warnings():
            warnings.simplefilter("error", Image.DecompressionBombWarning)
            with Image.open(io.BytesIO(raw)) as image:
                if image.format not in {"JPEG", "PNG", "WEBP"}:
                    raise HTTPException(415, "Use a JPEG, PNG, or WebP photo.")
                if image.width * image.height > MAX_PIXELS or max(image.size) > 10000 or getattr(image, "n_frames", 1) != 1:
                    raise HTTPException(413, "Use a single photo of at most 16 megapixels.")
                image.load()
                clean = ImageOps.exif_transpose(image).convert("RGB")
                clean.thumbnail((3072, 3072))
                output = io.BytesIO()
                clean.save(output, "JPEG", quality=90)
                return output.getvalue()
    except HTTPException:
        raise
    except (Image.DecompressionBombWarning, Image.DecompressionBombError):
        raise HTTPException(413, "The photo dimensions are too large.") from None
    except (UnidentifiedImageError, OSError, ValueError):
        raise HTTPException(422, "Could not read that file as a receipt photo.") from None


class SecurityMiddleware:
    """Bound the complete body before multipart parsing, including chunked uploads."""
    def __init__(self, app):
        self.app = app
        self.active_uploads = 0

    async def __call__(self, scope, receive, send):
        if scope["type"] != "http":
            return await self.app(scope, receive, send)

        async def secure_send(message):
            if message["type"] == "http.response.start":
                message.setdefault("headers", []).extend([
                    (b"x-content-type-options", b"nosniff"),
                    (b"x-frame-options", b"DENY"),
                    (b"referrer-policy", b"no-referrer"),
                    (b"cache-control", b"no-store"),
                    (b"content-security-policy", b"default-src 'none'; frame-ancestors 'none'; base-uri 'none'"),
                    (b"strict-transport-security", b"max-age=31536000"),
                ])
            await send(message)

        async def reject(status, detail, headers=None):
            await JSONResponse({"detail": detail}, status_code=status, headers=headers)(scope, receive, secure_send)

        headers = dict(scope["headers"])
        if len(scope.get("query_string", b"")) > 2048:
            return await reject(414, "The request URL is too long.")
        origin = headers.get(b"origin", b"").decode("latin1")
        if origin and origin not in ALLOWED_ORIGINS:
            return await reject(403, "This website origin is not allowed.")
        if scope["method"] == "OPTIONS":
            return await self.app(scope, receive, secure_send)
        peer = (scope.get("client") or ("unknown",))[0]
        if not limiter.allow("ip:" + peer, 120):
            return await reject(429, "Too many requests. Try again in a minute.", {"Retry-After": "60"})
        if scope["path"] != "/scan" or scope["method"] != "POST":
            return await self.app(scope, receive, secure_send)
        if not headers.get(b"authorization", b""):
            return await reject(401, "Sign in to scan receipts.", {"WWW-Authenticate": "Bearer"})
        if headers.get(b"content-encoding", b"identity") != b"identity":
            return await reject(415, "Compressed request bodies are not supported.")
        try:
            declared = int(headers.get(b"content-length", b"0"))
        except ValueError:
            return await reject(400, "Invalid content length.")
        if declared < 0 or declared > MAX_BODY_BYTES:
            return await reject(413, "Photo uploads must be 6 MB or smaller.")
        if self.active_uploads >= 2:
            return await reject(503, "The scanner is busy. Try again shortly.", {"Retry-After": "10"})
        self.active_uploads += 1
        try:
            body = bytearray()
            deadline = time.monotonic() + 20
            while True:
                try:
                    message = await asyncio.wait_for(receive(), timeout=max(0.001, deadline - time.monotonic()))
                except asyncio.TimeoutError:
                    return await reject(408, "The upload timed out.")
                if message["type"] == "http.disconnect":
                    return
                chunk = message.get("body", b"")
                if len(body) + len(chunk) > MAX_BODY_BYTES:
                    return await reject(413, "Photo uploads must be 6 MB or smaller.")
                body.extend(chunk)
                if not message.get("more_body", False):
                    break
            async def buffered_receive():
                nonlocal body
                if body is None:
                    return await receive()
                message = {"type": "http.request", "body": bytes(body), "more_body": False}
                body = None
                return message
            await self.app(scope, buffered_receive, secure_send)
        finally:
            self.active_uploads -= 1
