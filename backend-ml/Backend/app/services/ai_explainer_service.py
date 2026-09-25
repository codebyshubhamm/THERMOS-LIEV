"""AI Explainer Service powered by Google Gemini (Flash).
Generates concise 2-3 sentence grounded natural-language explanations of fire classifications.
Strictly constrained to provided data; never invents facts or companies.
Fails gracefully to None without crashing callers if API is unavailable.
"""
from __future__ import annotations

import hashlib
import json
import os
import time
from typing import Any

import httpx

from app.core.config import get_settings
from app.core.logging import get_logger

log = get_logger("ai_explainer")

# In-memory explanation cache (keyed by content hash, 1 hour TTL)
_explanation_cache: dict[str, dict[str, Any]] = {}

EXPLAINER_SYSTEM_INSTRUCTION = (
    "You are an AI Earth Observation specialist for the THERMOS satellite monitoring system. "
    "Your task is to generate a concise 2-3 sentence explanation of why a given fire detection "
    "was classified the way it was, using plain, professional language. "
    "You must base your explanation ONLY on the supplied detection, classification, NASA FIRMS, "
    "OpenStreetMap (OSM), and Copernicus Sentinel data. "
    "CRITICAL CONSTRAINTS: "
    "- Do NOT invent or speculate on specific company or facility names unless explicitly present in OSM tags. "
    "- Do NOT invent causes of the fire (e.g. electrical short, arson, equipment failure). "
    "- Do NOT invent casualties, injuries, evacuations, or damage estimates. "
    "- Do NOT invent weather conditions (wind, humidity, rain). "
    "- If indicators are mixed or context is unavailable, state that the classification is based on available indicators rather than claiming certainty."
)


def _get_gemini_api_key() -> str:
    """Retrieve GEMINI_API_KEY from Settings or environment."""
    settings = get_settings()
    key = getattr(settings, "GEMINI_API_KEY", "") or os.environ.get("GEMINI_API_KEY", "")
    return key.strip()


