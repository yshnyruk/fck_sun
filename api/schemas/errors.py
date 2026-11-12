from typing import Any

from pydantic import BaseModel


class ValidationErrorDetail(BaseModel):
    loc: list[str | int]
    message: str
    type: str


class ErrorBody(BaseModel):
    code: str
    message: str
    details: list[ValidationErrorDetail] | Any | None = None


class ErrorResponse(BaseModel):
    error: ErrorBody


def error_response(
    code: str,
    message: str,
    details: list[ValidationErrorDetail] | Any | None = None,
) -> dict[str, dict[str, Any]]:
    return {
        "error": {
            "code": code,
            "message": message,
            "details": details,
        }
    }
