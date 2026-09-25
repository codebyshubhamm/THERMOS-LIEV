from __future__ import annotations

import httpx
from fastapi import APIRouter
from sqlalchemy import text

from app.core.config import get_settings
from app.db.database import SessionLocal
from app.ml import model_loader
from app.ml.predictor import last_inference_latency_ms
from app.schemas.system import SystemStatusOut
from app.services.event_service import pipeline_stats

router = APIRouter(tags=["system"])


def _check_url(url: str, timeout: float = 5.0) -> str:
    try:
        r = httpx.get(url, timeout=timeout)
        return "available" if r.status_code < 500 else "unavailable"
    except Exception:
        return "unavailable"


@router.get("/system/status", response_model=SystemStatusOut)
def system_status():
    s = get_settings()
    try:
        with SessionLocal() as db:
            db.execute(text("SELECT 1"))
        db_s = "online"
    except Exception:
        db_s = "unavailable"
    firms = "configured" if (s.active_firms_key and s.ENABLE_LIVE_FIRMS) else ("disabled" if not s.ENABLE_LIVE_FIRMS else "unavailable")
    osm_state = "disabled" if not s.ENABLE_OSM else "available"
    ai = "configured" if (s.ENABLE_AI and s.LLM_PROVIDER != "none" and (s.OPENAI_API_KEY or s.GEMINI_API_KEY)) else ("disabled" if not s.ENABLE_AI else "rules-only")
    return SystemStatusOut(
        database=db_s,
        firms=firms,
        osm=osm_state,
        land_cover="configured" if s.LANDCOVER_DATA_PATH else "demo-fallback",
        population="configured" if s.WORLDPOP_DATA_PATH else "demo-fallback",
        ml_model="loaded" if model_loader.is_loaded() else "unavailable",
        ai=ai,
        scheduler="running" if s.ENABLE_SCHEDULER else "disabled",
        latencies_ms={"ml_inference": round(last_inference_latency_ms(), 2),
                      **pipeline_stats().get("latencies_ms", {})},
    )


@router.get("/system/pipeline")
def system_pipeline():
    stats = pipeline_stats()
    stages = ["firms_ingestion", "event_association", "temporal_enrichment",
              "geospatial_enrichment", "ml_classification", "risk_engine", "ai_investigator"]
    return {"stages": [{"name": n, "status": "operational" if model_loader.is_loaded() else "degraded",
                        "last_run": stats.get("last_run"),
                        "latency_ms": (stats.get("latencies_ms") or {}).get("total"),
                        "records_processed": stats.get("records_processed", 0)} for n in stages]}
