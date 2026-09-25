from typing import Optional, Dict, Any
from fastapi import APIRouter, HTTPException
from core.database import db_manager, fallback_store
from models.schemas import (
    RAGChatRequest,
    RAGChatResponse,
    IncidentBriefRequest,
    IncidentBriefResponse
)
from services.rag_service import rag_engine

router = APIRouter(prefix="/rag", tags=["RAG & AI Disaster Copilot"])


@router.post("/chat", response_model=RAGChatResponse)
async def chat_copilot(payload: RAGChatRequest):
    """
    AI Disaster Copilot: Ask questions about industrial fire risks, chemical hazards,
    evacuation perimeters, and NDMA emergency response protocols.
    """
    anomaly_data = None
    if payload.anomaly_id:
        if db_manager.is_connected and db_manager.db is not None:
            anomaly_data = await db_manager.db.anomalies.find_one({"anomaly_id": payload.anomaly_id})
        if not anomaly_data:
            for item in fallback_store.anomalies:
                if item.get("id") == payload.anomaly_id or item.get("properties", {}).get("anomaly_id") == payload.anomaly_id:
                    anomaly_data = item
                    break

    response = await rag_engine.chat(
        query=payload.query,
        anomaly_data=anomaly_data,
        facility_id=payload.facility_id
    )
    return response


@router.post("/incident-brief", response_model=IncidentBriefResponse)
async def generate_incident_brief(payload: IncidentBriefRequest):
    """
    Generate an automated, NDMA/OSHA-compliant Tactical Disaster Incident Briefing
    with dynamic evacuation radii and suppression protocols.
    """
    anomaly_dict: Optional[Dict[str, Any]] = None

    if db_manager.is_connected and db_manager.db is not None:
        doc = await db_manager.db.anomalies.find_one({"anomaly_id": payload.anomaly_id})
        if doc:
            props = doc.get("properties", doc)
            anomaly_dict = props

    if not anomaly_dict:
        for item in fallback_store.anomalies:
            if item.get("id") == payload.anomaly_id or item.get("properties", {}).get("anomaly_id") == payload.anomaly_id:
                anomaly_dict = item.get("properties", item)
                break

    if not anomaly_dict:
        # Generate baseline incident brief for the query ID
        anomaly_dict = {
            "anomaly_id": payload.anomaly_id,
            "facility_name": "Jamnagar Petrochemical Complex",
            "classification": "Industrial Accidental Fire",
            "frp": 125.0,
            "risk_level": "CRITICAL"
        }

    brief = rag_engine.generate_incident_brief(anomaly_dict)
    return brief
