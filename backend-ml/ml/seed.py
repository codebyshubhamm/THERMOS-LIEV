import asyncio
import json
import logging
from pathlib import Path
import pandas as pd
from pymongo import MongoClient, GEOSPHERE
from core.config import settings
from services.geo_service import geo_engine
from services.ml_service import ml_service
from models.schemas import PredictionInput

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("thermos.seed")


def seed_database():
    logger.info("Starting THERMOS Automated Database Seeder...")

    # 1. Connect to MongoDB using PyMongo for synchronous fast seeding
    try:
        client = MongoClient(settings.MONGODB_URL, serverSelectionTimeoutMS=2000)
        client.admin.command('ping')
        db = client[settings.DATABASE_NAME]
        logger.info(f"Connected to MongoDB at {settings.MONGODB_URL}")
        mongo_available = True
    except Exception as e:
        logger.warning(f"MongoDB not reachable ({e}). Skipping remote write, validating local datasets.")
        mongo_available = False
        db = None

    # 2. Seed Facilities
    facilities = []
    if settings.FACILITIES_PATH.exists():
        with open(settings.FACILITIES_PATH, "r", encoding="utf-8") as f:
            facilities = json.load(f)
        logger.info(f"Loaded {len(facilities)} industrial facilities.")

        if mongo_available and db is not None:
            db.facilities.create_index([("location", GEOSPHERE)])
            for fac in facilities:
                db.facilities.update_one({"id": fac["id"]}, {"$set": fac}, upsert=True)
            logger.info("Successfully seeded 'facilities' collection in MongoDB.")

    # 3. Seed Anomalies from THERMOS CSV or Synthetic Spatial Clusters
    csv_path = Path(__file__).resolve().parent.parent / "THERMOS_ML_Core_15_Columns.csv"
    seeded_anomalies = []

    # Realistic satellite hotspots across India (Industrial complexes, forest tracts, agricultural stubble zones)
    sample_hotspots = [
        # Jamnagar Refinery Flare & Spikes
        {"lat": 22.3610, "lon": 69.8320, "frp": 68.5, "bright": 365.2, "conf": "h", "dn": "N", "name": "Jamnagar Flare Unit 1"},
        {"lat": 22.3550, "lon": 69.8250, "frp": 158.0, "bright": 398.0, "conf": "h", "dn": "N", "name": "Jamnagar Anomaly Spike"},
        # Paradip Refinery
        {"lat": 20.2880, "lon": 86.6380, "frp": 54.0, "bright": 355.0, "conf": "h", "dn": "N", "name": "Paradip Refinery Flare"},
        # Hazira LNG & Petrochemicals
        {"lat": 21.1210, "lon": 72.6480, "frp": 82.0, "bright": 372.0, "conf": "h", "dn": "D", "name": "Hazira Thermal Source"},
        # Manali Petrochemicals Chennai
        {"lat": 13.1690, "lon": 80.2630, "frp": 115.0, "bright": 385.0, "conf": "h", "dn": "D", "name": "Manali Chemical Unit Fire"},
        # Jamshedpur Tata Steel Works
        {"lat": 22.7980, "lon": 86.1980, "frp": 72.0, "bright": 362.0, "conf": "h", "dn": "N", "name": "Jamshedpur Blast Furnace"},
        # Jharia Coalfields (Mining fire)
        {"lat": 23.7550, "lon": 86.4180, "frp": 48.0, "bright": 348.0, "conf": "n", "dn": "D", "name": "Jharia Seam Fire"},
        # Singrauli Coal Mining
        {"lat": 24.2010, "lon": 82.6820, "frp": 38.0, "bright": 342.0, "conf": "n", "dn": "N", "name": "Singrauli Mine Area"},
        # Agricultural Burning (Punjab/Haryana)
        {"lat": 30.8500, "lon": 75.8000, "frp": 28.0, "bright": 325.0, "conf": "n", "dn": "D", "name": "Ludhiana Stubble Burn"},
        {"lat": 29.7200, "lon": 76.9500, "frp": 32.0, "bright": 328.0, "conf": "n", "dn": "D", "name": "Karnal Crop Residue Burn"},
        # Wildfires (Western Ghats & Similipal)
        {"lat": 14.1500, "lon": 74.9500, "frp": 95.0, "bright": 378.0, "conf": "h", "dn": "D", "name": "Western Ghats Wildfire"},
        {"lat": 21.8500, "lon": 86.3500, "frp": 120.0, "bright": 388.0, "conf": "h", "dn": "D", "name": "Similipal Forest Fire"}
    ]

    for i, h in enumerate(sample_hotspots, 1):
        lat = h["lat"]
        lon = h["lon"]
        frp = h["frp"]
        bright = h["bright"]

        derived = geo_engine.calculate_derived_features(
            lat=lat,
            lon=lon,
            frp=frp,
            bright_temp_k=bright,
            confidence_raw=h["conf"],
            daynight_raw=h["dn"],
            acq_date="2026-09-05"
        )

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
        pred = ml_service.predict(pred_input)

        nearest_fac = derived.get("nearest_facility")
        anomaly_id = f"ANOM-20260905-{i:03d}"

        doc = {
            "type": "Feature",
            "id": anomaly_id,
            "anomaly_id": anomaly_id,
            "geometry": {"type": "Point", "coordinates": [lon, lat]},
            "location": {"type": "Point", "coordinates": [lon, lat]},
            "frp": frp,
            "classification": pred.predicted_class,
            "risk_level": pred.risk_level,
            "sector": nearest_fac.get("sector") if nearest_fac else None,
            "properties": {
                "anomaly_id": anomaly_id,
                "classification": pred.predicted_class,
                "confidence": pred.confidence,
                "risk_level": pred.risk_level,
                "frp": frp,
                "brightness_temp_k": bright,
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

        seeded_anomalies.append(doc)
        if mongo_available and db is not None:
            db.anomalies.create_index([("location", GEOSPHERE)])
            db.anomalies.update_one({"anomaly_id": anomaly_id}, {"$set": doc}, upsert=True)

    logger.info(f"Seeded {len(seeded_anomalies)} thermal anomalies with full classifications.")
    logger.info("Database seeding completed successfully!")


if __name__ == "__main__":
    seed_database()
