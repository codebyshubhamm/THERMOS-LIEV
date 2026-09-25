from __future__ import annotations

from fastapi import APIRouter
from sqlalchemy import text

from app.core.config import get_settings
from app.db.database import SessionLocal
from app.ml import model_loader
from app.schemas.system import HealthOut

router = APIRouter(tags=["health"])


@router.get("/health", response_model=HealthOut)
def health():
    s = get_settings()
    try:
        with SessionLocal() as db:
            db.execute(text("SELECT 1"))
        db_ok = True
    except Exception:
        db_ok = False
    return HealthOut(status="ok" if db_ok else "degraded", version=s.APP_VERSION,
                     model_loaded=model_loader.is_loaded(), database_connected=db_ok,
                     firms_enabled=bool(s.FIRMS_MAP_KEY and s.ENABLE_LIVE_FIRMS),
                     ai_enabled=bool(s.ENABLE_AI and s.LLM_PROVIDER != "none"))
