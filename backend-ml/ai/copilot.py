import json
import os
import logging
from pathlib import Path
from typing import Dict, Any, List, Optional
import httpx

logger = logging.getLogger("thermos.integrated_ai.copilot")

BASE_DIR = Path(__file__).resolve().parent
FACILITIES_PATH = BASE_DIR / "knowledge" / "industrial_facilities.json"
HAZMAT_SOP_PATH = BASE_DIR / "knowledge" / "hazmat_sop_kb.json"


class RAGDisasterCopilot:
    """
    Retrieval-Augmented Generation (RAG) Industrial Disaster Intelligence Copilot.
    Retrieves Chemical MSDS Profiles, Facility Inventories, and NDMA Fire SOPs
    to generate Tactical Incident Action Plans (IAPs).
    """

    def __init__(self):
        self.facilities: List[Dict[str, Any]] = []
        self.facility_map: Dict[str, Dict[str, Any]] = {}
        self.hazmat_kb: Dict[str, Any] = {}
        self._load_kb()

    def _load_kb(self):
        try:
            if FACILITIES_PATH.exists():
                with open(FACILITIES_PATH, "r", encoding="utf-8") as f:
                    self.facilities = json.load(f)
                for fac in self.facilities:
                    self.facility_map[fac["id"]] = fac
                    self.facility_map[fac["name"].lower()] = fac

            if HAZMAT_SOP_PATH.exists():
                with open(HAZMAT_SOP_PATH, "r", encoding="utf-8") as f:
                    self.hazmat_kb = json.load(f)
        except Exception as e:
            logger.error(f"Error loading RAG Knowledge Base: {e}")

    def retrieve_context(self, query: str, facility_id: Optional[str] = None) -> Dict[str, Any]:
        matched_fac = None
        q_lower = query.lower()

        if facility_id and facility_id in self.facility_map:
            matched_fac = self.facility_map[facility_id]
        else:
            for fac in self.facilities:
                if fac["name"].lower() in q_lower or fac["id"].lower() in q_lower or fac["state"].lower() in q_lower:
                    matched_fac = fac
                    break

        if not matched_fac and self.facilities:
            matched_fac = self.facilities[0]

        matched_chems = []
        chem_kb = self.hazmat_kb.get("chemicals", {})
        if matched_fac:
            for c in matched_fac.get("hazardous_chemicals", []):
                for k, v in chem_kb.items():
                    if k.lower() in c.lower():
                        matched_chems.append({"chemical": k, "msds": v})

        sops_kb = self.hazmat_kb.get("sops", {})
        sops = sops_kb.get("Industrial Accidental Fire", [])
        if "flare" in q_lower:
            sops = sops_kb.get("Gas Flare Anomalous Spike", sops)

        return {"facility": matched_fac, "chemicals": matched_chems, "sops": sops}

    async def ask_copilot(self, query: str, facility_id: Optional[str] = None) -> Dict[str, Any]:
        ctx = self.retrieve_context(query, facility_id)
        fac = ctx["facility"]
        chems = ctx["chemicals"]
        sops = ctx["sops"]

        gemini_key = os.getenv("GEMINI_API_KEY")
        if gemini_key:
            try:
                url = f"https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key={gemini_key}"
                prompt = f"Facility: {json.dumps(fac)}\nMSDS: {json.dumps(chems)}\nSOPs: {json.dumps(sops)}\nQuestion: {query}"
                async with httpx.AsyncClient(timeout=10.0) as client:
                    resp = await client.post(url, json={"contents": [{"parts": [{"text": prompt}]}]})
                    if resp.status_code == 200:
                        text = resp.json()["candidates"][0]["content"]["parts"][0]["text"]
                        return {
                            "answer": text,
                            "facility_matched": fac["name"] if fac else "General",
                            "sources": ["Facility Hazmat DB", "Chemical MSDS", "NDMA Guidelines"]
                        }
            except Exception:
                pass

        # Failsafe Tactical Response Engine
        fac_name = fac["name"] if fac else "Industrial Complex"
        chem_list = [c["chemical"] for c in chems] or (fac.get("hazardous_chemicals", ["Hydrocarbons"]) if fac else ["Hydrocarbons"])
        protocol = fac.get("fire_suppression_protocol", "Class B AFFF Foam") if fac else "Class B Foam"
        evac = fac.get("evacuation_radius_km", 3.0) if fac else 3.0

        answer = (
            f"### Tactical RAG Intelligence Brief: {fac_name}\n\n"
            f"- **Hazardous Materials Present:** {', '.join(chem_list)}\n"
            f"- **Suppression Protocol:** {protocol}\n"
            f"- **Mandatory Evacuation Perimeter:** **{evac} km** downwind\n"
            f"- **Nearest Emergency Dispatch:** {fac.get('nearest_fire_station', 'District Fire Control') if fac else 'Local Fire Control'}\n\n"
            f"**NDMA Action Steps:**\n" + "\n".join([f"- {s}" for s in sops[:4]])
        )

        return {
            "answer": answer,
            "facility_matched": fac_name,
            "evacuation_radius_km": evac,
            "suppression_protocol": protocol,
            "chemical_hazards": chem_list,
            "sources": [
                f"Facility Registry: {fac_name}",
                f"MSDS Profiles: {', '.join(chem_list)}",
                "NDMA Chemical Industrial Disaster SOPs"
            ]
        }


disaster_copilot = RAGDisasterCopilot()
