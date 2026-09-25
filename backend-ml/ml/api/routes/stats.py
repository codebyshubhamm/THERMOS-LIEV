from datetime import datetime
from typing import Dict
from fastapi import APIRouter
from core.database import db_manager, fallback_store
from models.schemas import StatsResponse
from services.rag_service import rag_engine

router = APIRouter(prefix="/stats", tags=["Dashboard Analytics & Statistics"])


@router.get("", response_model=StatsResponse)
async def get_dashboard_stats():
    """
    Get aggregated analytics, class distributions, and radiative energy metrics
    for the web frontend dashboard charts.
    """
    anomalies_list = []

    if db_manager.is_connected and db_manager.db is not None:
        try:
            cursor = db_manager.db.anomalies.find({})
            async for doc in cursor:
                props = doc.get("properties", doc)
                anomalies_list.append(props)
        except Exception:
            pass

    if not anomalies_list:
        anomalies_list = [item.get("properties", item) for item in fallback_store.anomalies]

    class_dist: Dict[str, int] = {
        "Industrial Fire": 0,
        "Gas Flare": 0,
        "Industrial Thermal Source": 0,
        "Mining Activity": 0,
        "Wildfire": 0,
        "Agricultural Burning": 0
    }

    risk_dist: Dict[str, int] = {
        "CRITICAL": 0,
        "HIGH": 0,
        "MODERATE": 0,
        "LOW": 0
    }

    total_frp = 0.0
    high_risk_count = 0

    for a in anomalies_list:
        cls_name = a.get("classification", "Agricultural Burning")
        if cls_name in class_dist:
            class_dist[cls_name] += 1
        else:
            class_dist[cls_name] = 1

        risk = a.get("risk_level", "MODERATE").upper()
        if risk in risk_dist:
            risk_dist[risk] += 1
        else:
            risk_dist[risk] = 1

        frp = float(a.get("frp", 0.0))
        total_frp += frp

        if cls_name == "Industrial Fire" or risk in ["CRITICAL", "HIGH"]:
            high_risk_count += 1

    total_count = len(anomalies_list)
    avg_frp = round(total_frp / total_count, 2) if total_count > 0 else 0.0

    return StatsResponse(
        total_active_anomalies=total_count,
        class_distribution=class_dist,
        risk_level_distribution=risk_dist,
        total_radiative_power_mw=round(total_frp, 2),
        average_frp_mw=avg_frp,
        high_risk_industrial_hotspots=high_risk_count,
        monitored_facilities_count=len(rag_engine.facilities),
        timestamp=datetime.utcnow().isoformat() + "Z"
    )
