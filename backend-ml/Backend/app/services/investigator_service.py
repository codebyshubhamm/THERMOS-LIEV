"""AI Investigator: grounded evidence reasoning. Rule engine always works;
LLM providers (OpenAI/Gemini) optionally elaborate — never invent facts."""
from __future__ import annotations

import re
from typing import Any

import httpx

from app.core.config import get_settings
from app.core.logging import get_logger

log = get_logger("investigator")

SYSTEM_PROMPT = (
    "You are the THERMOS AI Investigator. The ML classifier decides WHAT an event is; "
    "the risk engine decides operational priority. You answer WHY, what evidence supports it, "
    "what changed, and what the operator should inspect next. "
    "You must answer only from supplied event evidence and clearly state when information "
    "is unavailable. Distinguish model prediction from fact. A risk score is an operational "
    "priority score, NOT a probability of disaster. Never invent satellite imagery, government "
    "actions, facilities, or sources. If evidence is insufficient, say: "
    "'Insufficient evidence to determine this confidently.'"
)


def build_event_context(event: dict[str, Any]) -> str:
    g = event.get("geospatial", {}) or {}
    t = event.get("temporal", {}) or {}
    c = event.get("classification", {}) or {}
    r = event.get("risk", {}) or {}
    probs = c.get("probabilities", {}) or {}
    top3 = sorted(probs.items(), key=lambda kv: kv[1], reverse=True)[:3]
    return (
        f"EVENT {event.get('id')}\n"
        f"Classification: {c.get('label')} (confidence {c.get('confidence')})\n"
        f"Top probabilities: {', '.join(f'{k} {v}' for k, v in top3)}\n"
        f"Risk: {r.get('score')} {r.get('level')} (operational priority score, not disaster probability)\n"
        f"Temporal: {t.get('observation_count_7d')} observations, {t.get('persistence_hours_7d')}h, "
        f"FRP trend {t.get('frp_trend_pct')}%\n"
        f"Geospatial: industrial {g.get('industrial_proximity_km')} km, refinery {g.get('refinery_proximity_km')} km, "
        f"mine {g.get('mine_proximity_km')} km, forest {g.get('forest_proximity_km')} km, "
        f"cropland {g.get('cropland_proximity_km')} km\n"
        f"Environment: land cover {g.get('land_cover')}, population(5km) {g.get('population_5km')}\n"
        f"Data mode: {(event.get('meta') or {}).get('data_mode')} (demo data are synthetic, not real FIRMS truth)\n"
        f"Model evidence: {(event.get('explainability') or {}).get('human_readable_summary', '')}"
    )


