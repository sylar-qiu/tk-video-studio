from fastapi import APIRouter, HTTPException, Request, Response
from pydantic import BaseModel, Field

from auth import (
    auth_enabled,
    clear_session_cookie,
    is_authenticated,
    set_session_cookie,
    verify_invite_code,
)
from settings_loader import get_settings

router = APIRouter(prefix="/api", tags=["auth"])


class VerifyInviteBody(BaseModel):
    code: str = Field(min_length=1, max_length=128)


@router.get("/auth/status")
def auth_status(request: Request):
    settings = get_settings()
    required = auth_enabled(settings)
    return {
        "required": required,
        "authenticated": is_authenticated(request, settings),
    }


@router.post("/auth/verify")
def verify_invite(body: VerifyInviteBody, response: Response):
    settings = get_settings()
    if not auth_enabled(settings):
        return {"ok": True, "required": False}
    if not verify_invite_code(body.code, settings):
        raise HTTPException(status_code=401, detail="邀请码无效")
    set_session_cookie(response, settings)
    return {"ok": True, "required": True}


@router.post("/auth/logout")
def logout(response: Response):
    clear_session_cookie(response)
    return {"ok": True}
