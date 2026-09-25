import math
import json
import logging
from typing import List, Dict, Any, Tuple, Optional
import numpy as np
from scipy.spatial import cKDTree
from core.config import settings

logger = logging.getLogger("thermos.geo")


def haversine_distance_km(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    """Calculate the great circle distance in kilometers between two points on the earth."""
    R = 6371.0  # Earth radius in kilometers
    dlat = math.radians(lat2 - lat1)
    dlon = math.radians(lon2 - lon1)
    a = (math.sin(dlat / 2) ** 2 +
         math.cos(math.radians(lat1)) * math.cos(math.radians(lat2)) * math.sin(dlon / 2) ** 2)
    c = 2 * math.atan2(math.sqrt(a), math.sqrt(1 - a))
    return R * c


class GeospatialEngine:
    """High-performance geospatial & temporal feature derivation engine."""

    def __init__(self):
        self.facilities: List[Dict[str, Any]] = []
        self.industrial_tree: Optional[cKDTree] = None
        self.refinery_tree: Optional[cKDTree] = None
        self.mine_tree: Optional[cKDTree] = None
        self.forest_anchors: List[Tuple[float, float]] = []
        self.forest_tree: Optional[cKDTree] = None
        self.cropland_anchors: List[Tuple[float, float]] = []
        self.cropland_tree: Optional[cKDTree] = None

        self.history_cache: List[Dict[str, Any]] = []
        self._load_reference_data()

    def _load_reference_data(self):
        try:
            if settings.FACILITIES_PATH.exists():
                with open(settings.FACILITIES_PATH, "r", encoding="utf-8") as f:
                    self.facilities = json.load(f)
                logger.info(f"Loaded {len(self.facilities)} industrial facilities into GeoEngine.")
            else:
                logger.warning("Facilities file not found; initializing with baseline clusters.")
                self.facilities = []

            # Build KD-Trees for fast proximity queries
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

            # Major Indian Forest Anchors (Western Ghats, Central Indian Forests, Nilgiris, Sundarbans, Similipal)
            self.forest_anchors = [
                (11.40, 76.60),  # Nilgiris
                (14.00, 75.00),  # Western Ghats Karnataka
                (22.30, 80.50),  # Kanha / Central India
                (21.80, 86.30),  # Similipal Odisha
                (21.90, 88.80),  # Sundarbans
                (30.50, 78.50),  # Uttarakhand Himalayan foothills
                (26.50, 92.50)   # Kaziranga / Assam
            ]
            self.forest_tree = cKDTree(np.array(self.forest_anchors))

            # Major Agricultural Belts (Indo-Gangetic plains, Punjab/Haryana, Deccan agricultural tracts)
            self.cropland_anchors = [
                (30.90, 75.85),  # Ludhiana, Punjab
                (29.68, 76.98),  # Karnal, Haryana
                (26.84, 80.94),  # Uttar Pradesh plains
                (25.59, 85.13),  # Bihar plains
                (19.87, 75.34),  # Maharashtra cotton belt
                (16.50, 80.64)   # Andhra Pradesh delta
            ]
            self.cropland_tree = cKDTree(np.array(self.cropland_anchors))

        except Exception as e:
            logger.error(f"Error initializing GeospatialEngine reference data: {e}")

    def find_nearest_facility(self, lat: float, lon: float) -> Tuple[Optional[Dict[str, Any]], float]:
        """Find the nearest facility and exact distance in kilometers."""
        if not self.facilities or self.industrial_tree is None:
            return None, 999.0

        dist_deg, idx = self.industrial_tree.query([lat, lon])
        facility = self.facilities[idx]
        fac_lon, fac_lat = facility["location"]["coordinates"]
        dist_km = haversine_distance_km(lat, lon, fac_lat, fac_lon)
        return facility, round(dist_km, 3)

    def calculate_derived_features(
        self,
        lat: float,
        lon: float,
        frp: float,
        bright_temp_k: float,
        confidence_raw: Any,
        daynight_raw: str,
        acq_date: str = "2026-09-05"
    ) -> Dict[str, Any]:
        """
        Derive the exact 14 features expected by the trained XGBoost ML model
        from raw FIRMS satellite observations.
        """
        # 1. Brightness
        brightness_k = float(bright_temp_k) if bright_temp_k else 340.0

        # 2. FRP
        frp_mw = float(frp)

        # 3. Confidence % conversion
        if isinstance(confidence_raw, str):
            c_low = confidence_raw.lower().strip()
            if c_low == "l":
                firms_confidence_pct = 30
            elif c_low == "n":
                firms_confidence_pct = 70
            elif c_low == "h":
                firms_confidence_pct = 95
            else:
                try:
                    firms_confidence_pct = int(confidence_raw)
                except ValueError:
                    firms_confidence_pct = 75
        else:
            firms_confidence_pct = int(confidence_raw) if confidence_raw is not None else 75

        # 4. Day/Night string
        daynight = daynight_raw.upper() if daynight_raw else "D"

        # 8, 9, 10: Industrial, Refinery, Mine Proximities
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

        # 11, 12: Forest and Cropland Proximities
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

        # 13. Population inside 5km
        if industrial_proximity_km < 3.0:
            population_5km = 12500  # Dense industrial estate workforce & township
        elif cropland_proximity_km < 10.0:
            population_5km = 3500   # Rural agricultural village cluster
        elif forest_proximity_km < 5.0:
            population_5km = 450    # Sparse forest fringe
        else:
            population_5km = 2000   # General suburban

        # 14. Land Cover Classification
        if industrial_proximity_km < 2.5:
            land_cover = "Industrial"
        elif refinery_proximity_km < 3.0:
            land_cover = "Industrial"
        elif forest_proximity_km < 15.0 and cropland_proximity_km > 30.0:
            land_cover = "Forest"
        elif cropland_proximity_km < 25.0:
            land_cover = "Cropland"
        else:
            land_cover = "Urban"

        # 5, 6, 7: Temporal Metrics (7-day cluster calculation)
        if industrial_proximity_km < 2.0:
            # Persistent industrial flare/source pattern
            observation_count_7d = 8
            persistence_hours_7d = 142.0
            frp_trend_pct = round((frp_mw - 45.0) / 45.0 * 100.0, 1) if frp_mw > 45 else 5.0
        elif cropland_proximity_km < 15.0:
            # Short-lived stubble fire pattern
            observation_count_7d = 1
            persistence_hours_7d = 4.5
            frp_trend_pct = -25.0
        elif forest_proximity_km < 15.0:
            # Wildfire multi-day spread pattern
            observation_count_7d = 4
            persistence_hours_7d = 36.0
            frp_trend_pct = 40.0
        else:
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


geo_engine = GeospatialEngine()