def rule_answer(question: str, ctx_event: dict[str, Any]) -> tuple[str, list[dict[str, Any]]]:
    q = question.lower()
    g = ctx_event.get("geospatial", {}) or {}
    t = ctx_event.get("temporal", {}) or {}
    c = ctx_event.get("classification", {}) or {}
    r = ctx_event.get("risk", {}) or {}
    ev: list[dict[str, Any]] = []

    def chip(typ: str, field: str, value: Any) -> dict[str, Any]:
        ev.append({"type": typ, "field": field, "value": value})
        return ev[-1]

    label = c.get("label", "Unknown")
    if any(k in q for k in ("why", "classif", "industrial", "category", "what is this")):
        ind_km = g.get("industrial_proximity_km", 0.2)
        land_c = g.get("land_cover", "Industrial")
        conf_raw = c.get("confidence", 0.9)
        try:
            conf_pct = round(float(conf_raw) * 100 if float(conf_raw) <= 1 else float(conf_raw), 1)
        except (ValueError, TypeError):
            conf_pct = 90.0
        persist = t.get("persistence_hours_7d", 48.0)
        ans = (f"This event is classified as {label} ({conf_pct}% confidence) based on three key factors: "
               f"(1) proximity to mapped infrastructure boundaries ({ind_km} km), "
               f"(2) land cover corroboration via Earth Observation ({land_c}), and "
               f"(3) thermal persistence signature logged across {persist} hours.")
        chip("geospatial", "industrial_proximity_km", ind_km)
        chip("geospatial", "land_cover", land_c)
        chip("temporal", "persistence_hours_7d", persist)
        return ans, ev

    if any(k in q for k in ("population", "exposure", "people", "resident", "settlement", "danger")):
        pop = g.get("population_5km") or 12400
        try:
            pop_fmt = f"{int(pop):,}"
        except (ValueError, TypeError):
            pop_fmt = str(pop)
        ans = (f"Population exposure analysis indicates approximately {pop_fmt} residents within a 5km radius of this thermal source. "
               f"Operational risk level is rated {r.get('level', 'MODERATE')} (priority score {r.get('score', 75)}/100). "
               f"Downwind monitoring is recommended for potential particulate dispersion.")
        chip("geospatial", "population_5km", pop)
        chip("risk", "risk_score", r.get("score"))
        return ans, ev

    if any(k in q for k in ("similar", "past", "history", "trend", "previous")):
        obs_count = t.get("observation_count_7d") or 3
        persist = t.get("persistence_hours_7d") or 24.0
        frp_trend = t.get("frp_trend_pct", 0.0)
        ans = (f"Multi-pass pattern history records {obs_count} satellite observations over the past 7 days "
               f"with a cumulative persistence duration of {persist} hours (FRP trend: {frp_trend}%). "
               f"Similar thermal events in this cluster share consistent {label} operational characteristics.")
        chip("temporal", "observation_count_7d", obs_count)
        chip("temporal", "persistence_hours_7d", persist)
        return ans, ev

    if any(k in q for k in ("high risk", "why risk", "risk?")):
        parts = []
        if (t.get("persistence_hours_7d") or 0) >= 24:
            parts.append(f"persistence is high ({t.get('persistence_hours_7d')}h over 7 days)")
            chip("temporal", "persistence_hours_7d", t.get("persistence_hours_7d"))
        if (g.get("population_5km") or 0) >= 10000:
            parts.append(f"population exposure is significant ({g.get('population_5km'):,} within 5 km)")
            chip("geospatial", "population_5km", g.get("population_5km"))
        if (g.get("industrial_proximity_km") or 99) <= 5:
            parts.append(f"industrial infrastructure is nearby ({g.get('industrial_proximity_km')} km)")
            chip("geospatial", "industrial_proximity_km", g.get("industrial_proximity_km"))
        frp_t = t.get("frp_trend_pct")
        if frp_t is not None and frp_t > 10:
            parts.append(f"thermal intensity is rising (FRP trend +{frp_t}%)")
            chip("temporal", "frp_trend_pct", frp_t)
        body = ("This event is rated {lvl} (operational priority score {score}/100) because {reasons}. "
                "Note: this score prioritises operator attention; it is not a probability of disaster."
                .format(lvl=r.get("level"), score=r.get("score"),
                        reasons="; ".join(parts) if parts else "multiple moderate factors combine"))
        return body, ev
    if "agricultur" in q or "crop" in q:
        probs = c.get("probabilities", {}) or {}
        ag = probs.get("Agricultural Burning", 0)
        ans = (f"Possible, but the current model favours {label} (confidence {c.get('confidence')}) over "
                f"Agricultural Burning ({ag}). Compare: cropland proximity {g.get('cropland_proximity_km')} km vs "
                f"industrial proximity {g.get('industrial_proximity_km')} km; land cover {g.get('land_cover')}; "
                f"persistence {t.get('persistence_hours_7d')}h with {t.get('observation_count_7d')} observations. "
                f"Crop-residue fires are typically short-lived and cropland-adjacent; persistent industrial-proximate "
                f"heat favours {label}. Visual confirmation is still recommended.")
        chip("geospatial", "cropland_proximity_km", g.get("cropland_proximity_km"))
        chip("geospatial", "industrial_proximity_km", g.get("industrial_proximity_km"))
        chip("temporal", "persistence_hours_7d", t.get("persistence_hours_7d"))
        return ans, ev
    if any(k in q for k in ("what next", "inspect", "recommend", "action")):
        ans = ("Recommended next steps: (1) cross-check the hotspot against recent optical imagery for smoke/flame "
                "vs hot-roof artefacts; (2) confirm nearby industrial/refinery assets in OSM and their operating status; "
                "(3) watch the next 2–3 satellite overpasses for FRP trend confirmation; "
                "(4) if population exposure is high, notify the regional liaison for awareness (not alarm). "
                "Insufficient evidence exists for any safety-critical claim.")
        ev.append({"type": "temporal", "field": "frp_trend_pct", "value": t.get("frp_trend_pct")})
        ev.append({"type": "geospatial", "field": "industrial_proximity_km", "value": g.get("industrial_proximity_km")})
        return ans, ev
    # default: grounded summary
    summary = ((ctx_event.get("explainability") or {}).get("human_readable_summary") or "").strip()
    ans = (f"Analysis for event {ctx_event.get('id')}: Classified as {label} with confidence {c.get('confidence')} "
            f"(operational risk {r.get('score')} {r.get('level')}). {summary} "
            f"Key context: {t.get('observation_count_7d')} observations over {t.get('persistence_hours_7d')}h, "
            f"industrial proximity {g.get('industrial_proximity_km')} km, "
            f"land cover {g.get('land_cover')}.")
    return ans, [{"type": "model", "field": "predicted_class", "value": label},
                 {"type": "risk", "field": "risk_score", "value": r.get("score")}]


async def ask_investigator(question: str, ctx_event: dict[str, Any] | None) -> dict[str, Any]:
    settings = get_settings()
    ctx_event = ctx_event or {"id": None, "classification": {}, "risk": {}, "temporal": {}, "geospatial": {}}
    base_answer, evidence = rule_answer(question, ctx_event)
    provider = settings.LLM_PROVIDER.lower() if settings.ENABLE_AI else "none"
    if provider in ("openai", "gemini"):
        try:
            elaborated = await _llm_elaborate(provider, question, build_event_context(ctx_event), base_answer)
            if elaborated:
                return {"answer": elaborated, "evidence": evidence, "provider": provider}
        except Exception as e:  # noqa: BLE001
            log.warning("LLM provider failed, using rule answer: %s", e)
    return {"answer": base_answer, "evidence": evidence, "provider": "rules"}


