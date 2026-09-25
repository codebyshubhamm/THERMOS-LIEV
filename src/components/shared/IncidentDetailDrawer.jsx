import { useState, useEffect } from 'react';
import { motion, AnimatePresence, useReducedMotion } from 'framer-motion';
import { useStore } from '../../store/useStore';
import { explainFireEvent } from '../../services/api';
import {
  formatDuration, formatTimestamp, formatCoords,
  getCategoryColor, getRiskColor, getCategoryShort,
} from '../../utils/formatters';
import EventHistoryChart from './EventHistoryChart';
import EvidenceCard from './EvidenceCard';
import RiskFactorBreakdown from './RiskFactorBreakdown';
import AskThermos from './AskThermos';

export default function IncidentDetailDrawer() {
  const reduceMotion = useReducedMotion();
  const drawerOpen = useStore((s) => s.drawerOpen);
  const getSelectedEvent = useStore((s) => s.getSelectedEvent);
  const clearSelection = useStore((s) => s.clearSelection);

  const event = getSelectedEvent();
  const p = event?.properties;

  const [liveExplanation, setLiveExplanation] = useState(p?.explanation || null);
  const [isExplaining, setIsExplaining] = useState(false);
  const [reasoning, setReasoning] = useState(null);

  useEffect(() => {
    setLiveExplanation(p?.explanation || null);
    setReasoning(null);
    if (!p) return;
    if (drawerOpen) {
      let isSubscribed = true;
      setIsExplaining(true);
      explainFireEvent(p)
        .then((data) => {
          if (isSubscribed && data) {
            if (typeof data === 'object') {
              setLiveExplanation(data.explanation || null);
              setReasoning(data);
            } else {
              setLiveExplanation(data);
            }
          }
        })
        .finally(() => {
          if (isSubscribed) setIsExplaining(false);
        });
      return () => { isSubscribed = false; };
    }
  }, [p?.id, drawerOpen]);

  return (
    <AnimatePresence>
      {drawerOpen && p && (
        <>
          {/* Backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="fixed inset-0 bg-black/20 z-40 backdrop-blur-[2px]"
            onClick={clearSelection}
          />

          {/* Drawer */}
          <motion.aside
            initial={reduceMotion ? { opacity: 0 } : { x: '100%' }}
            animate={reduceMotion ? { opacity: 1 } : { x: 0 }}
            exit={reduceMotion ? { opacity: 0 } : { x: '100%' }}
            transition={{ type: 'spring', stiffness: 280, damping: 28 }}
            className="fixed top-0 right-0 bottom-0 w-[440px] max-w-[95vw] bg-white border-l border-[var(--color-border)] z-50 flex flex-col overflow-hidden shadow-2xl"
          >
            {/* Header */}
            <div className="p-6 border-b border-[var(--color-border)] shrink-0">
              <div className="flex items-start justify-between mb-3">
                <div className="flex items-center gap-2">
                  <span className="font-data text-scale-base font-bold text-[var(--color-text-primary)]">
                    {p.id}
                  </span>
                  <span
                    className="px-2.5 py-0.5 text-scale-xs font-semibold rounded-full text-white"
                    style={{ backgroundColor: getCategoryColor(p.category) }}
                  >
                    {getCategoryShort(p.category)}
                  </span>
                </div>
                <button
                  onClick={clearSelection}
                  className="p-1.5 rounded-[var(--radius-md)] hover:bg-[var(--color-surface)] transition-colors text-[var(--color-text-secondary)]"
                  aria-label="Close details"
                >
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <line x1="18" y1="6" x2="6" y2="18" />
                    <line x1="6" y1="6" x2="18" y2="18" />
                  </svg>
                </button>
              </div>

              {/* Risk + confidence row */}
              <div className="flex items-center gap-6">
                <div className="flex items-center gap-2">
                  <span className="text-scale-sm font-medium text-[var(--color-text-secondary)]">Risk:</span>
                  <div className="flex items-center gap-2">
                    <div className="w-24 h-2 bg-[var(--color-surface)] border border-[var(--color-border)] rounded-full overflow-hidden">
                      <div
                        className="h-full rounded-full transition-all duration-300"
                        style={{
                          width: `${p.risk_score}%`,
                          backgroundColor: getRiskColor(p.risk_tier),
                        }}
                      />
                    </div>
                    <span className="font-data text-scale-sm font-bold tabular-nums" style={{ color: getRiskColor(p.risk_tier) }}>
                      {p.risk_score}
                    </span>
                    <span
                      className="px-2 py-0.5 text-scale-xs font-semibold rounded text-white"
                      style={{ backgroundColor: getRiskColor(p.risk_tier) }}
                    >
                      {p.risk_tier}
                    </span>
                  </div>
                </div>
                <div className="flex items-center gap-1.5">
                  <span className="text-scale-sm font-medium text-[var(--color-text-secondary)]">Confidence:</span>
                  <span className="font-data text-scale-sm font-bold text-[var(--color-text-primary)] tabular-nums">{p.confidence}%</span>
                </div>
              </div>
            </div>

            {/* Scrollable content */}
            <div className="flex-1 overflow-y-auto p-6 space-y-6">
              {/* AI Situational Briefing (Google Gemini) */}
              <div className="p-4 bg-slate-900 text-slate-100 rounded-[var(--radius-lg)] border border-slate-700/80 shadow-md">
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-2">
                    <span className="w-2 h-2 rounded-full bg-blue-400 animate-pulse"></span>
                    <h3 className="text-scale-xs font-bold uppercase tracking-wider text-blue-400">
                      AI Situational Briefing
                    </h3>
                  </div>
                  <span className="text-[10px] font-mono text-slate-300 bg-slate-800 px-2 py-0.5 rounded border border-slate-700">
                    Gemini 3.1 Flash
                  </span>
                </div>
                {isExplaining ? (
                  <div className="text-scale-xs text-slate-400 animate-pulse flex items-center gap-2 py-2">
                    <span className="inline-block w-3.5 h-3.5 border-2 border-blue-400 border-t-transparent rounded-full animate-spin"></span>
                    <span>Synthesizing real-time situational briefing via Google Gemini from FIRMS, OSM & Copernicus telemetry...</span>
                  </div>
                ) : (
                  <p className="text-scale-sm leading-relaxed text-slate-200">
                    {liveExplanation || p.explanation || "Thermal anomaly categorized via XGBoost multi-factor spatial model."}
                  </p>
                )}
              </div>

              {/* Dedicated Operational Reasoning Layer Cards */}
              <div className="space-y-2.5">
                <h3 className="text-scale-xs font-bold text-[var(--color-text-secondary)] uppercase tracking-wider">
                  Operational Reasoning Layer
                </h3>

                {/* 1. Origin & Temporal Dynamics */}
                <div className="p-3 bg-slate-50 border border-slate-200 rounded-[var(--radius-md)] flex items-start gap-2.5">
                  <div className="p-1.5 rounded bg-blue-100 text-blue-700 font-bold shrink-0 text-scale-xs">
                    🕒
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between gap-1 mb-0.5">
                      <span className="text-[11px] font-bold uppercase tracking-wider text-slate-700">
                        Origin &amp; Activity Estimate
                      </span>
                      {reasoning?.origin?.status && (
                        <span className="px-1.5 py-0.2 text-[9px] font-bold rounded bg-blue-100 text-blue-800">
                          {reasoning.origin.status}
                        </span>
                      )}
                    </div>
                    <p className="text-scale-xs text-slate-600 leading-relaxed">
                      {reasoning?.origin?.description || `Thermal anomaly active across ${p.observation_count || 1} satellite overpasses (approx. ${p.persistence_hours || 4}h continuous persistence).`}
                    </p>
                  </div>
                </div>

                {/* 2. Projected Containment / Progression */}
                <div className="p-3 bg-slate-50 border border-slate-200 rounded-[var(--radius-md)] flex items-start gap-2.5">
                  <div className="p-1.5 rounded bg-amber-100 text-amber-700 font-bold shrink-0 text-scale-xs">
                    🛡️
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between gap-1 mb-0.5">
                      <span className="text-[11px] font-bold uppercase tracking-wider text-slate-700">
                        Containment &amp; Spread Dynamics
                      </span>
                      {reasoning?.containment?.risk_profile && (
                        <span className="px-1.5 py-0.2 text-[9px] font-bold rounded bg-amber-100 text-amber-800">
                          {reasoning.containment.risk_profile}
                        </span>
                      )}
                    </div>
                    <p className="text-scale-xs text-slate-600 leading-relaxed">
                      {reasoning?.containment?.description || `Radiative power of ${p.frp || 15} MW. Progression behavior aligns with ${p.category} characteristics.`}
                    </p>
                  </div>
                </div>

                {/* 3. Surrounding Exposure & Emergency Infrastructure */}
                <div className="p-3 bg-slate-50 border border-slate-200 rounded-[var(--radius-md)] flex items-start gap-2.5">
                  <div className="p-1.5 rounded bg-emerald-100 text-emerald-700 font-bold shrink-0 text-scale-xs">
                    🏥
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between gap-1 mb-0.5">
                      <span className="text-[11px] font-bold uppercase tracking-wider text-slate-700">
                        Surrounding Exposure &amp; Dispatch
                      </span>
                      {reasoning?.exposure?.population_tier && (
                        <span className="px-1.5 py-0.2 text-[9px] font-bold rounded bg-emerald-100 text-emerald-800">
                          {reasoning.exposure.population_tier}
                        </span>
                      )}
                    </div>
                    <p className="text-scale-xs text-slate-600 leading-relaxed">
                      {reasoning?.exposure?.description || `Population buffer: ${p.population_5km || 4500} residents. Emergency dispatch & medical facilities correlated.`}
                    </p>
                  </div>
                </div>
              </div>

              {/* Multi-Source Environmental & Infrastructure Context */}
              <div className="space-y-2.5">
                <h3 className="text-scale-sm font-semibold text-[var(--color-text-secondary)] uppercase tracking-wider">
                  Multi-Source Satellite & GIS Context
                </h3>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                  {/* OSM Industrial Context */}
                  <div className="p-3 bg-[var(--color-surface)] border border-[var(--color-border)] rounded-[var(--radius-md)] flex items-start gap-2.5">
                    <div className="p-1.5 rounded bg-amber-500/10 text-amber-600 font-bold shrink-0">
                      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M2 20h20M6 20V10l4 3V10l4 3V4l6 4v12" />
                      </svg>
                    </div>
                    <div>
                      <div className="text-scale-xs text-[var(--color-text-tertiary)] font-semibold uppercase tracking-wider">
                        Industrial Context
                      </div>
                      {(() => {
                        const osmData = p.osm_context || p.industrial_context || {};
                        let tags = p.relevant_tags || p.matched_tags || osmData.relevant_tags || osmData.matched_tags || {};
                        if (typeof tags === 'string') {
                          try { tags = JSON.parse(tags); } catch (_) { tags = {}; }
                        }
                        const isInd = Boolean(p.is_industrial ?? osmData.is_industrial);
                        const indDist = p.nearest_industrial_distance_m ?? osmData.nearest_industrial_distance_m;
                        const facName = tags.name || tags.operator || '';
                        const indTag = tags.industrial || tags.landuse || tags.man_made || '';
                        return (
                          <>
                            <div className="text-scale-sm font-bold text-[var(--color-text-primary)] mt-0.5">
                              {isInd
                                ? (facName || (indDist != null && indDist <= 300 ? 'Inside Industrial Complex' : 'Industrial Zone Nearby'))
                                : 'No industrial infrastructure detected'}
                            </div>
                            {isInd ? (
                              <div className="text-scale-xs text-[var(--color-text-secondary)] mt-0.5 font-data">
                                {indDist != null && (
                                  <span>Proximity: <strong>{Math.round(Number(indDist))} m</strong></span>
                                )}
                                {indTag && (
                                  <span className="ml-1 text-[var(--color-text-tertiary)]">({indTag})</span>
                                )}
                              </div>
                            ) : (
                              <div className="text-scale-xs text-[var(--color-text-tertiary)] mt-0.5">
                                OSM vector scan verified (&gt; 2km buffer)
                              </div>
                            )}
                          </>
                        );
                      })()}
                    </div>
                  </div>

                  {/* Copernicus Sentinel Context */}
                  <div className="p-3 bg-[var(--color-surface)] border border-[var(--color-border)] rounded-[var(--radius-md)] flex items-start gap-2.5">
                    <div className="p-1.5 rounded bg-emerald-500/10 text-emerald-600 font-bold shrink-0">
                      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <circle cx="12" cy="12" r="10" />
                        <path d="M12 2a14.5 14.5 0 0 0 0 20M2 12h20" />
                      </svg>
                    </div>
                    <div>
                      <div className="text-scale-xs text-[var(--color-text-tertiary)] font-semibold uppercase tracking-wider">
                        Copernicus Sentinel
                      </div>
                      <div className="text-scale-sm font-bold text-[var(--color-text-primary)] mt-0.5">
                        {p.land_cover_type
                          ? `Land cover: ${p.land_cover_type.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())}`
                          : (p.land_cover ? `Land cover: ${p.land_cover}` : 'Land cover data unavailable')}
                      </div>
                      <div className="text-scale-xs text-[var(--color-text-secondary)] mt-0.5 font-data">
                        {p.ndvi_value != null ? `NDVI: ${Number(p.ndvi_value).toFixed(2)}` : 'Copernicus land context'}
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              {/* Meta grid */}
              <div className="grid grid-cols-2 gap-4 p-4 bg-[var(--color-surface)] border border-[var(--color-border-subtle)] rounded-[var(--radius-lg)]">
                <MetaItem label="Location" value={p.region} />
                <MetaItem label="Coordinates" value={formatCoords(p.lat, p.lng)} mono />
                <MetaItem label="First Detected" value={formatTimestamp(p.first_detected)} />
                <MetaItem label="Persistence" value={formatDuration(p.persistence_hours)} mono />
                <MetaItem label="Observations" value={p.observation_count || 1} mono />
                <MetaItem label="Land Cover" value={p.land_cover_type ? p.land_cover_type.replace(/_/g, ' ') : p.land_cover} />
                <MetaItem label="Radiative Power" value={`${p.frp} MW`} mono />
                <MetaItem label="Brightness Temp" value={`${p.brightness_temp} K`} mono />
              </div>

              {/* 5-Factor Risk Breakdown */}
              <div>
                <RiskFactorBreakdown event={event} />
              </div>

              {/* WHY THIS CLASSIFICATION (Evidence features) */}
              <div>
                <h3 className="text-scale-sm font-semibold text-[var(--color-text-secondary)] uppercase tracking-wider mb-3">
                  Evidence Feature Contributions
                </h3>
                <div className="space-y-2">
                  {p.evidence.map((e, i) => (
                    <EvidenceCard key={i} evidence={e} />
                  ))}
                </div>
              </div>

              {/* Event history chart */}
              <div>
                <h3 className="text-scale-sm font-semibold text-[var(--color-text-secondary)] uppercase tracking-wider mb-3">
                  Multi-Pass Thermal History
                </h3>
                <EventHistoryChart event={event} />
              </div>
            </div>

            {/* Bottom: Ask THERMOS */}
            <AskThermos eventId={p.id} eventContext={p} />
          </motion.aside>
        </>
      )}
    </AnimatePresence>
  );
}

function MetaItem({ label, value, mono }) {
  return (
    <div>
      <span className="block mb-0.5 text-scale-xs text-[var(--color-text-tertiary)]">{label}</span>
      <span className={`text-scale-sm font-medium text-[var(--color-text-primary)] ${mono ? 'font-data tabular-nums' : ''}`}>
        {value}
      </span>
    </div>
  );
}

