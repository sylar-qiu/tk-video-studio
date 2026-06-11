from starlette.middleware.base import BaseHTTPMiddleware
from starlette.requests import Request
from starlette.responses import JSONResponse, Response

from auth import auth_enabled, is_authenticated, is_public_api_path
from settings_loader import get_settings


class AuthMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request: Request, call_next) -> Response:
        if request.method == "OPTIONS":
            return await call_next(request)

        path = request.url.path
        if not path.startswith("/api/") or is_public_api_path(path):
            return await call_next(request)

        settings = get_settings()
        if not auth_enabled(settings):
            return await call_next(request)

        if is_authenticated(request, settings):
            return await call_next(request)

        return JSONResponse(status_code=401, content={"detail": "Unauthorized"})
