const configuredApiUrl = (import.meta.env.VITE_THERMOS_API_URL || '').trim();
const API_BASE_URL = configuredApiUrl || (import.meta.env.DEV ? 'http://localhost:8000' : '');
const effectiveApiBase = API_BASE_URL.replace(/\/$/, '');

async function fetchWithFallback(path, options = {}) {
  const res = await fetch(`${effectiveApiBase}${path}`, options);
  if (!res.ok) throw new Error(`Request failed (${res.status})`);
  return res.json();
}

/**
 * Fetch thermal hotspot observations from backend NASA FIRMS endpoint /api/fires
 */
export async function fetchFires(params = {}) {
  const query = new URLSearchParams();
  if (params.bbox) query.set('bbox', params.bbox);
  if (params.day_range) query.set('day_range', String(params.day_range));
  if (params.source) query.set('source', params.source);
  if (params.limit) query.set('limit', String(params.limit));

  const url = `${effectiveApiBase}/api/fires${query.toString() ? `?${query.toString()}` : ''}`;
  console.info('[api] Fetching live FIRMS data from:', url);
  const response = await fetch(url);
  if (!response.ok) {
    if (response.status === 404) {
      return fetchAnomalies();
    }
    throw new Error(`Fires request failed (${response.status})`);
  }
  const data = await response.json();
  console.info('[api] FIRMS response received. Mode:', data.data_mode, '| Count:', data.count ?? data.features?.length);
  return data;
}

export async function fetchAnomalies() {
  try {
    const response = await fetch(`${effectiveApiBase}/api/anomalies`);
    if (!response.ok) throw new Error(`Anomalies request failed (${response.status})`);
    return await response.json();
  } catch (err) {
    console.error('Anomalies fetch failed:', err);
    return { type: 'FeatureCollection', features: [] };
  }
}

export async function fetchStats() {
  try {
    const response = await fetch(`${effectiveApiBase}/api/stats`);
    if (!response.ok) throw new Error(`Stats request failed (${response.status})`);
    return await response.json();
  } catch (err) {
    console.warn('Stats fetch failed, returning default:', err);
    return { total: 0, by_class: {}, by_risk: {}, high_risk: 0, critical: 0, avg_frp: 0 };
  }
}

/**
 * Standalone AI RAG Copilot endpoint (/api/ai/chat with /api/rag/chat fallback)
 */
export async function askThermosCopilot(query, anomalyId = null, eventProps = null) {
  const lat = eventProps?.lat ?? eventProps?.latitude ?? null;
  const lng = eventProps?.lng ?? eventProps?.longitude ?? null;
  const facilityId = eventProps?.facility_id ?? null;
  try {
    const data = await fetchWithFallback('/api/ai/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ query, facility_id: facilityId, latitude: lat, longitude: lng }),
    });
    if (data && data.answer) return data;
  } catch (_) {
    // Fallback to /api/rag/chat
  }
  try {
    const ragData = await fetchWithFallback('/api/rag/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ query, anomaly_id: anomalyId, facility_id: facilityId }),
    });
    if (ragData && ragData.answer) return ragData;
  } catch (_) {
    // Fallback to null
  }
  return null;
}

/**
 * Standalone End-to-End 14-Feature XGBoost + RAG Analysis endpoint (/api/ai/analyze)
 */
