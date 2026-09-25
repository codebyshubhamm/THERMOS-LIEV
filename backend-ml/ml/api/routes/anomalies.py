import uuid
from datetime import datetime
from typing import Optional, List
from fastapi import APIRouter, HTTPException, Query
from core.database import db_manager, fallback_store
from models.schemas import (
    GeoJSONFeatureCollection,
    GeoJSONFeature,
    GeoJSONGeometry,
    AnomalyProperties,
    FIRMSIngestRequest,
    PredictionInput
)
from services.geo_service import geo_engine
from services.ml_service import ml_service

router = APIRouter(prefix="/anomalies", tags=["Thermal Anomalies & GeoJSON"])


@router.get("", response_model=GeoJSONFeatureCollection)
async def get_anomalies(
    min_frp: Optional[float] = Query(None, description="Minimum FRP in MW"),
    classification: Optional[str] = Query(None, description="Filter by classification class"),
    risk_level: Optional[str] = Query(None, description="Filter by risk level (LOW/MODERATE/HIGH/CRITICAL)"),
    sector: Optional[str] = Query(None, description="Filter by industrial sector"),
    limit: int = Query(200, ge=1, le=1000)
):
    """
    Get all active thermal anomalies as a standard RFC 7946 GeoJSON FeatureCollection
    for direct overlay on Mapbox / Leaflet frontend maps.
    """
    features = []

    # 1. Try MongoDB if connected
    if db_manager.is_connected and db_manager.db is not None:
        try:
            query = {}
            if min_frp is not None:
                query["frp"] = {"$gte": min_frp}
            if classification:
                query["classification"] = classification
            if risk_level:
                query["risk_level"] = risk_level.upper()
            if sector:
                query["sector"] = sector

            cursor = db_manager.db.anomalies.find(query).limit(limit)
            async for doc in cursor:
                doc.pop("_id", None)
                features.append(GeoJSONFeature(**doc))

            return GeoJSONFeatureCollection(
                type="FeatureCollection",
                features=features,
                total_count=len(features)
            )
        except Exception as e:
            pass  # Fall through to in-memory store

    # 2. Fallback to In-Memory store
    for item in fallback_store.anomalies:
        props = item.get("properties", {})
        if min_frp is not None and props.get("frp", 0) < min_frp:
            continue
        if classification and props.get("classification") != classification:
            continue
        if risk_level and props.get("risk_level", "").upper() != risk_level.upper():
            continue
        if sector and props.get("sector") != sector:
            continue
        features.append(GeoJSONFeature(**item))
        if len(features) >= limit:
            break

    return GeoJSONFeatureCollection(
        type="FeatureCollection",
        features=features,
        total_count=len(features)
    )


@router.get("/{anomaly_id}", response_model=GeoJSONFeature)
async def get_anomaly_by_id(anomaly_id: str):
    """Retrieve detailed telemetry and spatial metrics for a specific anomaly ID."""
    if db_manager.is_connected and db_manager.db is not None:
        doc = await db_manager.db.anomalies.find_one({"anomaly_id": anomaly_id})
        if doc:
            doc.pop("_id", None)
            return GeoJSONFeature(**doc)

    for item in fallback_store.anomalies:
        if item.get("id") == anomaly_id or item.get("properties", {}).get("anomaly_id") == anomaly_id:
            return GeoJSONFeature(**item)

    raise HTTPException(status_code=404, detail=f"Thermal anomaly '{anomaly_id}' not found.")


@router.post("/ingest", response_model=GeoJSONFeatureCollection)
async def ingest_raw_firms(payload: FIRMSIngestRequest):
    """
    Ingest raw NASA FIRMS satellite observations, automatically derive the 14 features
    using the GeospatialEngine, run ML classification, and persist in MongoDB.
    """
    ingested_features = []

    for point in payload.hotspots:
        bright = point.bright_ti4 or point.brightness or 340.0
        
        # 1. Derive 14 Features via GeoEngine
        derived = geo_engine.calculate_derived_features(
            lat=point.latitude,
            lon=point.longitude,
            frp=point.frp,
            bright_temp_k=bright,
            confidence_raw=point.confidence,
            daynight_raw=point.daynight,
            acq_date=point.acq_date or datetime.utcnow().strftime("%Y-%m-%d")
        )

        # 2. Run XGBoost ML Prediction
        pred_input = PredictionInput(
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
        prediction = ml_service.predict(pred_input)

        nearest_fac = derived.get("nearest_facility")
        anomaly_id = f"ANOM-{datetime.utcnow().strftime('%Y%m%d')}-{uuid.uuid4().hex[:6].upper()}"

        properties = AnomalyProperties(
            anomaly_id=anomaly_id,
            classification=prediction.predicted_class,
            confidence=prediction.confidence,
            risk_level=prediction.risk_level or "MODERATE",
            frp=point.frp,
            brightness_temp_k=bright,
            daynight=derived["daynight"],
            land_cover=derived["land_cover"],
            facility_name=nearest_fac["name"] if nearest_fac else None,
            facility_id=nearest_fac["id"] if nearest_fac else None,
            sector=nearest_fac["sector"] if nearest_fac else None,
            distance_to_facility_km=derived["industrial_proximity_km"],
            observation_count_7d=derived["observation_count_7d"],
            persistence_hours_7d=derived["persistence_hours_7d"],
            frp_trend_pct=derived["frp_trend_pct"],
            population_5km=derived["population_5km"],
            acq_date=point.acq_date or datetime.utcnow().strftime("%Y-%m-%d"),
            acq_time=point.acq_time or "1200",
            satellite=point.satellite or "VIIRS-NPP"
        )

        feature = GeoJSONFeature(
            type="Feature",
            id=anomaly_id,
            geometry=GeoJSONGeometry(type="Point", coordinates=[point.longitude, point.latitude]),
            properties=properties
        )

        doc_dict = feature.model_dump() if hasattr(feature, "model_dump") else feature.dict()

        # Save to MongoDB or Fallback
        if db_manager.is_connected and db_manager.db is not None:
            try:
                # Add location root key for 2dsphere indexing
                doc_dict["location"] = doc_dict["geometry"]
                doc_dict["frp"] = point.frp
                doc_dict["classification"] = prediction.predicted_class
                doc_dict["risk_level"] = prediction.risk_level
                doc_dict["sector"] = properties.sector
                await db_manager.db.anomalies.update_one(
                    {"anomaly_id": anomaly_id},
                    {"$set": doc_dict},
                    upsert=True
                )
            except Exception as e:
                pass

        fallback_store.anomalies.append(doc_dict)
        ingested_features.append(feature)

    return GeoJSONFeatureCollection(
        type="FeatureCollection",
        features=ingested_features,
        total_count=len(ingested_features)
    )
