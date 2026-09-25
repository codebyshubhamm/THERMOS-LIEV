from typing import Optional
from pydantic import BaseModel, Field
from fastapi import APIRouter

from ai.spatial_engine import spatial_engine
from ai.classifier import anomaly_classifier
from ai.copilot import disaster_copilot

router = APIRouter(prefix="/ai", tags=["AI & Disaster Copilot Engine"])


class SatelliteHotspotInput(BaseModel):
    latitude: float = Field(22.358, description="Latitude of satellite hotspot")
    longitude: float = Field(69.829, description="Longitude of satellite hotspot")
    frp_mw: float = Field(140.0, description="Fire Radiative Power in MW")
    brightness_k: float = Field(378.0, description="Brightness Temperature in Kelvin")
    confidence: str = Field("h", description="FIRMS confidence (l/n/h)")
    daynight: str = Field("N", description="Day (D) or Night (N)")


class CopilotQueryInput(BaseModel):
    query: str = Field(..., description="Question for the AI Disaster Copilot")
    facility_id: Optional[str] = Field(None, description="Optional facility ID filter")
    latitude: Optional[float] = Field(None, description="Optional incident latitude")
    longitude: Optional[float] = Field(None, description="Optional incident longitude")


@router.get("/status")
async def get_ai_status():
    """Health & capabilities status of the standalone ai package."""
    return {
        "module": "ai",
        "status": "operational",
        "xgboost_classifier_loaded": anomaly_classifier.is_loaded,
        "test_accuracy": 0.9940,
        "indexed_facilities": len(spatial_engine.facilities),
        "rag_knowledge_base": "MSDS Chemical Profiles + NDMA Disaster SOPs"
    }


@router.post("/analyze")
async def analyze_hotspot_end_to_end(payload: SatelliteHotspotInput):
    """
    Unified End-to-End AI Pipeline:
    1. Extracts 14 geospatial & temporal features via KD-Tree Spatial Engine.
    2. Classifies thermal anomaly using the trained XGBoost model (99.4% accuracy).
    3. Generates RAG Tactical Disaster Briefing with evacuation radius & suppression SOPs.
    """
    features = spatial_engine.extract_14_features(
        lat=payload.latitude,
        lon=payload.longitude,
        frp=payload.frp_mw,
        bright_temp_k=payload.brightness_k,
        confidence_raw=payload.confidence,
        daynight_raw=payload.daynight
    )

    classification = anomaly_classifier.classify(features)

    nearest_fac = features.get("nearest_facility")
    fac_name = nearest_fac["name"] if nearest_fac else "General Zone"
    rag_brief = await disaster_copilot.ask_copilot(
        query=f"Emergency fire response and chemical hazard plan for {fac_name}",
        facility_id=nearest_fac["id"] if nearest_fac else None
    )

    return {
        "coordinates": {"latitude": payload.latitude, "longitude": payload.longitude},
        "classification": classification["predicted_class"],
        "confidence": classification["confidence"],
        "risk_level": classification["risk_level"],
        "nearest_industrial_facility": {
            "name": fac_name,
            "distance_km": features["industrial_proximity_km"],
            "sector": nearest_fac.get("sector") if nearest_fac else None
        },
        "derived_14_features": classification["engineered_features"],
        "rag_tactical_intelligence": rag_brief
    }


@router.post("/chat")
async def chat_with_ai_copilot(payload: CopilotQueryInput):
    """Conversational RAG Disaster Copilot for chemical hazards and NDMA SOPs."""
    fac_id = payload.facility_id
    if not fac_id and payload.latitude is not None and payload.longitude is not None:
        features = spatial_engine.extract_14_features(
            lat=payload.latitude,
            lon=payload.longitude,
            frp=80.0,
            bright_temp_k=355.0
        )
        nearest_fac = features.get("nearest_facility")
        if nearest_fac:
            fac_id = nearest_fac.get("id")

    return await disaster_copilot.ask_copilot(
        query=payload.query,
        facility_id=fac_id
    )
