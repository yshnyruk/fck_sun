import logging
from typing import Any

from fastapi import Request, status
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse
from starlette.exceptions import HTTPException as StarletteHTTPException

from ..schemas.errors import error_response

logger = logging.getLogger(__name__)


def _http_error_code(status_code: int) -> str:
    codes = {
        status.HTTP_400_BAD_REQUEST: "BAD_REQUEST",
        status.HTTP_401_UNAUTHORIZED: "UNAUTHORIZED",
        status.HTTP_403_FORBIDDEN: "FORBIDDEN",
        status.HTTP_404_NOT_FOUND: "NOT_FOUND",
        status.HTTP_405_METHOD_NOT_ALLOWED: "METHOD_NOT_ALLOWED",
        status.HTTP_409_CONFLICT: "CONFLICT",
        status.HTTP_429_TOO_MANY_REQUESTS: "RATE_LIMITED",
    }
    return codes.get(status_code, "HTTP_ERROR")


async def validation_exception_handler(request: Request, exc: Exception) -> JSONResponse:
    if not isinstance(exc, RequestValidationError):
        raise TypeError("Expected a request validation error")

    details = [
        {
            "loc": [str(part) if not isinstance(part, int) else part for part in error["loc"]],
            "message": error["msg"],
            "type": error["type"],
        }
        for error in exc.errors()
    ]
    return JSONResponse(
        status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
        content=error_response(
            "VALIDATION_ERROR",
            "Request validation failed.",
            details,
        ),
    )


async def http_exception_handler(request: Request, exc: Exception) -> JSONResponse:
    if not isinstance(exc, StarletteHTTPException):
        raise TypeError("Expected an HTTP exception")

    detail: Any = exc.detail
    message = detail if isinstance(detail, str) else "Request could not be completed."
    details = None if isinstance(detail, str) else detail
    return JSONResponse(
        status_code=exc.status_code,
        headers=exc.headers,
        content=error_response(_http_error_code(exc.status_code), message, details),
    )


async def unexpected_exception_handler(request: Request, exc: Exception) -> JSONResponse:
    logger.exception("Unhandled exception while processing %s %s", request.method, request.url.path)
    return JSONResponse(
        status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
        content=error_response(
            "INTERNAL_SERVER_ERROR",
            "An unexpected error occurred.",
        ),
    )
