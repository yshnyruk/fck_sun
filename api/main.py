from fastapi import FastAPI
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from starlette.exceptions import HTTPException as StarletteHTTPException

from .api.routes import router
from .core.config import get_settings
from .core.error_handlers import (
    http_exception_handler,
    unexpected_exception_handler,
    validation_exception_handler,
)
from .schemas.errors import ErrorResponse

settings = get_settings()
app = FastAPI(
    title=settings.app_name,
    responses={
        400: {"model": ErrorResponse},
        404: {"model": ErrorResponse},
        422: {"model": ErrorResponse},
        500: {"model": ErrorResponse},
    },
)
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origin_list,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)
app.include_router(router)

app.add_exception_handler(RequestValidationError, validation_exception_handler)
app.add_exception_handler(StarletteHTTPException, http_exception_handler)
app.add_exception_handler(Exception, unexpected_exception_handler)
