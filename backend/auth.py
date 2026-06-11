"""Invite-code whitelist and signed session cookies."""

from __future__ import annotations

import hashlib
import hmac
import time
from typing import TYPE_CHECKING

from fastapi import Request, Response

if TYPE_CHECKING:
    from settings_loader import StudioSettings

SESSION_COOKIE_NAME = "tk_studio_session"
SESSION_MAX_AGE_SEC = 30 * 24 * 3600


def auth_enabled(settings: StudioSettings) -> bool:
    return bool(settings.invite_codes)


def _normalize_code(code: str) -> str:
    trimmed = code.strip()
    if trimmed.upper().startswith("WJ-"):
        return "WJ-" + trimmed[3:].strip().lower()
    return trimmed.upper()


def verify_invite_code(code: str, settings: StudioSettings) -> bool:
    normalized = _normalize_code(code)
    if not normalized:
        return False
    for candidate in settings.invite_codes:
        if hmac.compare_digest(normalized, _normalize_code(candidate)):
            return True
    return False


def _signing_key(settings: StudioSettings) -> bytes:
    secret = settings.auth_secret
    if secret:
        return secret.encode("utf-8")
    material = "|".join(sorted(_normalize_code(c) for c in settings.invite_codes))
    return hashlib.sha256(material.encode("utf-8")).digest()


def _sign_payload(payload: str, settings: StudioSettings) -> str:
    return hmac.new(_signing_key(settings), payload.encode("utf-8"), hashlib.sha256).hexdigest()


def create_session_token(settings: StudioSettings) -> str:
    expires = int(time.time()) + SESSION_MAX_AGE_SEC
    payload = str(expires)
    return f"{payload}.{_sign_payload(payload, settings)}"


def verify_session_token(token: str | None, settings: StudioSettings) -> bool:
    if not token or not auth_enabled(settings):
        return not auth_enabled(settings)
    parts = token.split(".", 1)
    if len(parts) != 2:
        return False
    payload, signature = parts
    if not payload.isdigit():
        return False
    if not hmac.compare_digest(signature, _sign_payload(payload, settings)):
        return False
    return int(payload) >= int(time.time())


def get_session_token(request: Request) -> str | None:
    return request.cookies.get(SESSION_COOKIE_NAME)


def is_authenticated(request: Request, settings: StudioSettings) -> bool:
    if not auth_enabled(settings):
        return True
    return verify_session_token(get_session_token(request), settings)


def set_session_cookie(response: Response, settings: StudioSettings) -> None:
    response.set_cookie(
        key=SESSION_COOKIE_NAME,
        value=create_session_token(settings),
        httponly=True,
        samesite="lax",
        max_age=SESSION_MAX_AGE_SEC,
        path="/",
    )


def clear_session_cookie(response: Response) -> None:
    response.delete_cookie(key=SESSION_COOKIE_NAME, path="/")


def is_public_api_path(path: str) -> bool:
    if path == "/api/health":
        return True
    if path.startswith("/api/auth/"):
        return True
    return False
