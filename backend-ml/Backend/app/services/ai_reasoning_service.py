"""
AI Situational Reasoning Layer for THERMOS
==========================================
Takes raw satellite telemetry (NASA FIRMS), OpenStreetMap industrial & emergency infrastructure,
Copernicus land cover, and ML classification outputs to compute:
1. Origin & Temporal Emergence Estimates
2. Projected Duration / Containment Spread Analysis
3. Surrounding Exposure Context (Population buffer + Nearest Hospital & Fire Station)
4. Gemini Situational Synthesis Briefing
"""
from __future__ import annotations

import json
import logging
from typing import Any

from app.core.config import get_settings
from app.services.osm_service import get_emergency_infrastructure_context
from app.services.ai_explainer_service import generate_fire_explanation

log = logging.getLogger("thermos.ai_reasoning")


def estimate_origin(event: dict[str, Any]) -> dict[str, Any]:
    """1. Origin estimate based on FIRMS timestamps and persistence history."""
    persist_hrs = float(
        event.get("persistence_hours")
        or event.get("persistence_hours_7d")
        or (event.get("properties") or {}).get("persistence_hours")
        or 2.0
    )
    obs_count = int(
        event.get("observation_count")
        or event.get("observation_count_7d")
        or (event.get("properties") or {}).get("observation_count")
        or 1
    )
    first_detected = (
        event.get("first_detected")
        or event.get("acquired_at")
        or (event.get("properties") or {}).get("first_detected")
        or "recent overpass"
    )

    if persist_hrs >= 72.0:
        desc = (
            f"Persistent multi-day anomaly logged continuously for {persist_hrs:.0f} hours "
            f"across {obs_count} satellite passes. First recorded: {first_detected}."
        )
        status = "Chronic Persistent"
    elif persist_hrs >= 24.0:
        days = round(persist_hrs / 24.0, 1)
        desc = (
            f"Thermal emission established for approximately {days} days ({persist_hrs:.0f}h) "
            f"over {obs_count} satellite overpasses. First detected: {first_detected}."
        )
        status = "Established Anomaly"
    elif persist_hrs >= 6.0:
        desc = (
            f"Active thermal signature detected consistently for the past {persist_hrs:.0f} hours "
            f"over {obs_count} satellite passes."
        )
        status = "Ongoing Detection"
    else:
        desc = (
            f"Recent thermal emergence detected within the last {max(persist_hrs, 2.0):.0f} hours "
            f"during satellite orbital overpass."
        )
        status = "Recent Emergence"

    return {
        "status": status,
        "persistence_hours": persist_hrs,
        "observation_count": obs_count,
        "first_detected": first_detected,
        "description": desc,
    }


def estimate_containment_progression(event: dict[str, Any]) -> dict[str, Any]:
    """2. Projected duration / containment estimate using FRP trend and category context."""
    p = event.get("properties") or event
    cat = (
        p.get("category")
        or (p.get("classification") or {}).get("category")
        or (p.get("classification") or {}).get("predicted_class")
        or "Thermal Hotspot"
    )
    frp = float(p.get("frp") or p.get("frp_mw") or 15.0)
    frp_trend = float(p.get("frp_trend_pct") or 0.0)
    lc = (p.get("land_cover_type") or p.get("land_cover") or "").lower()

    if "flare" in cat.lower() or "thermal source" in cat.lower():
        progression = "Routine Operational Combustion"
        risk_profile = "Stable / Controlled"
        desc = (
            "Thermal profile is consistent with routine industrial stack flaring. Heat signature is "
            "engineered for ongoing combustion within operational flare containment."
        )
    elif "industrial fire" in cat.lower():
        if frp_trend < -15.0:
            progression = "Decreasing Thermal Intensity"
            risk_profile = "Probable Stabilization"
            desc = (
                f"Radiative intensity shows a downward trend ({frp_trend:.1f}%), suggesting active "
                "industrial suppression or localized fuel depletion. Continued monitoring required."
            )
        elif frp > 50.0:
            progression = "High Radiative Output"
            risk_profile = "Potential Lateral Escalation"
            desc = (
                f"Elevated radiative output ({frp:.1f} MW) within an industrial complex indicates significant "
                "combustion energy with risk of thermal radiation to adjacent storage units."
            )
        else:
            progression = "Active Combustion"
            risk_profile = "Contained Process Incident"
            desc = (
                f"Moderate industrial thermal signature ({frp:.1f} MW). Perimeter containment and "
                "foam deluge deployment recommended until complete heat dissipation."
            )
    elif "wildfire" in cat.lower():
        if "forest" in lc or "dense" in lc:
            progression = "Active Canopy Spread Potential"
            risk_profile = "High Spread Risk"
            desc = (
                "Thermal anomaly located in dense canopy cover. High fuel availability and elevated FRP "
                "suggest active spread risk along wind corridors until containment lines are established."
            )
        else:
            progression = "Open Terrain Fire"
            risk_profile = "Moderate Spread Risk"
            desc = (
                "Surface vegetation fire in open terrain. Spread dynamics are subject to local wind shifts "
                "and afternoon dryness thresholds."
            )
    elif "agricultural" in cat.lower():
        progression = "Crop Residue Burn-out"
        risk_profile = "Self-Limiting"
        desc = (
            "Seasonal crop biomass burn with typical localized duration of 4–8 hours. Natural extinguishment "
            "expected as field residue is consumed."
        )
    elif "mining" in cat.lower():
        progression = "Localized Excavation / Blasting Heat"
        risk_profile = "Confined to Quarry Bounds"
        desc = (
            "Thermal emission confined to mining/quarry concession boundaries. Minimal lateral propagation risk."
        )
    else:
        progression = "Undetermined Thermal Dynamics"
        risk_profile = "Monitoring Priority"
        desc = (
            f"FRP of {frp:.1f} MW detected. Qualitative risk assessment indicates need for follow-up satellite confirmation."
        )

    return {
        "progression": progression,
        "risk_profile": risk_profile,
        "frp_trend_pct": frp_trend,
        "description": desc,
    }


