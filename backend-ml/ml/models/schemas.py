from pydantic import BaseModel, Field
from typing import List, Dict, Any, Optional


# ==========================================
# 1. Core 14-Feature ML Schemas (Direct Inference)
# ==========================================

class PredictionInput(BaseModel):
    brightness_k: float = Field(..., ge=200, le=500, description="Brightness temperature in Kelvin (bright_ti4)")
    frp_mw: float = Field(..., ge=0, le=5000, description="Fire Radiative Power in MW")
    firms_confidence_pct: int = Field(..., ge=0, le=100, description="FIRMS confidence percentage (0-100)")
    daynight: str = Field(..., description="Day (D) or Night (N)")
    observation_count_7d: int = Field(..., ge=0, le=100, description="Observation count in 7 days")
    persistence_hours_7d: float = Field(..., ge=0, le=168, description="Persistence duration in hours within 7 days")
    frp_trend_pct: float = Field(..., ge=-100, le=500, description="FRP trend percentage change")
    industrial_proximity_km: float = Field(..., ge=0, description="Distance to nearest industrial area (km)")
    refinery_proximity_km: float = Field(..., ge=0, description="Distance to nearest oil/gas refinery (km)")
    mine_proximity_km: float = Field(..., ge=0, description="Distance to nearest mine (km)")
    forest_proximity_km: float = Field(..., ge=0, description="Distance to nearest forest (km)")
    cropland_proximity_km: float = Field(..., ge=0, description="Distance to nearest cropland (km)")
    population_5km: int = Field(..., ge=0, description="Estimated population inside 5km radius")
    land_cover: str = Field(..., description="Land cover type (e.g., Industrial, Forest, Cropland, Urban)")


class PredictionOutput(BaseModel):
    predicted_class: str
    confidence: float
    all_probabilities: Dict[str, float]
    risk_level: Optional[str] = None
    derived_features: Optional[Dict[str, Any]] = None


# ==========================================
# 2. Raw NASA FIRMS Satellite Ingestion Schemas
# ==========================================

class RawFIRMSPoint(BaseModel):
    latitude: float = Field(..., ge=-90, le=90)
    longitude: float = Field(..., ge=-180, le=180)
    bright_ti4: Optional[float] = Field(None, description="VIIRS I4 brightness temp (K)")
    brightness: Optional[float] = Field(None, description="MODIS brightness temp (K)")
    frp: float = Field(..., ge=0, description="Fire Radiative Power (MW)")
    confidence: Any = Field("n", description="Confidence: 'l'/'n'/'h' or integer 0-100")
    daynight: str = Field("D", description="'D' or 'N'")
    acq_date: Optional[str] = "2026-09-05"
    acq_time: Optional[str] = "1200"
    satellite: Optional[str] = "VIIRS-NPP"


class FIRMSIngestRequest(BaseModel):
    hotspots: List[RawFIRMSPoint]


# ==========================================
# 3. Standard GeoJSON Schemas (Frontend Ready)
# ==========================================

class GeoJSONGeometry(BaseModel):
    type: str = "Point"
    coordinates: List[float]  # [longitude, latitude]


class AnomalyProperties(BaseModel):
    anomaly_id: str
    classification: str
    confidence: float
    risk_level: str  # LOW, MODERATE, HIGH, CRITICAL
    frp: float
    brightness_temp_k: float
    daynight: str
    land_cover: str
    facility_name: Optional[str] = None
    facility_id: Optional[str] = None
    sector: Optional[str] = None
    distance_to_facility_km: Optional[float] = None
    observation_count_7d: int
    persistence_hours_7d: float
    frp_trend_pct: float
    population_5km: int
    acq_date: str
    acq_time: str
    satellite: str


class GeoJSONFeature(BaseModel):
    type: str = "Feature"
    id: str
    geometry: GeoJSONGeometry
    properties: AnomalyProperties


class GeoJSONFeatureCollection(BaseModel):
    type: str = "FeatureCollection"
    features: List[GeoJSONFeature]
    total_count: int


# ==========================================
# 4. Industrial Facility Schemas
# ==========================================

class FacilitySchema(BaseModel):
    id: str
    name: str
    sector: str
    sub_type: str
    state: str
    location: GeoJSONGeometry
    hazardous_chemicals: List[str]
    fire_suppression_protocol: str
    evacuation_radius_km: float
    hazard_tier: str
    emergency_contact: str
    nearest_fire_station: str


# ==========================================
# 5. RAG & AI Copilot Schemas
# ==========================================

class RAGChatRequest(BaseModel):
    query: str
    anomaly_id: Optional[str] = None
    facility_id: Optional[str] = None


class RAGChatResponse(BaseModel):
    answer: str
    sources_used: List[str]
    threat_assessment: Optional[str] = None
    action_items: Optional[List[str]] = None


class IncidentBriefRequest(BaseModel):
    anomaly_id: str


class IncidentBriefResponse(BaseModel):
    incident_id: str
    anomaly_id: str
    facility_name: str
    classification: str
    threat_level: str
    estimated_evacuation_radius_km: float
    primary_chemical_hazards: List[str]
    fire_suppression_agent: str
    tactical_summary: str
    ndma_sop_checklist: List[str]
    emergency_contacts: Dict[str, str]


# ==========================================
# 6. Dashboard Analytics & Statistics Schema
# ==========================================

class StatsResponse(BaseModel):
    total_active_anomalies: int
    class_distribution: Dict[str, int]
    risk_level_distribution: Dict[str, int]
    total_radiative_power_mw: float
    average_frp_mw: float
    high_risk_industrial_hotspots: int
    monitored_facilities_count: int
    timestamp: str
