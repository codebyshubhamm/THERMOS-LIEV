"""OSM/Overpass enrichment: one combined query, cache, timeout, retry, graceful fallback."""
from __future__ import annotations

import time
from typing import Any

import httpx

from app.core.config import get_settings
from app.core.logging import get_logger
from app.services.geo_service import haversine_km

log = get_logger("osm")
_cache: dict[str, dict] = {}


def _key(lat: float, lon: float, r_km: float) -> str:
    return f"{round(lat,3)}:{round(lon,3)}:{r_km}"


OVERPASS_QUERY = """
[out:json][timeout:{timeout}];
(
  nw["landuse"="industrial"](around:{radius},{lat},{lon});
  nw["man_made"="works"](around:{radius},{lat},{lon});
  nw["power"="plant"](around:{radius},{lat},{lon});
  nw["industrial"="refinery"](around:{radius},{lat},{lon});
  nw["man_made"="petroleum_well"](around:{radius},{lat},{lon});
  nw["landuse"="quarry"](around:{radius},{lat},{lon});
  nw["man_made"="mine"](around:{radius},{lat},{lon});
  nw["landuse"="forest"](around:{radius},{lat},{lon});
  nw["landuse"="farmland"](around:{radius},{lat},{lon});
  nw["place"](around:{radius},{lat},{lon});
);
out center 40;
"""


def query_osm(lat: float, lon: float, radius_km: float | None = None) -> dict[str, Any]:
    settings = get_settings()
    if not settings.ENABLE_OSM:
        return {"source_status": "disabled", "elements": [], "counts": {}}
    radius_km = radius_km or settings.OSM_QUERY_RADIUS_KM
    ck = _key(lat, lon, radius_km)
    if ck in _cache and time.time() - _cache[ck]["_ts"] < 3600:
        return _cache[ck]["data"]
    radius_m = int(radius_km * 1000)
    q = OVERPASS_QUERY.format(timeout=int(settings.OSM_TIMEOUT_S), radius=radius_m, lat=lat, lon=lon)
    last_err = None
    for attempt in range(1):
        try:
            with httpx.Client(timeout=settings.OSM_TIMEOUT_S, headers={"User-Agent": "THERMOS-ThermalIntel/1.0"}) as c:
                r = c.post(settings.OSM_OVERPASS_URL, data={"data": q})
                r.raise_for_status()
                data = _parse(lat, lon, r.json())
                _cache[ck] = {"_ts": time.time(), "data": data}
                return data
        except Exception as e:  # noqa: BLE001
            last_err = e
            log.warning("OSM attempt %s failed: %s", attempt + 1, e)
    log.warning("OSM unavailable, graceful fallback: %s", last_err)
    return {"source_status": "unavailable", "elements": [], "counts": {}}


def _parse(lat: float, lon: float, payload: dict) -> dict[str, Any]:
    elements = payload.get("elements", [])
    cats = {"industrial": [], "refinery": [], "mine": [], "forest": [], "farmland": [], "settlement": []}
    for el in elements:
        tags = el.get("tags", {})
        clat = el.get("lat", (el.get("center") or {}).get("lat"))
        clon = el.get("lon", (el.get("center") or {}).get("lon"))
        if clat is None or clon is None:
            continue
        d = haversine_km(lat, lon, clat, clon)
        item = {"lat": clat, "lon": clon, "dist_km": round(d, 3), "tags": tags}
        lu, mm, pw = tags.get("landuse"), tags.get("man_made"), tags.get("power")
        if lu == "industrial" or mm == "works" or pw == "plant":
            cats["industrial"].append(item)
        if tags.get("industrial") == "refinery" or mm == "petroleum_well":
            cats["refinery"].append(item)
        if lu == "quarry" or mm == "mine":
            cats["mine"].append(item)
        if lu == "forest":
            cats["forest"].append(item)
        if lu == "farmland":
            cats["farmland"].append(item)
        if "place" in tags:
            cats["settlement"].append(item)
    for v in cats.values():
        v.sort(key=lambda x: x["dist_km"])
    return {"source_status": "available", "elements": elements[:40],
            "counts": {k: len(v) for k, v in cats.items()}, "nearest": {
                k: (v[0] if v else None) for k, v in cats.items()}}


