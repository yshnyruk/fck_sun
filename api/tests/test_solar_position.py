from datetime import UTC, datetime, timedelta, timezone

import pytest

from api.schemas.routes import Coordinate
from api.services.solar_position import (
    SolarPositionCalculator,
    SolarPositionError,
    calculate_solar_position,
)


def test_solar_position_returns_expected_position_at_greenwich_solstice() -> None:
    position = calculate_solar_position(
        latitude=0,
        longitude=0,
        timestamp=datetime(2026, 6, 21, 12, 0, tzinfo=UTC),
    )

    assert position.elevation_degrees == pytest.approx(66.5, abs=0.5)
    assert position.azimuth_degrees == pytest.approx(0.8, abs=1.0)


def test_solar_position_normalizes_non_utc_timezone() -> None:
    utc_position = calculate_solar_position(
        latitude=40.7,
        longitude=-74,
        timestamp=datetime(2026, 6, 21, 16, 0, tzinfo=UTC),
    )
    local_position = calculate_solar_position(
        latitude=40.7,
        longitude=-74,
        timestamp=datetime(2026, 6, 21, 12, 0, tzinfo=timezone(timedelta(hours=-4))),
    )

    assert local_position == utc_position


def test_calculator_accepts_coordinate_model() -> None:
    position = SolarPositionCalculator().calculate(
        Coordinate(latitude=40.7, longitude=-74),
        datetime(2026, 6, 21, 16, 0, tzinfo=UTC),
    )

    assert -90 <= position.elevation_degrees <= 90
    assert 0 <= position.azimuth_degrees < 360


@pytest.mark.parametrize(
    ("latitude", "longitude"),
    [(91, 0), (0, 181)],
)
def test_solar_position_rejects_invalid_coordinates(
    latitude: float,
    longitude: float,
) -> None:
    with pytest.raises(SolarPositionError, match="must be between"):
        calculate_solar_position(latitude, longitude, datetime.now(UTC))


def test_solar_position_rejects_timezone_naive_timestamp() -> None:
    with pytest.raises(SolarPositionError, match="must include a timezone"):
        calculate_solar_position(0, 0, datetime(2026, 3, 20, 12))