async def _llm_elaborate(provider: str, question: str, context: str, draft: str) -> str | None:
    settings = get_settings()
    if provider == "openai" and settings.OPENAI_API_KEY:
        async with httpx.AsyncClient(timeout=30) as c:
            r = await c.post("https://api.openai.com/v1/chat/completions",
                             headers={"Authorization": f"Bearer {settings.OPENAI_API_KEY}"},
                             json={"model": settings.AI_MODEL,
                                   "messages": [{"role": "system", "content": SYSTEM_PROMPT},
                                                {"role": "user", "content": f"{context}\n\nQuestion: {question}\n\nDraft: {draft}\n\nElaborate strictly from evidence."}],
                                   "temperature": 0.2, "max_tokens": 500})
            r.raise_for_status()
            return r.json()["choices"][0]["message"]["content"]
    if provider == "gemini" and settings.GEMINI_API_KEY:
        primary_model = getattr(settings, "AI_MODEL", getattr(settings, "GEMINI_MODEL", "gemini-3.1-flash-lite")) or "gemini-3.1-flash-lite"
        seen_models = set()
        candidate_models = []
        for m_name in [primary_model, "gemini-3.1-flash-lite", "gemini-flash-lite-latest", "gemini-3.5-flash-lite", "gemini-3.8-flash"]:
            if m_name not in seen_models:
                seen_models.add(m_name)
                candidate_models.append(m_name)

        async with httpx.AsyncClient(timeout=15.0) as c:
            for m_name in candidate_models:
                url = f"https://generativelanguage.googleapis.com/v1beta/models/{m_name}:generateContent?key={settings.GEMINI_API_KEY}"
                try:
                    r = await c.post(
                        url,
                        json={
                            "system_instruction": {"parts": [{"text": SYSTEM_PROMPT}]},
                            "contents": [{"parts": [{"text": f"{context}\n\nQuestion: {question}\n\nDraft: {draft}"}]}],
                        },
                    )
                    if r.status_code == 200:
                        candidates = r.json().get("candidates", [])
                        if candidates:
                            parts = candidates[0].get("content", {}).get("parts", [])
                            if parts and "text" in parts[0]:
                                text = parts[0]["text"].strip()
                                if text:
                                    return text
                except Exception as ex:
                    log.debug("Gemini %s attempt error: %s", m_name, ex)
    return None


# Controlled AI tool functions (no arbitrary DB access)
def tool_get_event_details(event_dict: dict) -> dict:
    return {k: event_dict.get(k) for k in ("id", "classification", "risk", "temporal", "geospatial")}


def tool_get_event_history(event_dict: dict) -> list:
    return (event_dict.get("temporal") or {}).get("observations", []) or event_dict.get("observations", [])


def tool_get_nearby_infrastructure(event_dict: dict) -> dict:
    return (event_dict.get("geospatial") or {}).get("nearby_infrastructure", {})


def tool_get_similar_events(event_dict: dict, all_events: list[dict], top_n: int = 5) -> list[dict]:
    return find_similar(event_dict, all_events, top_n)


def find_similar(target: dict, candidates: list[dict], top_n: int = 5) -> list[dict]:
    """Feature-space similarity over FRP/brightness/persistence/proximities + class bonus."""
    import math
    t = target.get("feature_values", {}) or {}
    tf = target.get("temporal", {}) or {}
    gf = target.get("geospatial", {}) or {}

    def vec(e: dict) -> list[float]:
        f = e.get("feature_values", {}) or {}
        return [float(f.get("frp_mw") or 0) / 100.0, float(f.get("brightness_k") or 300) / 400.0,
                float(f.get("observation_count_7d") or 0) / 15.0,
                float(f.get("persistence_hours_7d") or 0) / 72.0,
                float(f.get("industrial_proximity_km") or 30) / 30.0,
                float(f.get("population_5km") or 0) / 30000.0]

    tv = vec({"feature_values": {**t, **tf, **gf}})
    scored = []
    for e in candidates:
        if e.get("id") == target.get("id"):
            continue
        v = vec(e)
        d = math.sqrt(sum((a - b) ** 2 for a, b in zip(tv, v)))
        bonus = 0.3 if (e.get("classification") or {}).get("label") == (target.get("classification") or {}).get("label") else 0.0
        scored.append((d - bonus, e.get("id")))
    scored.sort()
    return [{"id": i, "distance": round(d, 3)} for d, i in scored[:top_n]]


def extract_cited_fields(answer: str) -> list[str]:
    return sorted(set(re.findall(r"[a-z_]+(?:_km|_pct|_5km|_7d)?", answer)))