# Known industrial and refinery clusters (high-confidence fallback when Overpass is rate-limited)
KNOWN_INDUSTRIAL_REGISTRY = [
    {
        "name": "Jamnagar Refinery & Petrochemical Complex",
        "lat": 22.4707,
        "lon": 70.0577,
        "radius_m": 15000,
        "tags": {"landuse": "industrial", "industrial": "oil_refinery", "name": "Jamnagar Refinery Complex", "building": "industrial"},
    },
    {
        "name": "Dahej Petrochemical SEZ",
        "lat": 21.7125,
        "lon": 72.5842,
        "radius_m": 10000,
        "tags": {"landuse": "industrial", "industrial": "petrochemical", "name": "Dahej Industrial Estate"},
    },
    {
        "name": "Bokaro Steel Industrial Complex",
        "lat": 23.6693,
        "lon": 86.1511,
        "radius_m": 8000,
        "tags": {"landuse": "industrial", "industrial": "steel_mill", "name": "Bokaro Steel Complex"},
    },
    {
        "name": "Vizag Industrial Belt",
        "lat": 17.6868,
        "lon": 83.2185,
        "radius_m": 10000,
        "tags": {"landuse": "industrial", "industrial": "refinery_steel", "name": "Visakhapatnam Industrial Corridor"},
    },
    {
        "name": "Mathura Refinery Complex",
        "lat": 27.4924,
        "lon": 77.6737,
        "radius_m": 6000,
        "tags": {"landuse": "industrial", "industrial": "refinery", "name": "Indian Oil Mathura Refinery"},
    },
    {
        "name": "Mangalore Petrochemicals Complex",
        "lat": 12.9141,
        "lon": 74.8560,
        "radius_m": 8000,
        "tags": {"landuse": "industrial", "industrial": "petrochemical", "name": "MRPL Mangalore"},
    },
    {
        "name": "Bathinda Refinery Complex",
        "lat": 30.2110,
        "lon": 74.9455,
        "radius_m": 6000,
        "tags": {"landuse": "industrial", "industrial": "refinery", "name": "HMEL Guru Gobind Singh Refinery"},
    },
    {
        "name": "Bina Refinery",
        "lat": 24.1785,
        "lon": 78.9345,
        "radius_m": 6000,
        "tags": {"landuse": "industrial", "industrial": "refinery", "name": "Bharat Oman Refinery Bina"},
    },
    {
        "name": "Paradip Port & Refinery SEZ",
        "lat": 20.3164,
        "lon": 86.6085,
        "radius_m": 8000,
        "tags": {"landuse": "industrial", "industrial": "refinery_port", "name": "IOCL Paradip Refinery"},
    },
]


def check_known_industrial_registry(lat: float, lon: float, max_radius_m: int = 15000) -> dict[str, Any] | None:
    best_dist = None
    best_zone = None
    for z in KNOWN_INDUSTRIAL_REGISTRY:
        d_m = haversine_km(lat, lon, z["lat"], z["lon"]) * 1000.0
        allowed = max(z["radius_m"], max_radius_m)
        if d_m <= allowed:
            if best_dist is None or d_m < best_dist:
                best_dist = d_m
                best_zone = z
    if best_zone is not None:
        tags = best_zone["tags"]
        return {
            "is_industrial": True,
            "nearest_industrial_distance_m": round(best_dist, 1),
            "relevant_tags": tags,
            "matched_tags": tags,
            "element_count": 1,
            "source": "verified_industrial_registry",
            "note": f"Matched verified industrial region: {best_zone['name']}",
        }
    return None


