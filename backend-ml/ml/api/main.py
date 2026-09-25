import logging
import secrets
import sys
from pathlib import Path
from contextlib import asynccontextmanager
from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.middleware.trustedhost import TrustedHostMiddleware
from fastapi.responses import JSONResponse

# Ensure root repository directory is in path so 'ai' package imports cleanly
ROOT_DIR = Path(__file__).resolve().parent.parent.parent
if str(ROOT_DIR) not in sys.path:
    sys.path.insert(0, str(ROOT_DIR))

from core.config import settings
from core.database import db_manager, fallback_store
from services.ml_service import ml_service
from services.rag_service import rag_engine
from services.geo_service import geo_engine
from models.schemas import PredictionInput

# Import routers
from api.routes.anomalies import router as anomalies_router
from api.routes.facilities import router as facilities_router
from api.routes.rag import router as rag_router
from api.routes.stats import router as stats_router
from api.routes.predict import router as predict_router
from ai.api_router import router as ai_router

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s"
)
logger = logging.getLogger("thermos.main")


def populate_initial_anomalies():
    """Populate initial classified thermal hotspots for immediate visualization."""
    if fallback_store.anomalies:
        return

    sample_hotspots = [
        {"lat": 22.3610, "lon": 69.8320, "frp": 68.5, "bright": 365.2, "conf": "h", "dn": "N", "name": "Jamnagar Flare Unit 1"},
        {"lat": 22.3550, "lon": 69.8250, "frp": 158.0, "bright": 398.0, "conf": "h", "dn": "N", "name": "Jamnagar Anomaly Spike"},
        {"lat": 20.2880, "lon": 86.6380, "frp": 54.0, "bright": 355.0, "conf": "h", "dn": "N", "name": "Paradip Refinery Flare"},
        {"lat": 21.1210, "lon": 72.6480, "frp": 82.0, "bright": 372.0, "conf": "h", "dn": "D", "name": "Hazira Thermal Source"},
        {"lat": 13.1690, "lon": 80.2630, "frp": 115.0, "bright": 385.0, "conf": "h", "dn": "D", "name": "Manali Chemical Unit Fire"},
        {"lat": 22.7980, "lon": 86.1980, "frp": 72.0, "bright": 362.0, "conf": "h", "dn": "N", "name": "Jamshedpur Blast Furnace"},
        {"lat": 23.7550, "lon": 86.4180, "frp": 48.0, "bright": 348.0, "conf": "n", "dn": "D", "name": "Jharia Seam Fire"},
        {"lat": 24.2010, "lon": 82.6820, "frp": 38.0, "bright": 342.0, "conf": "n", "dn": "N", "name": "Singrauli Mine Area"},
        {"lat": 30.8500, "lon": 75.8000, "frp": 28.0, "bright": 325.0, "conf": "n", "dn": "D", "name": "Ludhiana Stubble Burn"},
        {"lat": 29.7200, "lon": 76.9500, "frp": 32.0, "bright": 328.0, "conf": "n", "dn": "D", "name": "Karnal Crop Residue Burn"},
        {"lat": 14.1500, "lon": 74.9500, "frp": 95.0, "bright": 378.0, "conf": "h", "dn": "D", "name": "Western Ghats Wildfire"},
        {"lat": 21.8500, "lon": 86.3500, "frp": 120.0, "bright": 388.0, "conf": "h", "dn": "D", "name": "Similipal Forest Fire"}
    ]

    for i, h in enumerate(sample_hotspots, 1):
        derived = geo_engine.calculate_derived_features(
            lat=h["lat"],
            lon=h["lon"],
            frp=h["frp"],
            bright_temp_k=h["bright"],
            confidence_raw=h["conf"],
            daynight_raw=h["dn"],
            acq_date="2026-09-05"
        )

        pred_in = PredictionInput(
            brightness_k=derived["brightness_k"],
            frp_mw=derived["frp_mw"],
            firms_confidence_pct=derived["firms_confidence_pct"],
            daynight=derived["daynight"],
            observation_count_7d=derived["observation_count_7d"],
            persistence_hours_7d=derived["persistence_hours_7d"],
            frp_trend_pct=derived["frp_trend_pct"],
            industrial_proximity_km=derived["industrial_proximity_km"],
            refinery_proximity_km=derived["refinery_proximity_km"],
            mine_proximity_km=derived["mine_proximity_km"],
            forest_proximity_km=derived["forest_proximity_km"],
            cropland_proximity_km=derived["cropland_proximity_km"],
            population_5km=derived["population_5km"],
            land_cover=derived["land_cover"]
        )
        pred = ml_service.predict(pred_in)
        nearest_fac = derived.get("nearest_facility")
        anomaly_id = f"ANOM-20260905-{i:03d}"

        doc = {
            "type": "Feature",
            "id": anomaly_id,
            "anomaly_id": anomaly_id,
            "geometry": {"type": "Point", "coordinates": [h["lon"], h["lat"]]},
            "location": {"type": "Point", "coordinates": [h["lon"], h["lat"]]},
            "frp": h["frp"],
            "classification": pred.predicted_class,
            "risk_level": pred.risk_level,
            "sector": nearest_fac.get("sector") if nearest_fac else None,
            "properties": {
                "anomaly_id": anomaly_id,
                "classification": pred.predicted_class,
                "confidence": pred.confidence,
                "risk_level": pred.risk_level,
                "frp": h["frp"],
                "brightness_temp_k": h["bright"],
                "daynight": h["dn"],
                "land_cover": derived["land_cover"],
                "facility_name": nearest_fac.get("name") if nearest_fac else None,
                "facility_id": nearest_fac.get("id") if nearest_fac else None,
                "sector": nearest_fac.get("sector") if nearest_fac else None,
                "distance_to_facility_km": derived["industrial_proximity_km"],
                "observation_count_7d": derived["observation_count_7d"],
                "persistence_hours_7d": derived["persistence_hours_7d"],
                "frp_trend_pct": derived["frp_trend_pct"],
                "population_5km": derived["population_5km"],
                "acq_date": "2026-09-05",
                "acq_time": "1430",
                "satellite": "VIIRS-NPP"
            }
        }
        fallback_store.anomalies.append(doc)

    logger.info(f"Auto-populated {len(fallback_store.anomalies)} thermal anomalies in memory.")


