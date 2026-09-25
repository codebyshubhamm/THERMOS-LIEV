from pydantic_settings import BaseSettings
from pathlib import Path
from typing import List, Optional


class Settings(BaseSettings):
    PROJECT_NAME: str = "THERMOS — Industrial Thermal Intelligence API"
    VERSION: str = "2.0.0"
    API_V1_STR: str = "/api"
    ENVIRONMENT: str = "development"
    THERMOS_API_KEY: Optional[str] = None
    TRUSTED_HOSTS: List[str] = ["*"]

    # MongoDB Configuration
    MONGODB_URL: str = "mongodb://localhost:27017"
    DATABASE_NAME: str = "thermos_db"

    # AI / LLM Configuration
    GEMINI_API_KEY: Optional[str] = None
    GROQ_API_KEY: Optional[str] = None
    OPENAI_API_KEY: Optional[str] = None

    # CORS
    CORS_ORIGINS: List[str] = [
        "*",
        "http://localhost:3000",
        "http://localhost:5173",
        "https://sih-2026-nu-ten.vercel.app"
    ]

    # Paths
    BASE_DIR: Path = Path(__file__).resolve().parent.parent
    MODEL_DIR: Path = BASE_DIR / "models"
    MODEL_PATH: Path = MODEL_DIR / "xgboost_classifier.pkl"
    ENCODERS_PATH: Path = MODEL_DIR / "label_encoders.pkl"
    METADATA_PATH: Path = MODEL_DIR / "model_metadata.json"

    DATA_DIR: Path = BASE_DIR / "data"
    FACILITIES_PATH: Path = DATA_DIR / "industrial_facilities.json"
    HAZMAT_SOP_PATH: Path = DATA_DIR / "hazmat_sop_kb.json"

    class Config:
        env_file = ".env"
        extra = "allow"


settings = Settings()