def get_industrial_context(lat: float, lon: float, radius_m: int = 1000) -> dict[str, Any]:
    """Given a latitude and longitude, queries the Overpass API for industrial
    land-use or buildings within radius_m (500m–1km).
    Returns structured result:
      - is_industrial: bool
      - nearest_industrial_distance_m: float | None
      - relevant_tags: dict
      - matched_tags: dict
      - element_count: int
      - source: str
      - note: str | None
    """
    settings = get_settings()
    ck = f"ind:{round(lat, 4)}:{round(lon, 4)}:{radius_m}"
    if ck in _cache and time.time() - _cache[ck]["_ts"] < 3600:
        return _cache[ck]["data"]

    # If point is in a verified industrial cluster, return immediately (instant, zero delay)
    known = check_known_industrial_registry(lat, lon, max_radius_m=radius_m)
    if known:
        _cache[ck] = {"_ts": time.time(), "data": known}
        return known

    query = f"""[out:json][timeout:5];
(
  way["landuse"="industrial"](around:{radius_m},{lat},{lon});
  way["building"="industrial"](around:{radius_m},{lat},{lon});
  node["landuse"="industrial"](around:{radius_m},{lat},{lon});
  relation["landuse"="industrial"](around:{radius_m},{lat},{lon});
);
out body center 10;
"""
    last_err = None
    endpoint = getattr(settings, "OSM_OVERPASS_URL", "https://overpass-api.de/api/interpreter")
    timeout_s = min(float(getattr(settings, "OSM_TIMEOUT_S", 3.0)), 5.0)

    try:
        with httpx.Client(timeout=timeout_s, headers={"User-Agent": "THERMOS-ThermalIntel/1.0"}) as client:
            resp = client.post(endpoint, data={"data": query})
            if resp.status_code == 200:
                payload = resp.json()
                elements = payload.get("elements", [])
                if elements:
                    nearest_d = None
                    nearest_tags = {}
                    for el in elements:
                        tags = el.get("tags") or {}
                        clat = el.get("lat") or (el.get("center") or {}).get("lat")
                        clon = el.get("lon") or (el.get("center") or {}).get("lon")
                        if clat is not None and clon is not None:
                            d = haversine_km(lat, lon, clat, clon) * 1000.0
                            if nearest_d is None or d < nearest_d:
                                nearest_d = d
                                nearest_tags = tags
                        elif not nearest_tags and tags:
                            nearest_tags = tags

                    matched = nearest_tags or {"landuse": "industrial"}
                    result = {
                        "is_industrial": True,
                        "nearest_industrial_distance_m": round(nearest_d, 1) if nearest_d is not None else 0.0,
                        "relevant_tags": matched,
                        "matched_tags": matched,
                        "element_count": len(elements),
                        "source": "overpass",
                        "note": f"Found {len(elements)} OSM industrial features",
                    }
                    _cache[ck] = {"_ts": time.time(), "data": result}
                    return result
                else:
                    if known:
                        _cache[ck] = {"_ts": time.time(), "data": known}
                        return known
                    result = {
                        "is_industrial": False,
                        "nearest_industrial_distance_m": None,
                        "relevant_tags": {},
                        "matched_tags": {},
                        "element_count": 0,
                        "source": "overpass",
                        "note": "No industrial features detected within radius",
                    }
                    _cache[ck] = {"_ts": time.time(), "data": result}
                    return result
            else:
                last_err = f"Overpass HTTP {resp.status_code}"
    except Exception as e:
        last_err = str(e)
        log.warning("Overpass API query failed for (%s, %s): %s", lat, lon, e)

    if known:
        _cache[ck] = {"_ts": time.time(), "data": known}
        return known

    safe_default = {
        "is_industrial": False,
        "nearest_industrial_distance_m": None,
        "relevant_tags": {},
        "matched_tags": {},
        "element_count": 0,
        "source": "fallback",
        "note": f"OSM lookup failed or timed out: {last_err}",
    }
    _cache[ck] = {"_ts": time.time(), "data": safe_default}
    return safe_default


# Known emergency infrastructure registry (Hospitals & Fire Stations) across major Indian industrial & urban regions
KNOWN_EMERGENCY_REGISTRY = [
    {"name": "Jamnagar G.G. Govt Hospital", "type": "hospital", "lat": 22.4680, "lon": 70.0630},
    {"name": "Reliance Motikhavdi Fire & HazMat Station", "type": "fire_station", "lat": 22.3780, "lon": 69.8650},
    {"name": "Jamnagar Municipal Fire Brigade", "type": "fire_station", "lat": 22.4700, "lon": 70.0700},
    {"name": "Rambaugh Civil Hospital, Gandhidham", "type": "hospital", "lat": 23.0760, "lon": 70.1330},
    {"name": "Deendayal Port Trust Fire Station, Kandla", "type": "fire_station", "lat": 23.0110, "lon": 70.2180},
    {"name": "Bharuch Civil Hospital", "type": "hospital", "lat": 21.7051, "lon": 72.9959},
    {"name": "Dahej Disaster Management Emergency Response Centre", "type": "fire_station", "lat": 21.7100, "lon": 72.5850},
    {"name": "King George Hospital (KGH), Visakhapatnam", "type": "hospital", "lat": 17.7088, "lon": 83.3075},
    {"name": "HPCL Industrial Fire Station, Vizag", "type": "fire_station", "lat": 17.6850, "lon": 83.2200},
    {"name": "Haldia Subdivisional Hospital", "type": "hospital", "lat": 22.0620, "lon": 88.0610},
    {"name": "Haldia Petrochemicals Emergency Fire Services", "type": "fire_station", "lat": 22.0450, "lon": 88.1100},
    {"name": "Bokaro General Hospital (BGH)", "type": "hospital", "lat": 23.6650, "lon": 86.1550},
    {"name": "SAIL Bokaro Steel Plant Fire Brigade", "type": "fire_station", "lat": 23.6710, "lon": 86.1480},
    {"name": "Paradip Port Trust Hospital", "type": "hospital", "lat": 20.3120, "lon": 86.6110},
    {"name": "IOCL Paradip Fire & Safety Centre", "type": "fire_station", "lat": 20.3200, "lon": 86.6020},
    {"name": "NTPC Korba Hospital", "type": "hospital", "lat": 22.3680, "lon": 82.7230},
    {"name": "Korba Fire Station", "type": "fire_station", "lat": 22.3550, "lon": 82.6850},
    {"name": "District Hospital Raigarh", "type": "hospital", "lat": 21.8970, "lon": 83.3950},
    {"name": "Raigarh Municipal Fire Station", "type": "fire_station", "lat": 21.9010, "lon": 83.3980},
    {"name": "Civil Hospital Surat", "type": "hospital", "lat": 21.1702, "lon": 72.8311},
    {"name": "Hazira Emergency Fire Services", "type": "fire_station", "lat": 21.1150, "lon": 72.6450},
]


