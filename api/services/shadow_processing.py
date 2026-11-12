"""Convert provider shadow payloads into FckSun's internal shadow models."""

from collections.abc import Mapping
from datetime import datetime
from typing import Any

from pydantic import ValidationError

from api.schemas.routes import ShadeClassification
from api.schemas.shadows import ShadowRequest, ShadowResponse


class ShadowResponseProcessingError(Exception):
    """Raised when a provider shadow response cannot be normalized."""


def process_shademap_response(
    payload: Mapping[str, Any],
    request: ShadowRequest,
) -> ShadowResponse:
    """Normalize a ShadeMap response without exposing provider fields to callers."""
    data = _unwrap_payload(payload)
    data.setdefault("viewport", request.viewport.model_dump())
    data.setdefault("requested_time", request.requested_time)
    if "coverage_confidence" not in data and "coverage" in data:
        data["coverage_confidence"] = data["coverage"]

    if "samples" in data:
        raw_samples = data["samples"]
        if not isinstance(raw_samples, list):
            raise ShadowResponseProcessingError("ShadeMap samples must be a list")
        data["samples"] = [_normalize_sample(sample, request) for sample in raw_samples]
    elif isinstance(data.get("features"), list):
        data["samples"] = [
            _normalize_feature(feature, request)
            for feature in data["features"]
            if isinstance(feature, Mapping)
        ]

    try:
        return ShadowResponse.model_validate(data)
    except ValidationError as error:
        raise ShadowResponseProcessingError(
            "ShadeMap returned invalid shadow information"
        ) from error


def _unwrap_payload(payload: Mapping[str, Any]) -> dict[str, Any]:
    nested_data = payload.get("data")
    if isinstance(nested_data, Mapping):
        return dict(nested_data)
    return dict(payload)


def _normalize_sample(sample: Any, request: ShadowRequest) -> dict[str, Any]:
    if not isinstance(sample, Mapping):
        raise ShadowResponseProcessingError("ShadeMap sample must be an object")

    location = sample.get("location")
    if not isinstance(location, Mapping):
        raise ShadowResponseProcessingError("ShadeMap sample location is missing")

    classification = _normalize_classification(
        sample.get("classification", sample.get("shade_status", sample.get("shade")))
    )
    evaluated_time, time_was_valid = _normalize_time(
        sample.get("evaluated_time", sample.get("timestamp", sample.get("time"))),
        request.requested_time,
    )
    unknown_reason = sample.get("unknown_reason")
    if classification is ShadeClassification.UNKNOWN:
        unknown_reason = _unknown_reason(unknown_reason, time_was_valid)
    else:
        unknown_reason = None

    result: dict[str, Any] = {
        "location": {
            "latitude": location.get("latitude"),
            "longitude": location.get("longitude"),
        },
        "classification": classification,
        "evaluated_time": evaluated_time,
        "source": "shademap",
        "data_available": classification is not ShadeClassification.UNKNOWN,
        "unknown_reason": unknown_reason,
    }
    if classification is not ShadeClassification.UNKNOWN:
        result["shade_percentage"] = _normalize_percentage(
            sample.get("shade_percentage", sample.get("shade_percent"))
        )
    return result


def _normalize_feature(feature: Mapping[str, Any], request: ShadowRequest) -> dict[str, Any]:
    geometry = feature.get("geometry")
    properties = feature.get("properties")
    if not isinstance(geometry, Mapping) or not isinstance(properties, Mapping):
        raise ShadowResponseProcessingError("ShadeMap feature is missing geometry or properties")
    coordinates = _coordinate_pair(geometry.get("coordinates"))
    if geometry.get("type") != "Point" or coordinates is None:
        raise ShadowResponseProcessingError("ShadeMap feature must contain a point coordinate")

    return _normalize_sample(
        {
            "location": {
                "longitude": coordinates[0],
                "latitude": coordinates[1],
            },
            **properties,
        },
        request,
    )


def _normalize_classification(value: Any) -> ShadeClassification:
    if not isinstance(value, str):
        return ShadeClassification.UNKNOWN
    normalized = value.strip().lower()
    if normalized in {"shade", "shaded", "confirmed_shade"}:
        return ShadeClassification.CONFIRMED_SHADE
    if normalized in {"sun", "sunlight", "exposure", "exposed", "confirmed_exposure"}:
        return ShadeClassification.CONFIRMED_EXPOSURE
    return ShadeClassification.UNKNOWN


def _normalize_time(value: Any, fallback: datetime) -> tuple[datetime, bool]:
    if isinstance(value, datetime) and value.tzinfo is not None:
        return value.astimezone(fallback.tzinfo), True
    if isinstance(value, str):
        try:
            parsed = datetime.fromisoformat(value)
        except ValueError:
            return fallback, False
        if parsed.tzinfo is not None:
            return parsed.astimezone(fallback.tzinfo), True
    return fallback, value is None


def _normalize_percentage(value: Any) -> float | None:
    if value is None or isinstance(value, bool):
        return None
    if isinstance(value, (int, float)) and 0 <= value <= 100:
        return float(value)
    return None


def _unknown_reason(value: Any, time_was_valid: bool) -> str:
    if isinstance(value, str) and value.strip():
        return value
    if not time_was_valid:
        return "ShadeMap returned an invalid or missing timestamp"
    return "ShadeMap did not classify this location"


def _coordinate_pair(value: Any) -> tuple[float, float] | None:
    if not (
        isinstance(value, list)
        and len(value) == 2
        and all(isinstance(item, (int, float)) and not isinstance(item, bool) for item in value)
    ):
        return None
    return float(value[0]), float(value[1])
