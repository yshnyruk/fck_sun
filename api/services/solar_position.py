"""Solar-position calculations for geographic coordinates and instants in time.

The implementation follows the NOAA solar-position approximation. Azimuth is
measured clockwise from geographic north and elevation is measured above the
horizon. The result uses the geometric solar elevation; atmospheric refraction
is intentionally not applied because shade geometry depends on the geometric
sun position.
"""

from dataclasses import dataclass
from datetime import UTC, datetime
from math import asin, atan2, cos, degrees, pi, radians, sin, tan

from api.schemas.routes import Coordinate


class SolarPositionError(ValueError):
    """Raised when a solar-position calculation cannot be performed."""


@dataclass(frozen=True, slots=True)
class SolarPosition:
    """The sun's apparent position relative to an observer."""

    azimuth_degrees: float
    elevation_degrees: float


class SolarPositionCalculator:
    """Calculate solar positions using UTC-normalized, timezone-aware times."""

    def calculate(self, coordinate: Coordinate, timestamp: datetime) -> SolarPosition:
        return calculate_solar_position(
            latitude=coordinate.latitude,
            longitude=coordinate.longitude,
            timestamp=timestamp,
        )


def calculate_solar_position(
    latitude: float,
    longitude: float,
    timestamp: datetime,
) -> SolarPosition:
    """Return the geometric solar azimuth and elevation for an instant.

    ``timestamp`` must include a UTC offset. Coordinates are expressed as
    latitude and longitude in decimal degrees. The returned azimuth is in the
    range [0, 360), where 0 is north, and elevation is in the range [-90, 90].
    """
    _validate_coordinates(latitude, longitude)
    if timestamp.tzinfo is None or timestamp.utcoffset() is None:
        raise SolarPositionError("timestamp must include a timezone")

    utc_timestamp = timestamp.astimezone(UTC)
    day_of_year = utc_timestamp.timetuple().tm_yday
    decimal_hour = (
        utc_timestamp.hour
        + utc_timestamp.minute / 60
        + utc_timestamp.second / 3600
        + utc_timestamp.microsecond / 3_600_000_000
    )
    gamma = 2 * pi / 365 * (day_of_year - 1 + (decimal_hour - 12) / 24)

    equation_of_time = (
        229.18
        * (
            0.000075
            + 0.001868 * cos(gamma)
            - 0.032077 * sin(gamma)
            - 0.014615 * cos(2 * gamma)
            - 0.040849 * sin(2 * gamma)
        )
    )
    declination = (
        0.006918
        - 0.399912 * cos(gamma)
        + 0.070257 * sin(gamma)
        - 0.006758 * cos(2 * gamma)
        + 0.000907 * sin(2 * gamma)
        - 0.002697 * cos(3 * gamma)
        + 0.00148 * sin(3 * gamma)
    )

    true_solar_minutes = (
        decimal_hour * 60 + equation_of_time + 4 * longitude
    ) % 1440
    hour_angle_degrees = true_solar_minutes / 4 - 180
    hour_angle = radians(hour_angle_degrees)
    latitude_radians = radians(latitude)

    elevation = degrees(
        asin(
            sin(latitude_radians) * sin(declination)
            + cos(latitude_radians) * cos(declination) * cos(hour_angle)
        )
    )
    azimuth = (
        degrees(
            atan2(
                sin(hour_angle),
                cos(hour_angle) * sin(latitude_radians)
                - tan(declination) * cos(latitude_radians),
            )
        )
        + 180
    ) % 360

    return SolarPosition(
        azimuth_degrees=azimuth,
        elevation_degrees=elevation,
    )


def _validate_coordinates(latitude: float, longitude: float) -> None:
    if not -90 <= latitude <= 90:
        raise SolarPositionError("latitude must be between -90 and 90 degrees")
    if not -180 <= longitude <= 180:
        raise SolarPositionError("longitude must be between -180 and 180 degrees")
