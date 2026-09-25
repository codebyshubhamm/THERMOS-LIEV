import { useState, useMemo } from 'react';
import { useStore } from '../store/useStore';
import { RISK_COLORS } from '../data/mockData';
import {
  getCategoryColor, getRiskColor, getCategoryShort, buildReasonString,
  formatDuration,
} from '../utils/formatters';
import MapView from '../components/map/MapView';

export default function CommandCentre() {
  const timeRange = useStore((s) => s.timeRange);
  const setTimeRange = useStore((s) => s.setTimeRange);
  const selectEvent = useStore((s) => s.selectEvent);
  const selectedEventId = useStore((s) => s.selectedEventId);
  const getFilteredEvents = useStore((s) => s.getFilteredEvents);
  const dataSource = useStore((s) => s.dataSource);
  const loading = useStore((s) => s.loading);

  console.info('[CommandCentre] Current dataSource state:', dataSource, '| Loading:', loading);

  const [mobileView, setMobileView] = useState('map'); // 'map' | 'priority'
  const [sidebarCat, setSidebarCat] = useState('ALL'); // 'ALL' | 'INDUSTRIAL' | 'WILDFIRE' | 'MINING' | 'AGRI'
  const [sidebarSort, setSidebarSort] = useState('RISK'); // 'RISK' | 'FRP' | 'RECENT'

  // Single source of truth: BOTH map and sidebar consume the exact same events
  const events = getFilteredEvents();
  console.info('[CommandCentre] Filtered events count:', events.length, '| Sample event 0:', events[0]?.properties?.id);

  const topEvents = useMemo(() => {
    let list = [...events];
    if (sidebarCat !== 'ALL') {
      list = list.filter((e) => {
        const cat = (e.properties?.category || (typeof e.properties?.classification === 'string' ? e.properties?.classification : e.properties?.classification?.category) || '').toLowerCase();
        if (sidebarCat === 'INDUSTRIAL') return cat.includes('industrial');
        if (sidebarCat === 'WILDFIRE') return cat.includes('wildfire') || cat.includes('forest');
        if (sidebarCat === 'MINING') return cat.includes('mining');
        if (sidebarCat === 'AGRI') return cat.includes('agri') || cat.includes('burn');
        return true;
      });
    }

    if (sidebarSort === 'FRP') {
      list.sort((a, b) => (Number(b.properties?.frp) || 0) - (Number(a.properties?.frp) || 0));
    } else if (sidebarSort === 'RECENT') {
      list.sort((a, b) => new Date(b.properties?.acquired_at || 0) - new Date(a.properties?.acquired_at || 0));
    } else {
      list.sort((a, b) => (b.properties?.risk_score || 0) - (a.properties?.risk_score || 0));
    }

    return list;
  }, [events, sidebarCat, sidebarSort]);

  const stats = useMemo(() => {
    return {
      total: events.length,
      critical: events.filter((e) => (e.properties?.risk_tier || '').toLowerCase() === 'critical').length,
      high: events.filter((e) => (e.properties?.risk_tier || '').toLowerCase() === 'high').length,
      persistent: events.filter((e) => (e.properties?.persistence_hours || 0) >= 48).length,
    };
  }, [events]);

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* Mobile view toggle switcher */}
      <div className="md:hidden flex items-center justify-between px-4 py-2 bg-white border-b border-[var(--color-border)] shrink-0">
        <div className="flex items-center gap-1 bg-[var(--color-surface)] p-1 rounded-[var(--radius-md)] border border-[var(--color-border)]">
          <button
            onClick={() => setMobileView('map')}
            className={`px-3 py-1 text-scale-xs font-semibold rounded-[var(--radius-sm)] transition-colors ${
              mobileView === 'map'
                ? 'bg-[var(--color-accent)] text-[var(--color-text-primary)] shadow-xs'
                : 'text-[var(--color-text-secondary)]'
            }`}
          >
            Live Map
          </button>
          <button
            onClick={() => setMobileView('priority')}
            className={`px-3 py-1 text-scale-xs font-semibold rounded-[var(--radius-sm)] transition-colors ${
              mobileView === 'priority'
                ? 'bg-[var(--color-accent)] text-[var(--color-text-primary)] shadow-xs'
                : 'text-[var(--color-text-secondary)]'
            }`}
          >
            Priority Incidents ({topEvents.length})
          </button>
        </div>
        <span className="font-data text-scale-xs text-[var(--color-text-secondary)] tabular-nums">
          {stats.total} Hotspots
        </span>
      </div>

      {/* Main content: map + priority sidebar */}
      <div className="flex flex-1 min-h-0 relative">
        {/* Map area */}
        <div className={`flex-1 min-w-0 h-full relative ${mobileView === 'priority' ? 'hidden md:block' : 'block'}`}>
          <MapView />
        </div>

        {/* Right: Priority Events */}
        <div
          className={`
            w-full md:w-[320px] border-l border-[var(--color-border)] bg-white flex flex-col shrink-0 h-full
            ${mobileView === 'map' ? 'hidden md:flex' : 'flex'}
          `}
        >
          <div className="p-4 border-b border-[var(--color-border)] flex items-center justify-between">
            <div>
              <h2 className="text-scale-sm font-semibold text-[var(--color-text-secondary)] uppercase tracking-wider">
                Priority Events
              </h2>
              <div className="flex items-center gap-1.5 mt-0.5">
                {(() => {
                  console.info('[CommandCentre:FeedStatus:BEFORE] Evaluating feed label. dataSource =', dataSource, '| Loading =', loading, '| Events count =', events.length);
                  return null;
                })()}
                <span className={`w-1.5 h-1.5 rounded-full ${dataSource === 'live' ? 'bg-emerald-500' : 'bg-amber-500'}`} />
                <span className="text-[10px] font-bold uppercase tracking-wider text-[var(--color-text-tertiary)]">
                  {dataSource === 'live' ? 'NASA FIRMS Live' : 'Demo Feed'}
                </span>
                {(() => {
                  console.info('[CommandCentre:FeedStatus:AFTER] Rendered label:', dataSource === 'live' ? 'NASA FIRMS Live' : 'Demo Feed');
                  return null;
                })()}
              </div>
            </div>
            <span className="font-data text-scale-xs text-[var(--color-text-tertiary)] tabular-nums">
              {topEvents.length} of {stats.total}
            </span>
          </div>

          {/* Category Filter Pills */}
          <div className="px-3 py-2 border-b border-[var(--color-border-subtle)] bg-[var(--color-surface)] flex items-center gap-1 overflow-x-auto text-[11px] font-semibold">
            {[
              { id: 'ALL', label: 'All' },
              { id: 'INDUSTRIAL', label: 'Industrial' },
              { id: 'WILDFIRE', label: 'Wildfire' },
              { id: 'MINING', label: 'Mining' },
              { id: 'AGRI', label: 'Agri' },
            ].map((tab) => (
              <button
                key={tab.id}
                onClick={() => setSidebarCat(tab.id)}
                className={`px-2.5 py-1 rounded-[var(--radius-sm)] shrink-0 transition-colors cursor-pointer ${
                  sidebarCat === tab.id
                    ? 'bg-slate-900 text-white font-bold'
                    : 'text-[var(--color-text-secondary)] hover:bg-[var(--color-surface-hover)]'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>

          {/* Sort bar */}
          <div className="px-3 py-1.5 border-b border-[var(--color-border-subtle)] bg-white flex items-center justify-between text-[11px] text-[var(--color-text-secondary)]">
            <span className="font-medium text-slate-600">Showing {topEvents.length} events</span>
            <div className="flex items-center gap-1.5">
              <span>Sort:</span>
              <select
                value={sidebarSort}
                onChange={(e) => setSidebarSort(e.target.value)}
                className="bg-transparent font-semibold text-slate-800 border-none outline-none cursor-pointer"
              >
                <option value="RISK">Risk Score</option>
                <option value="FRP">FRP (MW)</option>
                <option value="RECENT">Newest</option>
              </select>
            </div>
          </div>

          <div className="flex-1 overflow-y-auto divide-y divide-[var(--color-border-subtle)]">
            {topEvents.length === 0 && (
              <div className="p-6 text-center text-scale-xs text-[var(--color-text-tertiary)]">
                {loading ? 'Fetching thermal events…' : 'No hotspots match current category filter.'}
              </div>
            )}
            {topEvents.map((event) => {
              const p = event.properties || {};
              const isSelected = selectedEventId === p.id;
              const isInd = Boolean(p.is_industrial);
              const indDist = p.nearest_industrial_distance_m != null ? Math.round(Number(p.nearest_industrial_distance_m)) : null;
              const rawLc = p.land_cover_type || p.land_cover;
              const lcLabel = (!rawLc || rawLc === 'unknown' || rawLc === 'demo-fallback') ? 'Satellite Hotspot' : String(rawLc).replace(/_/g, ' ');
              const catLabel = p.category || (typeof p.classification === 'string' ? p.classification : p.classification?.category) || 'Thermal Hotspot';
              return (
                <button
                  key={p.id}
                  onClick={() => selectEvent(p.id)}
                  className={`
                    w-full text-left p-3.5 transition-colors hover:bg-[var(--color-surface)] cursor-pointer
                    ${isSelected ? 'bg-[var(--color-accent-subtle)]' : ''}
                  `}
                >
                  <div className="flex items-center justify-between mb-1">
                    <span className="font-data text-scale-sm font-bold text-[var(--color-text-primary)]">
                      {p.id}
                    </span>
                    <span
                      className="px-2 py-0.5 text-scale-xs font-bold rounded text-white font-data tabular-nums"
                      style={{ backgroundColor: getRiskColor(p.risk_tier) }}
                    >
                      {p.risk_score}
                    </span>
                  </div>
                  <div className="flex items-center gap-1.5 mb-1">
                    <span
                      className="w-2 h-2 rounded-full shrink-0"
                      style={{ backgroundColor: getCategoryColor(catLabel) }}
                    />
                    <span className="text-scale-xs font-semibold text-[var(--color-text-primary)] truncate max-w-[130px]">
                      {catLabel}
                    </span>
                    <span className="text-[var(--color-text-tertiary)]">·</span>
                    <span className="text-[11px] text-[var(--color-text-secondary)] truncate flex-1">
                      {p.region || `${Number(p.lat || 0).toFixed(2)}°N, ${Number(p.lng || 0).toFixed(2)}°E`}
                    </span>
                  </div>
                  <div className="text-scale-xs text-[var(--color-text-secondary)] line-clamp-1 flex items-center gap-1.5">
                    {isInd ? (
                      <span className="text-amber-600 font-semibold truncate max-w-[170px]">
                        🏭 {indDist != null ? `${indDist}m to industry` : 'Industrial Zone'}
                      </span>
                    ) : (
                      <span className="truncate max-w-[170px]">🛰️ {lcLabel}</span>
                    )}
                    <span>·</span>
                    <span className="font-data font-medium text-[var(--color-text-tertiary)] shrink-0">
                      {p.frp != null ? `${Number(p.frp).toFixed(1)} MW FRP` : ''}
                    </span>
                  </div>
                </button>
              );
            })}
          </div>
        </div>
      </div>

      {/* Bottom strip: stats + time range */}
      <div className="min-h-[48px] py-2 border-t border-[var(--color-border)] bg-white flex flex-wrap items-center justify-between px-4 gap-3 shrink-0 overflow-x-auto">
        <div className="flex items-center gap-4 sm:gap-6 flex-nowrap overflow-x-auto">
          <StatChip label="Total Hotspots" value={stats.total} />
          <StatChip label="Critical" value={stats.critical} color={RISK_COLORS.Critical} />
          <StatChip label="High" value={stats.high} color={RISK_COLORS.High} />
          <StatChip label="Persistent" value={stats.persistent} color="#D97706" />
        </div>

        <div className="flex items-center gap-1 bg-[var(--color-surface)] p-1 rounded-[var(--radius-md)] border border-[var(--color-border)] shrink-0 ml-auto">
          {['24H', '7D', '30D'].map((range) => (
            <button
              key={range}
              onClick={() => setTimeRange(range)}
              className={`
                px-2.5 py-1 text-scale-xs font-semibold rounded-[var(--radius-sm)] transition-colors
                ${timeRange === range
                  ? 'bg-[var(--color-accent)] text-[var(--color-text-primary)] shadow-xs'
                  : 'text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)]'
                }
              `}
            >
              {range}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

function StatChip({ label, value, color }) {
  return (
    <div className="flex items-center gap-1.5 shrink-0">
      <span className="text-scale-xs text-[var(--color-text-tertiary)]">{label}:</span>
      <span
        className="font-data text-scale-sm font-bold tabular-nums"
        style={{ color: color || 'var(--color-text-primary)' }}
      >
        {value}
      </span>
    </div>
  );
}
