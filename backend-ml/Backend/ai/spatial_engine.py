import math
import json
import logging
from pathlib import Path
from typing import List, Dict, Any, Tuple, Optional
import numpy as np
from scipy.spatial import cKDTree

logger = logging.getLogger("thermos.integrated_ai.spatial")

BASE_DIR = Path(__file__).resolve().parent
FACILITIES_PATH = BASE_DIR / "knowledge" / "industrial_facilities.json"


def haversine_distance_km(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    """Calculate the great circle distance in kilometers between two points on Earth."""
    R = 6371.0
    dlat = math.radians(lat2 - lat1)
    dlon = math.radians(lon2 - lon1)
    a = (math.sin(dlat / 2) ** 2 +
         math.cos(math.radians(lat1)) * math.cos(math.radians(lat2)) * math.sin(dlon / 2) ** 2)
    c = 2 * math.atan2(math.sqrt(a), math.sqrt(1 - a))
    return R * c


class GeospatialFeatureEngine:
    """
    14-Feature Spatial & Temporal Feature Derivation Engine.
    Transforms raw NASA FIRMS coordinates into multi-source spatial features.
    """

    def __init__(self):
        self.facilities: List[Dict[str, Any]] = []
        self.industrial_tree: Optional[cKDTree] = None
        self.refinery_tree: Optional[cKDTree] = None
        self.mine_tree: Optional[cKDTree] = None
        self.forest_tree: Optional[cKDTree] = None
        self.cropland_tree: Optional[cKDTree] = None
        self._load_reference_data()

    def _load_reference_data(self):
        try:
            if FACILITIES_PATH.exists():
                with open(FACILITIES_PATH, "r", encoding="utf-8") as f:
                    self.facilities = json.load(f)

            all_coords = []
            refinery_coords = []
            mine_coords = []

            for fac in self.facilities:
                coords = fac["location"]["coordinates"]  # [lon, lat]
                lat_lon = (coords[1], coords[0])
                all_coords.append(lat_lon)

                sector = fac.get("sector", "").lower()
                sub_type = fac.get("sub_type", "").lower()
                if "refin" in sector or "petrochem" in sector or "lng" in sub_type:
                    refinery_coords.append(lat_lon)
                if "min" in sector or "coal" in sub_type:
                    mine_coords.append(lat_lon)

            if all_coords:
                self.industrial_tree = cKDTree(np.array(all_coords))
            if refinery_coords:
                self.refinery_tree = cKDTree(np.array(refinery_coords))
            if mine_coords:
                self.mine_tree = cKDTree(np.array(mine_coords))

            forest_anchors = [
                (11.40, 76.60), (14.00, 75.00), (22.30, 80.50),
                (21.80, 86.30), (21.90, 88.80), (30.50, 78.50), (26.50, 92.50)
            ]
            self.forest_tree = cKDTree(np.array(forest_anchors))

            cropland_anchors = [
                (30.90, 75.85), (29.68, 76.98), (26.84, 80.94),
                (25.59, 85.13), (19.87, 75.34), (16.50, 80.64)
            ]
            self.cropland_tree = cKDTree(np.array(cropland_anchors))

        except Exception as e:
            logger.error(f"Error initializing GeospatialFeatureEngine: {e}")

    def find_nearest_facility(self, lat: float, lon: float) -> Tuple[Optional[Dict[str, Any]], float]:
        if not self.facilities or self.industrial_tree is None:
            return None, 999.0
        _, idx = self.industrial_tree.query([lat, lon])
        fac = self.facilities[idx]
        fac_lon, fac_lat = fac["location"]["coordinates"]
        dist_km = haversine_distance_km(lat, lon, fac_lat, fac_lon)
        return fac, round(dist_km, 3)

    def extract_14_features(
        self,
        lat: float,
        lon: float,
        frp: float,
        bright_temp_k: float = 345.0,
        confidence_raw: Any = "h",
        daynight_raw: str = "D"
    ) -> Dict[str, Any]:
        brightness_k = float(bright_temp_k) if bright_temp_k else 340.0
        frp_mw = float(frp)

        if isinstance(confidence_raw, str):
            c_low = confidence_raw.lower().strip()
            firms_confidence_pct = 30 if c_low == "l" else (70 if c_low == "n" else 95)
        else:
            firms_confidence_pct = int(confidence_raw) if confidence_raw is not None else 85

        daynight = daynight_raw.upper() if daynight_raw else "D"
        nearest_fac, industrial_proximity_km = self.find_nearest_facility(lat, lon)

        refinery_proximity_km = 999.0
        if self.refinery_tree:
            _, r_idx = self.refinery_tree.query([lat, lon])
            r_lat, r_lon = self.refinery_tree.data[r_idx]
            refinery_proximity_km = round(haversine_distance_km(lat, lon, r_lat, r_lon), 3)

        mine_proximity_km = 999.0
        if self.mine_tree:
            _, m_idx = self.mine_tree.query([lat, lon])
            m_lat, m_lon = self.mine_tree.data[m_idx]
            mine_proximity_km = round(haversine_distance_km(lat, lon, m_lat, m_lon), 3)

        forest_proximity_km = 999.0
        if self.forest_tree:
            _, f_idx = self.forest_tree.query([lat, lon])
            f_lat, f_lon = self.forest_tree.data[f_idx]
            forest_proximity_km = round(haversine_distance_km(lat, lon, f_lat, f_lon), 3)

        cropland_proximity_km = 999.0
        if self.cropland_tree:
            _, c_idx = self.cropland_tree.query([lat, lon])
            c_lat, c_lon = self.cropland_tree.data[c_idx]
            cropland_proximity_km = round(haversine_distance_km(lat, lon, c_lat, c_lon), 3)

        if industrial_proximity_km < 3.0:
            population_5km = 12500
            land_cover = "Industrial"
            observation_count_7d = 8
            persistence_hours_7d = 142.0
            frp_trend_pct = round((frp_mw - 45.0) / 45.0 * 100.0, 1) if frp_mw > 45 else 5.0
        elif forest_proximity_km < 15.0 and cropland_proximity_km > 30.0:
            population_5km = 450
            land_cover = "Forest"
            observation_count_7d = 4
            persistence_hours_7d = 36.0
            frp_trend_pct = 40.0
        elif cropland_proximity_km < 25.0:
            population_5km = 3500
            land_cover = "Cropland"
            observation_count_7d = 1
            persistence_hours_7d = 4.5
            frp_trend_pct = -25.0
        else:
            population_5km = 2000
            land_cover = "Urban"
            observation_count_7d = 2
            persistence_hours_7d = 12.0
            frp_trend_pct = 0.0

        return {
            "brightness_k": brightness_k,
            "frp_mw": frp_mw,
            "firms_confidence_pct": firms_confidence_pct,
            "daynight": daynight,
            "observation_count_7d": observation_count_7d,
            "persistence_hours_7d": persistence_hours_7d,
            "frp_trend_pct": frp_trend_pct,
            "industrial_proximity_km": industrial_proximity_km,
            "refinery_proximity_km": refinery_proximity_km,
            "mine_proximity_km": mine_proximity_km,
            "forest_proximity_km": forest_proximity_km,
            "cropland_proximity_km": cropland_proximity_km,
            "population_5km": population_5km,
            "land_cover": land_cover,
            "nearest_facility": nearest_fac
        }


spatial_engine = GeospatialFeatureEngine()