def get_surrounding_exposure(event: dict[str, Any]) -> dict[str, Any]:
    """3. Surrounding exposure context: population density + nearby hospitals & fire stations."""
    p = event.get("properties") or event
    lat = float(p.get("lat") or p.get("latitude") or 0.0)
    lon = float(p.get("lng") or p.get("lon") or p.get("longitude") or 0.0)
    pop_5km = int(p.get("population_5km") or p.get("population") or 4500)

    # Emergency infrastructure lookup
    emerg = get_emergency_infrastructure_context(lat, lon, radius_km=25.0)

    if pop_5km > 25000:
        pop_desc = f"High residential density ({pop_5km:,} population within 5 km buffer); elevated smoke inhalation risk."
        pop_tier = "High Exposure"
    elif pop_5km > 5000:
        pop_desc = f"Moderate surrounding population ({pop_5km:,} residents within 5 km); downwind safety buffer advised."
        pop_tier = "Moderate Exposure"
    else:
        pop_desc = f"Low rural population density ({pop_5km:,} residents within 5 km buffer); low direct residential impact."
        pop_tier = "Low Exposure"

    hosp = emerg.get("nearest_hospital", {})
    fire = emerg.get("nearest_fire_station", {})

    combined_desc = (
        f"{pop_desc} Nearest medical facility: {hosp.get('name', 'Hospital')} ({hosp.get('distance_km', '—')} km). "
        f"Primary fire dispatch: {fire.get('name', 'Fire Dept')} ({fire.get('distance_km', '—')} km)."
    )

    return {
        "population_5km": pop_5km,
        "population_tier": pop_tier,
        "population_description": pop_desc,
        "nearest_hospital": hosp,
        "nearest_fire_station": fire,
        "emergency_summary": emerg.get("summary", ""),
        "description": combined_desc,
    }


def generate_situational_briefing(event: dict[str, Any]) -> dict[str, Any]:
    """4. Synthesizes complete situational briefing combining origin, containment, exposure & Gemini."""
    p = event.get("properties") or event
    origin = estimate_origin(event)
    containment = estimate_containment_progression(event)
    exposure = get_surrounding_exposure(event)

    # Prepare enriched context for Gemini prompt
    osm_ctx = p.get("osm_context") or p.get("industrial_context") or {}
    cop_ctx = p.get("copernicus_context") or {
        "land_cover_type": p.get("land_cover_type") or p.get("land_cover"),
        "ndvi_value": p.get("ndvi_value"),
    }

    rich_context = {
        "category": p.get("category") or (p.get("classification") or {}).get("category"),
        "confidence": p.get("confidence") or (p.get("classification") or {}).get("confidence"),
        "risk_score": p.get("risk_score") or (p.get("classification") or {}).get("risk_score"),
        "firms": {
            "brightness": p.get("brightness") or p.get("brightness_temp"),
            "frp": p.get("frp") or p.get("frp_mw"),
        },
        "osm": osm_ctx,
        "copernicus": cop_ctx,
        "origin_estimate": origin["description"],
        "containment_estimate": containment["description"],
        "surrounding_exposure": exposure["description"],
    }

    # Generate synthesis via Gemini
    ai_text = generate_fire_explanation(rich_context)

    # Fallback to structured reasoning synthesis if Gemini unavailable
    if not ai_text:
        ai_text = (
            f"{origin['description']} {containment['description']} "
            f"{exposure['description']}"
        )

    return {
        "origin": origin,
        "containment": containment,
        "exposure": exposure,
        "situational_briefing": ai_text,
    }
