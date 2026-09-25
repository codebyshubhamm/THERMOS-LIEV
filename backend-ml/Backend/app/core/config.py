"""THERMOS central configuration. All tunable constants live here."""
from __future__ import annotations

import os
from functools import lru_cache
from pathlib import Path

from pydantic_settings import BaseSettings, SettingsConfigDict

_BACKEND_DIR = Path(__file__).resolve().parent.parent.parent
_ROOT_DIR = _BACKEND_DIR.parent.parent


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=(
            str(_BACKEND_DIR / ".env"),
            str(_ROOT_DIR / ".env"),
            ".env",
            "../.env",
            "../../.env",
        ),
        env_file_encoding="utf-8",
        extra="ignore"
    )

    APP_NAME: str = "THERMOS — Thermal Event Recognition and Monitoring Operational System"
    APP_VERSION: str = "1.0.0"
    ENVIRONMENT: str = "development"
    LOG_LEVEL: str = "INFO"
    SECRET_KEY: str = "thermos-default-dev-secret-key-change-in-production"

    # Database: PostgreSQL+PostGIS in prod/docker, SQLite fallback for local demo/tests
    DATABASE_URL: str = "sqlite:///./thermos.db"

    # Redis Cache & Broker
    REDIS_URL: str = "redis://localhost:6379/0"

    # NASA FIRMS (Supports FIRMS_API_KEY and FIRMS_MAP_KEY)
    FIRMS_API_KEY: str = ""
    FIRMS_MAP_KEY: str = ""
    FIRMS_API_BASE_URL: str = "https://firms.modaps.eosdis.nasa.gov/api"
    ENABLE_LIVE_FIRMS: bool = True
    FIRMS_POLL_INTERVAL_MIN: int = 15
    FIRMS_TIMEOUT_S: float = 20.0

    # ML
    MODEL_PATH: str = "../ml/models/xgboost_classifier.pkl"
    ENCODERS_PATH: str = "../ml/models/label_encoders.pkl"
    MODEL_METADATA_PATH: str = "../ml/models/model_metadata.json"
    MODEL_VERSION: str = "thermos-xgb-v1"
    FEATURE_SCHEMA_VERSION: str = "v1"
    RISK_ENGINE_VERSION: str = "risk-v1"

    # Event association (spatio-temporal clustering thresholds)
    EVENT_CLUSTER_RADIUS_KM: float = 2.0
    EVENT_CLUSTER_TIME_HOURS: float = 72.0

    # Risk engine
    RISK_WEIGHT_THERMAL: float = 0.30
    RISK_WEIGHT_PERSISTENCE: float = 0.25
    RISK_WEIGHT_POPULATION: float = 0.20
    RISK_WEIGHT_INFRA: float = 0.15
    RISK_WEIGHT_TREND: float = 0.10
    RISK_CRITICAL: float = 85.0
    RISK_HIGH: float = 65.0
    RISK_MODERATE: float = 40.0
    ALERT_RISK_THRESHOLD: float = 65.0

    # Geo enrichment
    POPULATION_RADIUS_KM: float = 5.0
    OSM_QUERY_RADIUS_KM: float = 10.0
    ENABLE_OSM: bool = True
    OSM_OVERPASS_URL: str = "https://overpass-api.de/api/interpreter"
    OSM_TIMEOUT_S: float = 2.5
    WORLDPOP_DATA_PATH: str = ""
    LANDCOVER_DATA_PATH: str = ""

    # Uncertainty
    LOW_MARGIN_THRESHOLD: float = 0.10

    # API protection
    MAX_API_PAGE_SIZE: int = 200
    DEFAULT_PAGE_SIZE: int = 50

    # AI Explanation & Investigator (Powered by Google Gemini)
    ENABLE_AI: bool = True
    LLM_PROVIDER: str = "gemini"  # gemini | none
    GEMINI_API_KEY: str = ""
    GEMINI_MODEL: str = "gemini-3.1-flash-lite"
    AI_MODEL: str = "gemini-3.1-flash-lite"
    OPENAI_API_KEY: str = ""

    # ESA WorldCover WMS (Public global 10m land cover; no API key or OAuth credentials required)
    WORLDCOVER_WMS_URL: str = "https://services.terrascope.be/wms/v2"
    WORLDCOVER_LAYER: str = "WORLDCOVER_2021_MAP"
    WORLDCOVER_WMS_FALLBACK_URL: str = "https://titiler.terrascope.be/wms"
    WORLDCOVER_FALLBACK_LAYER: str = "esa-worldcover-map-10m-2021-v2_map"
    WORLDCOVER_TIMEOUT_S: float = 10.0

    # Deprecated Copernicus Sentinel Hub settings (optional, retained for backward compatibility)
    COPERNICUS_CLIENT_ID: str = ""
    COPERNICUS_CLIENT_SECRET: str = ""
    COPERNICUS_TIMEOUT_S: float = 10.0

    # Scheduler
    ENABLE_SCHEDULER: bool = False

    # CORS (comma-separated in env)
    CORS_ORIGINS: str = "http://localhost:5173,http://localhost:3000"

    @property
    def active_firms_key(self) -> str:
        key = self.FIRMS_API_KEY or self.FIRMS_MAP_KEY or os.environ.get("FIRMS_API_KEY", "") or os.environ.get("FIRMS_MAP_KEY", "")
        return key.strip()

    @property
    def cors_origins_list(self) -> list[str]:
        origins = [o.strip() for o in self.CORS_ORIGINS.split(",") if o.strip()]
        if not self.is_production and "http://localhost:5174" not in origins:
            origins.append("http://localhost:5174")
        if self.is_production:
            # Strictly reject wildcard origins in production
            origins = [o for o in origins if o != "*"]
        return origins or ["http://localhost:5173", "http://localhost:3000"]

    @property
    def risk_weights(self) -> dict:
        return {
            "thermal_severity": self.RISK_WEIGHT_THERMAL,
            "persistence": self.RISK_WEIGHT_PERSISTENCE,
            "population_exposure": self.RISK_WEIGHT_POPULATION,
            "infrastructure_proximity": self.RISK_WEIGHT_INFRA,
            "intensity_trend": self.RISK_WEIGHT_TREND,
        }

    @property
    def is_postgres(self) -> bool:
        return self.DATABASE_URL.startswith("postgresql")

    @property
    def is_production(self) -> bool:
        return self.ENVIRONMENT.lower() == "production"


@lru_cache
def get_settings() -> Settings:
    return Settings()