def generate_fire_explanation(context: dict[str, Any]) -> str | None:
    """Generate a 2-3 sentence explanation from Gemini Flash based on classification and context data.
    Input context format:
    {
      "category": "Industrial Fire",
      "confidence": 0.84,
      "risk_score": 47.6,
      "firms": {"brightness": 348.5, "frp": 35.0},
      "osm": {
        "is_industrial": True,
        "nearest_industrial_distance_m": 0.0,
        "relevant_tags": {"landuse": "industrial", "industrial": "oil_refinery"}
      },
      "copernicus": {
        "land_cover_type": "built_up",
        "ndvi_value": 0.18
      }
    }
    Returns string explanation, or None on failure/missing key.
    """
    settings = get_settings()
    log.info("[ai_explainer] generate_fire_explanation called. ENABLE_AI=%s", getattr(settings, "ENABLE_AI", True))
    if not getattr(settings, "ENABLE_AI", True):
        log.info("[ai_explainer] ENABLE_AI is false, returning None")
        return None

    api_key = _get_gemini_api_key()
    log.info("[ai_explainer] GEMINI_API_KEY configured: %s (length: %d)", bool(api_key), len(api_key) if api_key else 0)
    if not api_key:
        log.info("[ai_explainer] GEMINI_API_KEY not configured; skipping AI explanation.")
        return None

    # Generate a deterministic cache key from input context
    cache_str = json.dumps(context, sort_keys=True, default=str)
    cache_hash = hashlib.md5(cache_str.encode()).hexdigest()
    now = time.time()
    if cache_hash in _explanation_cache and now - _explanation_cache[cache_hash]["_ts"] < 3600:
        log.info("[ai_explainer] Cache hit for explanation")
        return _explanation_cache[cache_hash]["explanation"]

    # Extract structured fields
    category = (
        context.get("category")
        or (context.get("classification") or {}).get("category")
        or (context.get("classification") or {}).get("label")
        or "Thermal Hotspot"
    )
    confidence = (
        context.get("confidence")
        or (context.get("classification") or {}).get("confidence")
        or "N/A"
    )
    risk_score = (
        context.get("risk_score")
        or (context.get("classification") or {}).get("risk_score")
        or "N/A"
    )
    firms = context.get("firms") or {}
    osm = context.get("osm") or context.get("osm_context") or {}
    copernicus = context.get("copernicus") or context.get("copernicus_context") or {}

    origin_est = context.get("origin_estimate") or (context.get("origin") or {}).get("description")
    containment_est = context.get("containment_estimate") or (context.get("containment") or {}).get("description")
    exposure_est = context.get("surrounding_exposure") or (context.get("exposure") or {}).get("description")

    user_prompt = f"""Generate an authoritative situational briefing (3-4 concise sentences) for emergency operators based ONLY on the evidence below:

Classification:
- Category: {category}
- Confidence: {confidence}
- Operational Risk Score: {risk_score}

NASA FIRMS Satellite Observation:
- Brightness Temperature: {firms.get('brightness', 'N/A')} K
- Fire Radiative Power (FRP): {firms.get('frp', 'N/A')} MW
- Confidence: {firms.get('confidence', 'N/A')}

OpenStreetMap Industrial & Emergency Context:
- Is Industrial Zone: {osm.get('is_industrial', False)}
- Nearest Industrial Distance: {osm.get('nearest_industrial_distance_m', 'None')} m
- Matched Tags: {json.dumps(osm.get('relevant_tags') or osm.get('matched_tags') or {})}
{f"- Origin / Activity History: {origin_est}" if origin_est else ""}
{f"- Containment & Spread Dynamics: {containment_est}" if containment_est else ""}
{f"- Surrounding Exposure & Emergency Infrastructure: {exposure_est}" if exposure_est else ""}

Copernicus Sentinel Context:
- Land Cover Type: {copernicus.get('land_cover_type', 'unavailable')}
- NDVI Vegetation Index: {copernicus.get('ndvi_value', 'unavailable')}
"""

    # Model configuration: default to gemini-3.1-flash-lite (verified active and fast in v1beta API)
    primary_model = getattr(settings, "GEMINI_MODEL", "gemini-3.1-flash-lite") or "gemini-3.1-flash-lite"
    candidate_models = []
    for m in [primary_model, "gemini-3.1-flash-lite", "gemini-flash-lite-latest", "gemini-3.5-flash-lite", "gemini-3.8-flash"]:
        if m and m not in candidate_models:
            candidate_models.append(m)

    request_body = {
        "system_instruction": {
            "parts": [{"text": EXPLAINER_SYSTEM_INSTRUCTION}]
        },
        "contents": [
            {
                "parts": [{"text": user_prompt}]
            }
        ],
        "generationConfig": {
            "temperature": 0.2,
            "maxOutputTokens": 250,
            "topP": 0.8
        }
    }

    with httpx.Client(timeout=15.0) as client:
        for model_name in candidate_models:
            endpoint = f"https://generativelanguage.googleapis.com/v1beta/models/{model_name}:generateContent?key={api_key}"
            log.info("[ai_explainer] Querying Gemini model: %s", model_name)
            try:
                resp = client.post(endpoint, json=request_body)
                log.info("[ai_explainer] Model %s response status: %s", model_name, resp.status_code)
                if resp.status_code == 200:
                    data = resp.json()
                    candidates = data.get("candidates", [])
                    if candidates:
                        parts = candidates[0].get("content", {}).get("parts", [])
                        if parts and "text" in parts[0]:
                            explanation = parts[0]["text"].strip()
                            _explanation_cache[cache_hash] = {"_ts": now, "explanation": explanation}
                            log.info("[ai_explainer] Successfully generated explanation with %s: %s...", model_name, explanation[:100])
                            return explanation
                    log.warning("[ai_explainer] %s returned 200 but no text candidate: %s", model_name, data)
                elif resp.status_code in (404, 429, 503):
                    log.warning("[ai_explainer] %s unavailable (status %s), trying next fallback", model_name, resp.status_code)
                    continue
                else:
                    log.warning("[ai_explainer] %s error (status %s): %s", model_name, resp.status_code, resp.text[:300])
            except Exception as ex:
                log.warning("[ai_explainer] %s exception (%s), trying next fallback", model_name, ex)
                continue

    # Return None on any failure so parent classification request succeeds untouched
    log.info("[ai_explainer] Returning None (explanation generation failed)")
    return None