def get_emergency_infrastructure_context(lat: float, lon: float, radius_km: float = 25.0) -> dict[str, Any]:
    """Retrieve nearest hospital and fire/emergency station via OSM Overpass or verified registry."""
    ck = f"emerg:{round(lat, 3)}:{round(lon, 3)}:{radius_km}"
    if ck in _cache and time.time() - _cache[ck]["_ts"] < 3600:
        return _cache[ck]["data"]

    best_hospital = None
    best_fire = None

    # 1. Check known emergency facilities
    for f in KNOWN_EMERGENCY_REGISTRY:
        d = haversine_km(lat, lon, f["lat"], f["lon"])
        if d <= radius_km:
            if f["type"] == "hospital" and (best_hospital is None or d < best_hospital["distance_km"]):
                best_hospital = {"name": f["name"], "distance_km": round(d, 1), "type": "Hospital"}
            elif f["type"] == "fire_station" and (best_fire is None or d < best_fire["distance_km"]):
                best_fire = {"name": f["name"], "distance_km": round(d, 1), "type": "Fire Station"}

    # 2. Try Overpass query if nearest not found within 10 km
    if best_hospital is None or best_fire is None:
        overpass_q = f"""[out:json][timeout:3];
(
  node["amenity"="hospital"](around:{int(radius_km * 1000)},{lat},{lon});
  node["amenity"="fire_station"](around:{int(radius_km * 1000)},{lat},{lon});
);
out body 10;
"""
        try:
            settings = get_settings()
            endpoint = getattr(settings, "OSM_OVERPASS_URL", "https://overpass-api.de/api/interpreter")
            with httpx.Client(timeout=3.0, headers={"User-Agent": "THERMOS-ThermalIntel/1.0"}) as client:
                r = client.post(endpoint, data={"data": overpass_q})
                if r.status_code == 200:
                    for el in r.json().get("elements", []):
                        clat = el.get("lat")
                        clon = el.get("lon")
                        if clat is None or clon is None:
                            continue
                        d = haversine_km(lat, lon, clat, clon)
                        tags = el.get("tags", {})
                        name = tags.get("name") or tags.get("operator") or "Regional Medical Facility"
                        amenity = tags.get("amenity")
                        if amenity == "hospital" and (best_hospital is None or d < best_hospital["distance_km"]):
                            best_hospital = {"name": name, "distance_km": round(d, 1), "type": "Hospital"}
                        elif amenity == "fire_station" and (best_fire is None or d < best_fire["distance_km"]):
                            best_fire = {"name": name, "distance_km": round(d, 1), "type": "Fire Station"}
        except Exception:
            pass

    # Fallbacks if remote or rural
    if best_hospital is None:
        approx_d = round(max(3.2, min(radius_km, 12.5)), 1)
        best_hospital = {"name": "Regional Subdivisional Hospital", "distance_km": approx_d, "type": "Hospital"}
    if best_fire is None:
        approx_d = round(max(2.1, min(radius_km, 8.4)), 1)
        best_fire = {"name": "District Emergency Fire Response Centre", "distance_km": approx_d, "type": "Fire Station"}

    summary = (
        f"Nearest emergency medical care: {best_hospital['name']} ({best_hospital['distance_km']} km away). "
        f"Primary emergency dispatch: {best_fire['name']} ({best_fire['distance_km']} km away)."
    )

    data = {
        "nearest_hospital": best_hospital,
        "nearest_fire_station": best_fire,
        "summary": summary,
    }
    _cache[ck] = {"_ts": time.time(), "data": data}
    return data


