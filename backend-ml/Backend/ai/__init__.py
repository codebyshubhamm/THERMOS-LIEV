"""
THERMOS AI Package (ai)
=======================
Provides unified Multi-Modal Geospatial Feature Extraction,
XGBoost Thermal Anomaly Classification (99.4% Accuracy),
and RAG-based Industrial Disaster Intelligence Copilot.
"""

from ai.spatial_engine import spatial_engine, GeospatialFeatureEngine
from ai.classifier import anomaly_classifier, ThermalAnomalyClassifier
from ai.copilot import disaster_copilot, RAGDisasterCopilot
from ai.api_router import router as ai_router

__all__ = [
    "spatial_engine",
    "GeospatialFeatureEngine",
    "anomaly_classifier",
    "ThermalAnomalyClassifier",
    "disaster_copilot",
    "RAGDisasterCopilot",
    "ai_router"
]
