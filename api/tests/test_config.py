from pytest import MonkeyPatch

from api.core.config import Settings


def test_settings_read_environment_variables(monkeypatch: MonkeyPatch) -> None:
    monkeypatch.setenv("GRAPHHOPPER_API_KEY", "graphhopper-test-key")
    monkeypatch.setenv("CORS_ORIGINS", "http://localhost:5173, https://example.test")

    settings = Settings()

    assert settings.graphhopper_api_key == "graphhopper-test-key"
    assert settings.cors_origin_list == ["http://localhost:5173", "https://example.test"]


def test_settings_do_not_require_credentials() -> None:
    settings = Settings.model_validate({})

    assert settings.graphhopper_api_key is None
    assert settings.shademap_api_key is None
