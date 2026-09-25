from typing import List
from fastapi import APIRouter, HTTPException
from models.schemas import PredictionInput, PredictionOutput
from services.ml_service import ml_service

router = APIRouter(tags=["ML Model Inference & Class Info"])


@router.get("/classes")
async def get_classes():
    """Get all 6 classification classes supported by the trained XGBoost model."""
    if ml_service.metadata:
        return {"classes": ml_service.metadata.get("classes", [])}
    return {
        "classes": [
            "Agricultural Burning",
            "Gas Flare",
            "Industrial Fire",
            "Industrial Thermal Source",
            "Mining Activity",
            "Wildfire"
        ]
    }


@router.get("/land_cover_types")
async def get_land_cover_types():
    """Get all supported land cover categories."""
    if ml_service.encoders and "land_cover_encoder" in ml_service.encoders:
        return {"land_cover_types": ml_service.encoders["land_cover_encoder"].classes_.tolist()}
    return {"land_cover_types": ["Industrial", "Forest", "Cropland", "Urban", "Water", "Grassland"]}


@router.get("/feature_info")
async def get_feature_info():
    """Get the 14 model features and their allowed numerical/categorical ranges."""
    return {
        "features": ml_service.feature_cols or [
            "brightness_k", "frp_mw", "firms_confidence_pct", "daynight",
            "observation_count_7d", "persistence_hours_7d", "frp_trend_pct",
            "industrial_proximity_km", "refinery_proximity_km", "mine_proximity_km",
            "forest_proximity_km", "cropland_proximity_km", "population_5km", "land_cover"
        ],
        "categorical_features": {
            "daynight": ["D", "N"],
            "land_cover": ["Industrial", "Forest", "Cropland", "Urban", "Water", "Grassland"]
        }
    }


@router.post("/predict", response_model=PredictionOutput)
async def predict_single(input_data: PredictionInput):
    """Direct 14-Feature ML Inference on Trained XGBoost Classifier."""
    return ml_service.predict(input_data)


@router.post("/predict_batch", response_model=List[PredictionOutput])
async def predict_batch(inputs: List[PredictionInput]):
    """High-throughput batch inference across multiple 14-feature points."""
    return [ml_service.predict(inp) for inp in inputs]
