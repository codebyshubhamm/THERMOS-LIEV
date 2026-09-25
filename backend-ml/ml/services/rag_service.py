import json
import logging
import httpx
from typing import Dict, Any, List, Optional
from core.config import settings
from models.schemas import RAGChatResponse, IncidentBriefResponse

logger = logging.getLogger("thermos.rag")


class RAGDisasterIntelligenceEngine:
    """
    RAG (Retrieval-Augmented Generation) & AI Copilot Engine for
    Industrial Thermal Intelligence & Disaster Early Warning.
    """

    def __init__(self):
        self.facilities: List[Dict[str, Any]] = []
        self.facility_map: Dict[str, Dict[str, Any]] = {}
        self.hazmat_kb: Dict[str, Any] = {}
        self._load_knowledge_base()

    def _load_knowledge_base(self):
        try:
            if settings.FACILITIES_PATH.exists():
                with open(settings.FACILITIES_PATH, "r", encoding="utf-8") as f:
                    self.facilities = json.load(f)
                    for fac in self.facilities:
                        self.facility_map[fac["id"]] = fac
                        self.facility_map[fac["name"].lower()] = fac
                logger.info(f"RAG Engine loaded {len(self.facilities)} facility profiles.")

            if settings.HAZMAT_SOP_PATH.exists():
                with open(settings.HAZMAT_SOP_PATH, "r", encoding="utf-8") as f:
                    self.hazmat_kb = json.load(f)
                logger.info("RAG Engine loaded MSDS chemical profiles & NDMA disaster SOPs.")
        except Exception as e:
            logger.error(f"Failed to load RAG knowledge base: {e}")

    def retrieve_context(self, query: str, facility_id: Optional[str] = None) -> Dict[str, Any]:
        """Retrieve relevant facility info, chemical MSDS, and SOPs."""
        matched_facility = None
        matched_chemicals = []
        matched_sops = []

        q_lower = query.lower()

        # 1. Match Facility
        if facility_id and facility_id in self.facility_map:
            matched_facility = self.facility_map[facility_id]
        else:
            for fac in self.facilities:
                if fac["name"].lower() in q_lower or fac["id"].lower() in q_lower or fac["state"].lower() in q_lower:
                    matched_facility = fac
                    break

        if not matched_facility and self.facilities:
            # Default to primary complex if unspecified
            matched_facility = self.facilities[0]

        # 2. Match Chemicals & MSDS
        chem_kb = self.hazmat_kb.get("chemicals", {})
        if matched_facility:
            for chem in matched_facility.get("hazardous_chemicals", []):
                for k, v in chem_kb.items():
                    if k.lower() in chem.lower():
                        matched_chemicals.append({"chemical": k, "data": v})

        # 3. Match SOPs
        sops_kb = self.hazmat_kb.get("sops", {})
        if "flare" in q_lower:
            matched_sops.extend(sops_kb.get("Gas Flare Anomalous Spike", []))
        elif "wildfire" in q_lower or "forest" in q_lower:
            matched_sops.extend(sops_kb.get("Wildfire Boundary Interception", []))
        else:
            matched_sops.extend(sops_kb.get("Industrial Accidental Fire", []))

        return {
            "facility": matched_facility,
            "chemicals": matched_chemicals,
            "sops": matched_sops
        }

    async def chat(self, query: str, anomaly_data: Optional[Dict[str, Any]] = None, facility_id: Optional[str] = None) -> RAGChatResponse:
        context = self.retrieve_context(query, facility_id)
        fac = context["facility"]
        chems = context["chemicals"]
        sops = context["sops"]

        # If LLM API Key is configured, attempt live synthesis
        if settings.GEMINI_API_KEY:
            try:
                llm_response = await self._call_gemini(query, fac, chems, sops, anomaly_data)
                if llm_response:
                    return llm_response
            except Exception as e:
                logger.warning(f"Live LLM call failed ({e}), using offline tactical engine.")

        # High-Grade Failsafe Tactical Synthesis Engine
        return self._generate_offline_tactical_response(query, fac, chems, sops, anomaly_data)

    def generate_incident_brief(self, anomaly: Dict[str, Any]) -> IncidentBriefResponse:
        """Generate formal NDMA/OSHA Disaster Incident Action Plan."""
        fac_name = anomaly.get("facility_name", "Jamnagar Petrochemical Complex")
        context = self.retrieve_context(fac_name)
        fac = context["facility"] or self.facilities[0]
        chems = [c["chemical"] for c in context["chemicals"]] or fac.get("hazardous_chemicals", ["Benzene", "LPG"])

        classification = anomaly.get("classification", "Industrial Accidental Fire")
        frp = anomaly.get("frp", 85.0)
        risk_level = anomaly.get("risk_level", "CRITICAL")

        suppression = fac.get("fire_suppression_protocol", "Class B AFFF Foam deluge with boundary water cooling.")
        evac_radius = fac.get("evacuation_radius_km", 3.0)
        if frp > 150:
            evac_radius += 1.0

        tactical_summary = (
            f"URGENT DISASTER ALERT: A {risk_level} severity thermal anomaly ({frp} MW FRP) "
            f"has been classified as '{classification}' within the operational perimeter of {fac.get('name')}. "
            f"Active containment protocols have been triggered due to proximity of critical storage ({', '.join(chems[:3])})."
        )

        return IncidentBriefResponse(
            incident_id=f"INC-{anomaly.get('anomaly_id', 'ANOM-01')}",
            anomaly_id=anomaly.get("anomaly_id", "ANOM-01"),
            facility_name=fac.get("name", "Industrial Complex"),
            classification=classification,
            threat_level=f"LEVEL-3 {risk_level} HAZARD",
            estimated_evacuation_radius_km=evac_radius,
            primary_chemical_hazards=chems,
            fire_suppression_agent=suppression,
            tactical_summary=tactical_summary,
            ndma_sop_checklist=self.hazmat_kb.get("sops", {}).get("Industrial Accidental Fire", []),
            emergency_contacts={
                "Plant Safety Operations": fac.get("emergency_contact", "+91-11-23438000"),
                "Nearest Fire Station": fac.get("nearest_fire_station", "District Central Fire Station"),
                "National Disaster Helpline (NDMA)": "1078 / 112"
            }
        )

    def _generate_offline_tactical_response(
        self,
        query: str,
        fac: Optional[Dict[str, Any]],
        chems: List[Dict[str, Any]],
        sops: List[str],
        anomaly_data: Optional[Dict[str, Any]]
    ) -> RAGChatResponse:
        fac_name = fac["name"] if fac else "Industrial Facility"
        chem_names = [c["chemical"] for c in chems] or ["Hydrocarbons", "LPG"]
        evac_radius = fac.get("evacuation_radius_km", 2.5) if fac else 2.5
        protocol = fac.get("fire_suppression_protocol", "Class B AFFF Foam") if fac else "Class B Foam"

        answer = (
            f"### Tactical Intelligence Assessment for {fac_name}\n\n"
            f"**1. Threat & Hazardous Materials Identified:**\n"
            f"- Primary Chemical Risks: {', '.join(chem_names)}\n"
            f"- Hazard Classification: {fac.get('hazard_tier', 'Major Accident Hazard (MAH)')}\n\n"
            f"**2. Fire Suppression & Containment Protocol:**\n"
            f"- Recommended Agent: {protocol}\n"
            f"- Evacuation Perimeter: Mandatory **{evac_radius} km** radius downwind\n\n"
            f"**3. Immediate Operational Checklist (NDMA Guidelines):**\n"
        )
        for i, step in enumerate(sops[:4], 1):
            answer += f"{i}. {step}\n"

        action_items = [
            f"Isolate fuel/chemical manifold valves at {fac_name}",
            f"Establish safety perimeter of {evac_radius} km downwind",
            f"Deploy {protocol} monitors on vulnerable storage tanks",
            f"Notify {fac.get('nearest_fire_station', 'Local Fire Authority')}"
        ]

        return RAGChatResponse(
            answer=answer,
            sources_used=[
                f"Facility Profile: {fac_name}",
                f"Material Safety Data Sheets (MSDS) for {', '.join(chem_names)}",
                "NDMA National Disaster Management Guidelines for Chemical Industrial Disasters"
            ],
            threat_assessment="CRITICAL HAZMAT DISPERSION RISK",
            action_items=action_items
        )

    async def _call_gemini(
        self,
        query: str,
        fac: Optional[Dict[str, Any]],
        chems: List[Dict[str, Any]],
        sops: List[str],
        anomaly_data: Optional[Dict[str, Any]]
    ) -> Optional[RAGChatResponse]:
        candidate_models = ["gemini-3.1-flash-lite", "gemini-flash-lite-latest", "gemini-3.5-flash-lite", "gemini-3.8-flash"]
        async with httpx.AsyncClient(timeout=15.0) as client:
            for model_name in candidate_models:
                url = f"https://generativelanguage.googleapis.com/v1beta/models/{model_name}:generateContent?key={settings.GEMINI_API_KEY}"
                try:
                    resp = await client.post(url, json=payload)
                    if resp.status_code == 200:
                        result = resp.json()
                        text = result["candidates"][0]["content"]["parts"][0]["text"]
                        return RAGChatResponse(
                            answer=text,
                            sources_used=[
                                f"Facility Profile: {fac.get('name') if fac else 'N/A'}",
                                "MSDS Chemical Database",
                                "NDMA Industrial Fire Safety Guidelines"
                            ],
                            threat_assessment="ACTIVE INDUSTRIAL MONITORING",
                            action_items=[
                                f"Deploy {fac.get('fire_suppression_protocol', 'Class B Foam') if fac else 'Class B Foam'}",
                                f"Maintain {fac.get('evacuation_radius_km', 2.5) if fac else 2.5}km evacuation buffer"
                            ]
                        )
                except Exception:
                    continue
        return None


rag_engine = RAGDisasterIntelligenceEngine()
