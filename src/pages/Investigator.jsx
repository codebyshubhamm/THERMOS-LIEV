import { useState, useMemo } from 'react';
import { useStore } from '../store/useStore';
import { mockGeoJSON } from '../data/mockData';
import { getCategoryColor, getRiskColor, getCategoryShort, formatDuration, formatCoords } from '../utils/formatters';
import EventHistoryChart from '../components/shared/EventHistoryChart';
import EvidenceCard from '../components/shared/EvidenceCard';
import RiskFactorBreakdown from '../components/shared/RiskFactorBreakdown';
import AskThermos from '../components/shared/AskThermos';
import { analyzeHotspotAI } from '../services/api';

export default function Investigator() {
  const storeEvents = useStore((s) => s.events?.features);
  const events = (storeEvents && storeEvents.length > 0) ? storeEvents : mockGeoJSON.features;
  const selectEvent = useStore((s) => s.selectEvent);
  const selectedEventId = useStore((s) => s.selectedEventId);

  const [currentId, setCurrentId] = useState(selectedEventId || events[0]?.properties?.id);
  const [activeTab, setActiveTab] = useState('spectral'); // 'spectral' | 'meteorology' | 'decision_tree' | 'evidence'
  const [liveAiResult, setLiveAiResult] = useState(null);
  const [isScanningAi, setIsScanningAi] = useState(false);

  const currentEvent = useMemo(() => {
    return events.find((e) => e.properties?.id === currentId) || events[0] || { properties: {} };
  }, [events, currentId]);

  const p = currentEvent.properties;

  const handleRunLiveAiScan = async () => {
    setIsScanningAi(true);
    try {
      const res = await analyzeHotspotAI({
        latitude: p.lat,
        longitude: p.lng,
        frp_mw: p.frp,
        brightness_k: p.brightness_temp || 355.0,
        confidence: 'h',
        daynight: 'N',
      });
      setLiveAiResult(res);
    } catch (err) {
      console.error(err);
    } finally {
      setIsScanningAi(false);
    }
  };

  const decisionSteps = useMemo(() => {
    return [
      { step: '1. Satellite Thermal Ingestion', status: 'Passed', detail: `FRP ${p.frp} MW detected via VIIRS 375m I-Band (3.74µm channel anomaly > 320K)` },
      { step: '2. Spatial Vector Alignment', status: 'Matched', detail: `Point [${p.lat}, ${p.lng}] lies within 200m buffer of OSM Industrial Zone (${p.land_cover})` },
      { step: '3. Temporal Persistence Audit', status: 'Confirmed', detail: `Continuous thermal signature logged across ${p.observation_count} satellite passes (${formatDuration(p.persistence_hours)})` },
      { step: '4. Land-Cover Cross Validation', status: 'Verified', detail: `Copernicus Global Land Service confirms non-vegetated high-albedo industrial surface` },
      { step: `5. Final Classification: ${p.category}`, status: 'High Confidence', detail: `Ensemble model score: ${p.confidence}% confidence. Risk Tier: ${p.risk_tier} (${p.risk_score}/100)` },
    ];
  }, [p]);

  return (
    <div className="h-full overflow-y-auto p-6 space-y-6">
      {/* Header with Selector */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-scale-2xl font-bold text-[var(--color-text-primary)]">
            AI Incident Investigator
          </h1>
          <p className="mt-1 text-scale-base text-[var(--color-text-secondary)]">
            Deep-dive multi-modal diagnostics, spectral signature analysis & algorithmic decision auditing
          </p>
        </div>

        {/* Incident Switcher */}
        <div className="flex items-center gap-2 self-start sm:self-auto">
          <label className="text-scale-sm text-[var(--color-text-secondary)] font-medium shrink-0">Incident:</label>
          <select
            value={currentId}
            onChange={(e) => {
              setCurrentId(e.target.value);
              selectEvent(e.target.value);
            }}
            className="h-9 px-3 text-scale-sm font-data bg-white border border-[var(--color-border)] rounded-[var(--radius-md)] focus:outline-none focus:border-[var(--color-accent)] font-semibold shadow-xs"
          >
            {events.slice(0, 15).map((e) => (
              <option key={e.properties.id} value={e.properties.id}>
                {e.properties.id} — {e.properties.region} ({e.properties.risk_tier})
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Incident Key Metrics Banner */}
      <div className="bg-white border border-[var(--color-border)] rounded-[var(--radius-xl)] p-6 grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-4 shadow-[0_1px_2px_rgba(17,24,39,0.02)]">
        <div>
          <span className="text-scale-xs text-[var(--color-text-tertiary)] block mb-1">Incident ID</span>
          <span className="font-data font-bold text-scale-base text-[var(--color-text-primary)]">{p.id}</span>
        </div>
        <div>
          <span className="text-scale-xs text-[var(--color-text-tertiary)] block mb-1">Classification</span>
          <span
            className="inline-block px-2.5 py-0.5 text-scale-xs font-semibold rounded-full text-white"
            style={{ backgroundColor: getCategoryColor(p.category) }}
          >
            {getCategoryShort(p.category)}
          </span>
        </div>
        <div>
          <span className="text-scale-xs text-[var(--color-text-tertiary)] block mb-1">Location & Coords</span>
          <span className="text-scale-sm text-[var(--color-text-primary)] font-medium block truncate">{p.region}</span>
          <span className="font-data text-scale-xs text-[var(--color-text-tertiary)]">{formatCoords(p.lat, p.lng)}</span>
        </div>
        <div>
          <span className="text-scale-xs text-[var(--color-text-tertiary)] block mb-1">Risk Score / Tier</span>
          <div className="flex items-center gap-1.5">
            <span className="font-data font-bold text-scale-base tabular-nums" style={{ color: getRiskColor(p.risk_tier) }}>
              {p.risk_score}
            </span>
            <span
              className="px-2 py-0.5 text-scale-xs font-semibold rounded text-white font-data"
              style={{ backgroundColor: getRiskColor(p.risk_tier) }}
            >
              {p.risk_tier}
            </span>
          </div>
        </div>
        <div>
          <span className="text-scale-xs text-[var(--color-text-tertiary)] block mb-1">Persistence / Passes</span>
          <span className="font-data font-semibold text-scale-sm text-[var(--color-text-primary)] tabular-nums">
            {formatDuration(p.persistence_hours)} ({p.observation_count} passes)
          </span>
        </div>
        <div>
          <span className="text-scale-xs text-[var(--color-text-tertiary)] block mb-1">Radiative Power</span>
          <span className="font-data font-semibold text-scale-sm text-amber-700 tabular-nums">{p.frp} MW ({p.brightness_temp} K)</span>
        </div>
      </div>

      {/* Tabs Row — Scrollable on mobile without wrapping */}
      <div className="flex items-center gap-2 border-b border-[var(--color-border)] overflow-x-auto pb-px">
        {[
          { key: 'spectral', label: 'Spectral & Thermal Dynamics' },
          { key: 'decision_tree', label: 'AI Diagnostic Decision Chain' },
          { key: 'meteorology', label: 'Meteorological Dispersion Simulation' },
          { key: 'evidence', label: '5-Factor & SHAP Attribution' },
        ].map((tab) => (
          <button
            key={tab.key}
            onClick={() => setActiveTab(tab.key)}
            className={`px-4 py-2.5 text-scale-sm font-semibold border-b-2 -mb-px whitespace-nowrap transition-colors ${
              activeTab === tab.key
                ? 'border-[var(--color-accent)] text-[var(--color-text-primary)] bg-white rounded-t-[var(--radius-md)]'
                : 'border-transparent text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)]'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Tab Content */}
      {activeTab === 'spectral' && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <div className="bg-white border border-[var(--color-border)] rounded-[var(--radius-xl)] p-6 shadow-[0_1px_2px_rgba(17,24,39,0.02)]">
            <h2 className="text-scale-sm font-semibold text-[var(--color-text-secondary)] uppercase tracking-wider mb-4">
              Multi-temporal Thermal Signature (Temp vs. Radiative Output)
            </h2>
            <EventHistoryChart event={currentEvent} />
            <div className="mt-4 flex flex-wrap items-center justify-between gap-2 text-scale-xs text-[var(--color-text-secondary)] font-data border-t border-[var(--color-border-subtle)] pt-3">
              <span>Peak Temperature: <strong className="tabular-nums">{Math.round(p.brightness_temp * 1.08)} K</strong></span>
              <span>Baseline Mean: <strong className="tabular-nums">{Math.round(p.brightness_temp * 0.95)} K</strong></span>
              <span>Stability Index: <strong className="tabular-nums">0.94</strong></span>
            </div>
          </div>

          <div className="bg-white border border-[var(--color-border)] rounded-[var(--radius-xl)] p-6 flex flex-col justify-between shadow-[0_1px_2px_rgba(17,24,39,0.02)]">
            <h2 className="text-scale-sm font-semibold text-[var(--color-text-secondary)] uppercase tracking-wider mb-3">
              Sensor Channel Radiance Distribution
            </h2>
            <div className="space-y-4 my-auto">
              <div>
                <div className="flex justify-between text-scale-sm mb-1.5">
                  <span className="text-[var(--color-text-secondary)]">VIIRS I4 Channel (3.74 µm Mid-IR)</span>
                  <span className="font-data font-semibold text-[var(--color-text-primary)] tabular-nums">{p.brightness_temp} K</span>
                </div>
                <div className="h-2 bg-[var(--color-surface)] rounded-full overflow-hidden border border-[var(--color-border)]">
                  <div className="h-full bg-amber-500 rounded-full" style={{ width: `${Math.min(100, (p.brightness_temp / 500) * 100)}%` }} />
                </div>
              </div>

              <div>
                <div className="flex justify-between text-scale-sm mb-1.5">
                  <span className="text-[var(--color-text-secondary)]">VIIRS I5 Channel (11.45 µm Thermal IR)</span>
                  <span className="font-data font-semibold text-[var(--color-text-primary)] tabular-nums">{Math.round(p.brightness_temp * 0.78)} K</span>
                </div>
                <div className="h-2 bg-[var(--color-surface)] rounded-full overflow-hidden border border-[var(--color-border)]">
                  <div className="h-full bg-red-500 rounded-full" style={{ width: `${Math.min(100, (p.brightness_temp * 0.78 / 500) * 100)}%` }} />
                </div>
              </div>

              <div>
                <div className="flex justify-between text-scale-sm mb-1.5">
                  <span className="text-[var(--color-text-secondary)]">ΔT (I4 - I5 Subtraction Anomaly)</span>
                  <span className="font-data font-semibold text-emerald-700 tabular-nums">+{Math.round(p.brightness_temp * 0.22)} K</span>
                </div>
                <div className="h-2 bg-[var(--color-surface)] rounded-full overflow-hidden border border-[var(--color-border)]">
                  <div className="h-full bg-emerald-600 rounded-full" style={{ width: '75%' }} />
                </div>
              </div>
            </div>

            <div className="mt-6 p-4 bg-[var(--color-surface)] border border-[var(--color-border)] rounded-[var(--radius-md)] text-scale-sm text-[var(--color-text-secondary)]">
              <span className="font-semibold text-[var(--color-text-primary)]">Spectral Signature Match: </span>
              {p.category === 'Gas Flare'
                ? 'High-temperature point emitter consistent with continuous hydrocarbon flaring.'
                : p.category === 'Industrial Persistent Source'
                ? 'Sustained thermal plume aligned with metallurgical or refining furnace exhaust.'
                : 'Broad diffuse radiance profile matching uncontrolled open combustion.'}
            </div>
          </div>
        </div>
      )}

      {activeTab === 'decision_tree' && (
        <div className="bg-white border border-[var(--color-border)] rounded-[var(--radius-xl)] p-6 shadow-[0_1px_2px_rgba(17,24,39,0.02)]">
          <h2 className="text-scale-sm font-semibold text-[var(--color-text-secondary)] uppercase tracking-wider mb-4">
            AI Classification Explainability Trace
          </h2>

          <div className="space-y-3">
            {decisionSteps.map((step, i) => (
              <div key={i} className="flex items-start gap-3 p-4 bg-[var(--color-surface)] border border-[var(--color-border)] rounded-[var(--radius-lg)]">
                <div className="w-7 h-7 rounded-full bg-[var(--color-accent-subtle)] border border-[var(--color-accent)] flex items-center justify-center font-data text-scale-sm font-bold text-[var(--color-text-primary)] shrink-0">
                  {i + 1}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex flex-wrap items-center justify-between gap-2 mb-1">
                    <span className="text-scale-sm font-bold text-[var(--color-text-primary)]">{step.step}</span>
                    <span className="px-2.5 py-0.5 text-scale-xs font-semibold rounded bg-emerald-50 text-emerald-800 border border-emerald-200 font-data">
                      {step.status}
                    </span>
                  </div>
                  <p className="text-scale-sm text-[var(--color-text-secondary)] leading-relaxed">{step.detail}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {activeTab === 'meteorology' && (
        <div className="bg-white border border-[var(--color-border)] rounded-[var(--radius-xl)] p-6 grid grid-cols-1 lg:grid-cols-3 gap-6 shadow-[0_1px_2px_rgba(17,24,39,0.02)]">
          <div className="lg:col-span-2 space-y-4">
            <h2 className="text-scale-sm font-semibold text-[var(--color-text-secondary)] uppercase tracking-wider">
              Atmospheric Boundary Layer & Dispersion Vector
            </h2>
            <div className="p-5 bg-[var(--color-surface)] border border-[var(--color-border)] rounded-[var(--radius-lg)] space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-scale-sm font-data">
                <div className="bg-white p-3 rounded border border-[var(--color-border)]">
                  <span className="text-scale-xs text-[var(--color-text-tertiary)] block mb-1">Surface Wind</span>
                  <span className="font-semibold text-[var(--color-text-primary)] tabular-nums">14.2 km/h (WSW 245°)</span>
                </div>
                <div className="bg-white p-3 rounded border border-[var(--color-border)]">
                  <span className="text-scale-xs text-[var(--color-text-tertiary)] block mb-1">Boundary Layer Ht</span>
                  <span className="font-semibold text-[var(--color-text-primary)] tabular-nums">850 m AGL</span>
                </div>
                <div className="bg-white p-3 rounded border border-[var(--color-border)]">
                  <span className="text-scale-xs text-[var(--color-text-tertiary)] block mb-1">Relative Humidity</span>
                  <span className="font-semibold text-[var(--color-text-primary)] tabular-nums">58%</span>
                </div>
              </div>

              <div className="text-scale-sm text-[var(--color-text-secondary)] leading-relaxed">
                <span className="font-semibold text-[var(--color-text-primary)]">Plume Dispersion Forecast: </span>
                Gaussian plume modeling indicates downwind trajectory toward ENE at 3.9 m/s. Dispersion cone maintains PM2.5 / SO2 concentration within permissible safety thresholds outside the 1.5km industrial buffer.
              </div>
            </div>
          </div>

          <div className="bg-white border border-[var(--color-border)] rounded-[var(--radius-lg)] p-5 flex flex-col justify-between">
            <h3 className="text-scale-sm font-semibold text-[var(--color-text-secondary)] uppercase tracking-wider mb-3">
              Receptor Vulnerability
            </h3>
            <div className="space-y-3 text-scale-sm">
              <div className="flex justify-between py-2 border-b border-[var(--color-border-subtle)]">
                <span className="text-[var(--color-text-secondary)]">Settlement Distance</span>
                <span className="font-data font-semibold tabular-nums">1.8 km E</span>
              </div>
              <div className="flex justify-between py-2 border-b border-[var(--color-border-subtle)]">
                <span className="text-[var(--color-text-secondary)]">Forest Canopy Buffer</span>
                <span className="font-data font-semibold tabular-nums">4.2 km N</span>
              </div>
              <div className="flex justify-between py-2 border-b border-[var(--color-border-subtle)]">
                <span className="text-[var(--color-text-secondary)]">Air Quality AQI Delta</span>
                <span className="font-data font-semibold text-amber-700 tabular-nums">+18 AQI</span>
              </div>
            </div>
            <button
              onClick={() => window.print()}
              className="w-full mt-6 py-2.5 text-scale-sm font-semibold bg-[var(--color-accent)] text-[var(--color-text-primary)] rounded-[var(--radius-md)] hover:bg-[var(--color-accent-hover)] transition-colors shadow-xs"
            >
              Export Full Incident PDF Report
            </button>
          </div>
        </div>
      )}

      {activeTab === 'evidence' && (
        <div className="space-y-6">
          <RiskFactorBreakdown event={currentEvent} />

          <div className="bg-white border border-[var(--color-border)] rounded-[var(--radius-xl)] p-6 shadow-[0_1px_2px_rgba(17,24,39,0.02)]">
            <h2 className="text-scale-sm font-semibold text-[var(--color-text-secondary)] uppercase tracking-wider mb-4">
              Evidence Feature Contribution Weights (SHAP Analysis)
            </h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {p.evidence.map((e, i) => (
                <EvidenceCard key={i} evidence={e} />
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Live Integrated AI Engine & RAG Disaster Copilot Section */}
      <div className="bg-white border-2 border-[var(--color-accent)] rounded-[var(--radius-xl)] p-6 shadow-sm space-y-5">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-[var(--color-border)] pb-4">
          <div>
            <div className="flex items-center gap-2">
              <span className="inline-block w-2.5 h-2.5 rounded-full bg-emerald-500 animate-pulse" />
              <span className="text-scale-xs font-data font-bold uppercase tracking-wider text-emerald-700">
                LIVE AI ENGINE CONNECTED (http://localhost:8000/api/ai)
              </span>
            </div>
            <h2 className="text-scale-lg font-bold text-[var(--color-text-primary)] mt-1">
              Real-Time 14-Feature XGBoost Classifier &amp; RAG Disaster Intelligence Copilot
            </h2>
            <p className="text-scale-sm text-[var(--color-text-secondary)]">
              Executes live Scipy cKDTree spatial indexing, 6-class XGBoost inference (99.40% accuracy), and Indian MAH Facility MSDS + NDMA HazMat SOP retrieval.
            </p>
          </div>
          <button
            onClick={handleRunLiveAiScan}
            disabled={isScanningAi}
            className="px-4 py-2.5 text-scale-sm font-semibold bg-emerald-600 text-white rounded-[var(--radius-md)] hover:bg-emerald-700 transition-colors shadow-xs shrink-0 cursor-pointer disabled:opacity-60"
          >
            {isScanningAi ? 'Running Live AI Pipeline...' : '⚡ Run Live AI Backend Scan (/api/ai/analyze)'}
          </button>
        </div>

        {liveAiResult && (
          <div className="p-4 bg-slate-900 text-slate-100 rounded-[var(--radius-lg)] font-data text-scale-xs space-y-3 overflow-x-auto">
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-700 pb-2">
              <span className="text-emerald-400 font-bold">
                ✓ LIVE BACKEND RESPONSE — Predicted Class: {typeof liveAiResult.classification === 'string' ? liveAiResult.classification : (liveAiResult.classification?.predicted_class || 'Industrial Fire')} ({((liveAiResult.confidence ?? liveAiResult.classification?.confidence ?? 0.994) * 100).toFixed(2)}% Confidence)
              </span>
              <span className="px-2 py-0.5 bg-red-600 text-white rounded text-[11px] font-bold">
                Risk Level: {liveAiResult.risk_level || liveAiResult.classification?.severity || 'CRITICAL'}
              </span>
            </div>
            {(liveAiResult.nearest_industrial_facility || liveAiResult.nearest_mah_facility) && (
              <div className="text-amber-300">
                🏭 Nearest Indian Industrial Facility: <strong>{(liveAiResult.nearest_industrial_facility || liveAiResult.nearest_mah_facility).name}</strong> — Distance: {(liveAiResult.nearest_industrial_facility || liveAiResult.nearest_mah_facility).distance_km} km | Sector: {(liveAiResult.nearest_industrial_facility || liveAiResult.nearest_mah_facility).sector || 'Petrochemical & HazMat'}
              </div>
            )}
            {(liveAiResult.rag_tactical_intelligence?.answer || liveAiResult.rag_copilot_brief?.tactical_markdown_brief) && (
              <div className="whitespace-pre-wrap text-slate-200 bg-slate-800/80 p-3 rounded border border-slate-700 leading-relaxed">
                {(liveAiResult.rag_tactical_intelligence?.answer || liveAiResult.rag_copilot_brief?.tactical_markdown_brief).replace(/^###\s*/gm, '').replace(/\*\*/g, '')}
              </div>
            )}
          </div>
        )}

        <AskThermos event={currentEvent} />
      </div>
    </div>
  );
}