export async function analyzeHotspotAI(payload) {
  return fetchWithFallback('/api/ai/analyze', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
}

/**
 * Predict classification, risk, and explainability for any coordinate location
 */
export async function predictLocation({ latitude, longitude, brightness_k, frp_mw, confidence, daynight }) {
  const body = {
    latitude: Number(latitude),
    longitude: Number(longitude),
    ...(brightness_k != null ? { brightness_k: Number(brightness_k) } : {}),
    ...(frp_mw != null ? { frp_mw: Number(frp_mw) } : {}),
    ...(confidence != null ? { confidence } : {}),
    ...(daynight != null ? { daynight } : {}),
  };

  const headers = { 'Content-Type': 'application/json' };
  headers['X-User-Role'] = import.meta.env.DEV ? 'Admin' : 'Analyst';

  const url = `${effectiveApiBase}/api/predict`;
  const response = await fetch(url, {
    method: 'POST',
    headers,
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const errText = await response.text();
    let errData;
    try {
      errData = JSON.parse(errText);
    } catch {
      errData = { message: errText };
    }
    throw new Error(errData.detail || errData.message || `Prediction request failed (${response.status})`);
  }

  return response.json();
}

/**
 * Strictly validate and parse coordinates as numbers and normalize properties
 */
export function normalizeAnomaly(feature) {
  const properties = feature.properties || {};

  let rawLng = feature.geometry?.coordinates?.[0];
  let rawLat = feature.geometry?.coordinates?.[1];

  if (rawLng == null || isNaN(Number(rawLng))) rawLng = properties.longitude ?? properties.lng ?? 0;
  if (rawLat == null || isNaN(Number(rawLat))) rawLat = properties.latitude ?? properties.lat ?? 0;

  const lng = Number(rawLng);
  const lat = Number(rawLat);

  const classification = properties.category || (typeof properties.classification === 'string' ? properties.classification : properties.classification?.category) || 'Unknown';
  const rawRiskLevel = properties.risk_level || (properties.risk_score >= 80 ? 'CRITICAL' : properties.risk_score >= 60 ? 'HIGH' : properties.risk_score >= 35 ? 'MODERATE' : 'LOW');
  const riskTier = properties.risk_tier || (rawRiskLevel.charAt(0).toUpperCase() + rawRiskLevel.slice(1).toLowerCase());
  const riskScore = properties.risk_score != null ? Math.round(Number(properties.risk_score)) : Math.round(Number(properties.confidence || 50));

  const firstDetected = properties.first_detected || (properties.acq_date
    ? `${properties.acq_date}T${String(properties.acq_time || '0000').padStart(4, '0').slice(0, 2)}:${String(properties.acq_time || '0000').slice(-2)}:00Z`
    : new Date().toISOString());

  const fid = feature.id || properties.id || properties.anomaly_id || `HOTSPOT-${Math.round(lat * 100)}-${Math.round(lng * 100)}`;

  return {
    type: 'Feature',
    id: fid,
    geometry: {
      type: 'Point',
      coordinates: [lng, lat],
    },
    properties: {
      ...properties,
      id: fid,
      anomaly_id: fid,
      category: classification,
      classification,
      risk_tier: riskTier,
      risk_level: rawRiskLevel.toUpperCase(),
      risk_score: riskScore,
      region: properties.region || properties.facility_name || `${lat.toFixed(3)}°N, ${lng.toFixed(3)}°E`,
      lat,
      lng,
      latitude: lat,
      longitude: lng,
      persistence_hours: Number(properties.persistence_hours || properties.persistence_hours_7d || 6),
      first_detected: firstDetected,
      frp: Number(properties.frp || properties.frp_mw || 15),
      brightness_temp: Number(properties.brightness_temp || properties.brightness_k || properties.brightness || 330),
      confidence: Number(properties.confidence || 75),
      evidence: properties.evidence || [],
    },
  };
}

/**
 * Fetch live events from /api/fires (NASA FIRMS Live Pipeline)
 */
export async function fetchLiveEvents() {
  const data = await fetchFires();
  const rawFeatures = data.features || (Array.isArray(data.fires) ? data.fires.map((f) => ({
    type: 'Feature',
    id: f.id,
    geometry: { type: 'Point', coordinates: [Number(f.longitude), Number(f.latitude)] },
    properties: f,
  })) : []);

  const source = data.data_mode === 'demo' ? 'demo' : 'live';
  return {
    type: 'FeatureCollection',
    metadata: {
      source,
      count: rawFeatures.length,
      data_mode: data.data_mode || 'live',
      message: data.message,
    },
    features: rawFeatures.map(normalizeAnomaly),
  };
}

/**
 * Fetch a real Gemini AI explanation for an active fire hotspot
 */
export async function explainFireEvent(eventProps) {
  if (!eventProps) return null;
  const p = eventProps.properties || eventProps;
  const payload = {
    event_id: p.id || p.anomaly_id,
    category: p.category || (typeof p.classification === 'string' ? p.classification : p.classification?.category),
    confidence: p.confidence,
    risk_score: p.risk_score,
    brightness: p.brightness_temp || p.brightness || p.brightness_k,
    frp: p.frp || p.frp_mw,
    latitude: p.lat || p.latitude,
    longitude: p.lng || p.longitude,
    osm: p.osm_context || p.industrial_context || {
      is_industrial: p.is_industrial,
      nearest_industrial_distance_m: p.nearest_industrial_distance_m,
      relevant_tags: p.relevant_tags || p.matched_tags,
    },
    copernicus: p.copernicus_context || {
      land_cover_type: p.land_cover_type || p.land_cover,
      ndvi_value: p.ndvi_value,
    },
    context: {
      persistence_hours: p.persistence_hours || 6.0,
      observation_count: p.observation_count || 1,
      first_detected: p.first_detected || p.acquired_at,
      population_5km: p.population_5km,
    },
  };

  try {
    const res = await fetch(`${effectiveApiBase}/api/events/explain`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    if (res.ok) {
      const data = await res.json();
      return data;
    }
  } catch (err) {
    console.warn('[api] Failed to fetch explanation from /api/events/explain:', err);
  }
  return null;
}

/**
 * Ask a custom question or submit an inquiry to the AI Investigator / RAG Disaster Copilot
 * Calls /api/ai/chat -> /api/events/{id}/ask -> /api/investigator/ask
 */
export async function askEventQuestion({ eventId, question, context = {} }) {
  const copilotRes = await askThermosCopilot(question, eventId, context);
  if (copilotRes && copilotRes.answer) {
    return copilotRes;
  }

  const payload = {
    event_id: eventId,
    question: (question || '').trim(),
    context,
  };

  const primaryUrl = `${effectiveApiBase}/api/events/${encodeURIComponent(eventId)}/ask`;
  const fallbackUrl = `${effectiveApiBase}/api/investigator/ask`;

  try {
    const res = await fetch(primaryUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-User-Role': import.meta.env.DEV ? 'Admin' : 'Analyst',
      },
      body: JSON.stringify(payload),
    });
    if (res.ok) return await res.json();
  } catch (_) {
    // Try next endpoint
  }

  try {
    const fbRes = await fetch(fallbackUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-User-Role': import.meta.env.DEV ? 'Admin' : 'Analyst',
      },
      body: JSON.stringify(payload),
    });
    if (fbRes.ok) return await fbRes.json();
  } catch (_) {
    // Fallback
  }

  return null;
}

export { API_BASE_URL };