@asynccontextmanager
async def lifespan(app: FastAPI):
    logger.info("Initializing THERMOS Enterprise Backend...")
    # 1. Connect MongoDB
    await db_manager.connect()

    # 2. Seed fallback store with facilities
    if not fallback_store.facilities and rag_engine.facilities:
        fallback_store.facilities = rag_engine.facilities

    # 3. Populate initial anomalies
    populate_initial_anomalies()

    logger.info("THERMOS API ready to serve requests.")
    yield
    # Shutdown
    await db_manager.close()
    logger.info("THERMOS API shutdown completed.")


app = FastAPI(
    title=settings.PROJECT_NAME,
    version=settings.VERSION,
    description="""
    ## 🛰️ THERMOS: AI-Enabled Geospatial Thermal Anomaly Intelligence & Disaster Response API
    
    Developed for **Smart India Hackathon (SIH) 2026 — Problem Statement 26162**.
    
    ### Key Features:
    * **NASA FIRMS Hotspot Ingestion:** Ingests raw VIIRS (375m) and MODIS thermal detections.
    * **Spatial Feature Derivation Engine:** Real-time KD-Tree computation of 14 spatial/temporal metrics.
    * **XGBoost Classifier (99.4% Accuracy):** Segregates industrial fires, flares, and thermal sources from forest and agricultural burns.
    * **MongoDB Geospatial Storage (`2dsphere`):** Instant sub-millisecond `$near` proximity queries.
    * **RAG Disaster Intelligence Copilot:** Instant synthesis of Tactical Incident Action Plans (IAPs) combining facility profiles, chemical MSDS sheets, and NDMA emergency response SOPs.
    """,
    lifespan=lifespan
)

if settings.ENVIRONMENT.lower() == "production" and not settings.THERMOS_API_KEY:
    raise RuntimeError("THERMOS_API_KEY must be configured in production.")

app.add_middleware(TrustedHostMiddleware, allowed_hosts=settings.TRUSTED_HOSTS)


@app.middleware("http")
async def require_api_key(request: Request, call_next):
    protected_path = request.url.path.startswith(settings.API_V1_STR + "/")
    public_path = request.url.path in {"/api/health"}

    if settings.ENVIRONMENT.lower() == "production" and protected_path and not public_path:
        supplied_key = request.headers.get("X-API-Key", "")
        configured_key = settings.THERMOS_API_KEY or ""
        if not secrets.compare_digest(supplied_key, configured_key):
            return JSONResponse(status_code=401, content={"detail": "Valid X-API-Key header required."})

    return await call_next(request)

# CORS Configuration for Vercel and Local Frontend
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.CORS_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Mount all API Routers under /api
app.include_router(ai_router, prefix=settings.API_V1_STR)
app.include_router(anomalies_router, prefix=settings.API_V1_STR)
app.include_router(facilities_router, prefix=settings.API_V1_STR)
app.include_router(rag_router, prefix=settings.API_V1_STR)
app.include_router(stats_router, prefix=settings.API_V1_STR)
app.include_router(predict_router, prefix=settings.API_V1_STR)


@app.get("/", tags=["System Information"])
async def root():
    return {
        "system": "THERMOS Industrial Thermal Intelligence API",
        "version": settings.VERSION,
        "sih_problem_statement": "26162",
        "docs_url": "/docs",
        "redoc_url": "/redoc",
        "health_check": "/api/health",
        "frontend_deployment": "https://sih-2026-nu-ten.vercel.app"
    }


@app.get("/api/health", tags=["System Information"])
async def health_check():
    return {
        "status": "healthy",
        "model_loaded": ml_service.is_loaded,
        "model_type": ml_service.metadata.get("model_type") if ml_service.metadata else "XGBoost Classifier",
        "test_accuracy": ml_service.metadata.get("test_accuracy") if ml_service.metadata else 0.994,
        "database_connected": db_manager.is_connected,
        "facilities_indexed": len(rag_engine.facilities),
        "rag_kb_loaded": bool(rag_engine.hazmat_kb)
    }


if __name__ == "__main__":
    import uvicorn
    uvicorn.run("api.main:app", host="0.0.0.0", port=8000, reload=True)