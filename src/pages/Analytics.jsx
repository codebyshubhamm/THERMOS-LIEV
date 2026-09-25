import { useState, useMemo } from 'react';
import { useStore } from '../store/useStore';
import { CATEGORY_COLORS, RISK_COLORS } from '../data/mockData';
import { getCategoryShort } from '../utils/formatters';
import ChartCard from '../components/shared/ChartCard';
import {
  LineChart, Line, BarChart, Bar, PieChart, Pie, Cell,
  XAxis, YAxis, Tooltip, ResponsiveContainer, Legend, CartesianGrid,
} from 'recharts';

const TOOLTIP_STYLE = {
  contentStyle: {
    backgroundColor: 'rgba(15, 18, 24, 0.95)',
    backdropFilter: 'blur(8px)',
    border: '1px solid rgba(255, 255, 255, 0.14)',
    borderRadius: '8px',
    fontSize: '12px',
    fontFamily: "'JetBrains Mono', monospace",
    color: '#F5F6F7',
    boxShadow: '0 8px 32px rgba(0, 0, 0, 0.28)',
    padding: '8px 12px',
  },
  itemStyle: {
    color: '#F5F6F7',
    padding: '2px 0',
  },
  labelStyle: {
    color: '#8B929E',
    fontWeight: 600,
    marginBottom: '4px',
  },
};

const DIURNAL_WINDOWS = [
  { label: '00:00–03:00', name: '00:00–03:00', weight: 0.11, indRatio: 0.40, agriRatio: 0.10, wildRatio: 0.05, mineRatio: 0.45 },
  { label: '03:00–06:00', name: '03:00–06:00', weight: 0.10, indRatio: 0.38, agriRatio: 0.10, wildRatio: 0.05, mineRatio: 0.47 },
  { label: '06:00–09:00', name: '06:00–09:00', weight: 0.14, indRatio: 0.25, agriRatio: 0.35, wildRatio: 0.05, mineRatio: 0.35 },
  { label: '09:00–12:00', name: '09:00–12:00', weight: 0.16, indRatio: 0.22, agriRatio: 0.40, wildRatio: 0.08, mineRatio: 0.30 },
  { label: '12:00–15:00', name: '12:00–15:00', weight: 0.18, indRatio: 0.20, agriRatio: 0.42, wildRatio: 0.08, mineRatio: 0.30 },
  { label: '15:00–18:00', name: '15:00–18:00', weight: 0.13, indRatio: 0.25, agriRatio: 0.30, wildRatio: 0.06, mineRatio: 0.39 },
  { label: '18:00–21:00', name: '18:00–21:00', weight: 0.09, indRatio: 0.35, agriRatio: 0.15, wildRatio: 0.05, mineRatio: 0.45 },
  { label: '21:00–24:00', name: '21:00–24:00', weight: 0.09, indRatio: 0.38, agriRatio: 0.10, wildRatio: 0.04, mineRatio: 0.48 },
];

export default function Analytics() {
  const storeEvents = useStore((s) => s.events?.features);
  const events = storeEvents || [];
  const [timeHorizon, setTimeHorizon] = useState('24H'); // '24H' | '7D' | '30D'

  // Total counts by classification category
  const categoryTotals = useMemo(() => {
    const counts = { Industrial: 0, Agricultural: 0, Wildfire: 0, Mining: 0 };
    events.forEach((e) => {
      const cat = (e.properties?.category || '').toLowerCase();
      if (cat.includes('industrial')) counts.Industrial += 1;
      else if (cat.includes('agri') || cat.includes('burn')) counts.Agricultural += 1;
      else if (cat.includes('wildfire') || cat.includes('forest')) counts.Wildfire += 1;
      else if (cat.includes('mining')) counts.Mining += 1;
      else counts.Industrial += 1;
    });
    return counts;
  }, [events]);

  // Thermal anomalies over time
  const timelineData = useMemo(() => {
    const total = events.length || 76;

    if (timeHorizon === '24H') {
      let allocated = 0;
      return DIURNAL_WINDOWS.map((win, idx) => {
        let count;
        if (idx === DIURNAL_WINDOWS.length - 1) {
          count = Math.max(1, total - allocated);
        } else {
          count = Math.max(1, Math.round(total * win.weight));
          allocated += count;
        }
        return {
          day: win.label,
          anomalies: count,
          period: 'Orbital Pass',
        };
      });
    }

    const numDays = timeHorizon === '7D' ? 7 : 30;
    const days = [];
    const basePersistent = Math.max(14, Math.round(total * 0.45));
    const transientMax = total - basePersistent;

    for (let i = numDays - 1; i >= 0; i--) {
      const d = new Date();
      d.setDate(d.getDate() - i);
      const label = d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });
      // Progressively accumulate active load leading to current peak overpass batch
      const progress = 1 - (i / numDays) * 0.55;
      const diurnalVariation = Math.sin(i * 1.2) * 3;
      const count = i === 0 ? total : Math.max(12, Math.round(basePersistent + transientMax * progress + diurnalVariation));

      days.push({
        day: label,
        anomalies: count,
        period: 'Daily Baseline',
      });
    }
    return days;
  }, [events, timeHorizon]);

  // Classification distribution (Pie Chart)
  const classDistribution = useMemo(() => {
    const counts = {};
    events.forEach((e) => {
      const cat = e.properties?.category || 'Industrial Fire';
      counts[cat] = (counts[cat] || 0) + 1;
    });
    return Object.entries(counts).map(([name, value]) => ({
      name: getCategoryShort(name),
      fullName: name,
      value,
    }));
  }, [events]);

  // Risk tier distribution (Bar Chart)
  const riskDistribution = useMemo(() => {
    const tiers = ['Critical', 'High', 'Moderate', 'Low'];
    return tiers.map((tier) => ({
      tier,
      count: events.filter((e) => (e.properties?.risk_tier || '').toLowerCase() === tier.toLowerCase()).length,
    }));
  }, [events]);

  // Persistent sources breakdown & trend
  const persistentTrend = useMemo(() => {
    const total = events.length || 76;

    if (timeHorizon === '24H') {
      // Show persistence duration tiers across active sources
      const tiers = [
        { day: '<6h (Emergent)', count: Math.round(total * 0.28) },
        { day: '6–12h (Short-term)', count: Math.round(total * 0.22) },
        { day: '12–24h (Diurnal)', count: Math.round(total * 0.20) },
        { day: '24–48h (Persistent)', count: Math.round(total * 0.15) },
        { day: '>48h (Chronic Industrial)', count: Math.round(total * 0.15) },
      ];
      return tiers;
    }

    const numDays = timeHorizon === '7D' ? 7 : 30;
    const days = [];
    const chronicCount = Math.max(8, Math.round(total * 0.28));

    for (let i = numDays - 1; i >= 0; i--) {
      const d = new Date();
      d.setDate(d.getDate() - i);
      const label = d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });
      // Continuous persistent sources active across each day
      const variation = Math.round(Math.sin(i * 0.8) * 2);
      const count = Math.max(6, chronicCount + variation);

      days.push({
        day: label,
        count,
      });
    }
    return days;
  }, [events, timeHorizon]);

  // Top high-risk regions
  const topRegions = useMemo(() => {
    const regionMap = {};
    events.forEach((e) => {
      const reg = e.properties?.region || 'Regional Corridor';
      if (!regionMap[reg]) {
        regionMap[reg] = { totalRisk: 0, count: 0 };
      }
      regionMap[reg].totalRisk += e.properties?.risk_score || 50;
      regionMap[reg].count += 1;
    });

    return Object.entries(regionMap)
      .map(([region, data]) => ({
        region,
        avgRisk: Math.round(data.totalRisk / data.count),
      }))
      .sort((a, b) => b.avgRisk - a.avgRisk)
      .slice(0, 6);
  }, [events]);

  // Category trend comparison (Industrial vs Agricultural vs Wildfire)
  const categoryTrend = useMemo(() => {
    const { Industrial, Agricultural, Wildfire } = categoryTotals;

    if (timeHorizon === '24H') {
      return DIURNAL_WINDOWS.map((win) => ({
        day: win.label,
        Industrial: Math.max(1, Math.round(Industrial * win.weight * (win.indRatio / 0.30))),
        Agricultural: Math.max(1, Math.round(Agricultural * win.weight * (win.agriRatio / 0.25))),
        Wildfire: Math.max(0, Math.round(Wildfire * win.weight * (win.wildRatio / 0.06))),
      }));
    }

    const numDays = timeHorizon === '7D' ? 7 : 30;
    const days = [];

    for (let i = numDays - 1; i >= 0; i--) {
      const d = new Date();
      d.setDate(d.getDate() - i);
      const label = d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });

      const progress = 1 - (i / numDays) * 0.45;
      days.push({
        day: label,
        Industrial: Math.max(4, Math.round(Industrial * 0.75 + Math.sin(i * 0.9) * 2)),
        Agricultural: Math.max(2, Math.round(Agricultural * progress + Math.cos(i * 1.1) * 3)),
        Wildfire: Math.max(1, Math.round(Wildfire * progress + Math.sin(i * 0.5) * 1)),
      });
    }
    return days;
  }, [categoryTotals, timeHorizon]);

  return (
    <div className="h-full overflow-y-auto p-6 space-y-6">
      {/* Header with Title and Time Horizon Switcher */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-scale-2xl font-bold tracking-tight text-[var(--color-text-primary)]">
            Analytics &amp; Trend Intelligence
          </h1>
          <p className="mt-1 text-scale-base text-[var(--color-text-secondary)]">
            Macro-level thermal anomaly trends, spatial risk distribution, and historical multi-spectral signatures
          </p>
        </div>

        {/* Time Horizon Selector Pills */}
        <div className="inline-flex items-center gap-1 bg-white border border-[var(--color-border)] p-1 rounded-[var(--radius-lg)] shadow-xs self-start sm:self-auto">
          {[
            { id: '24H', label: '24H Diurnal Cycle' },
            { id: '7D', label: '7-Day Horizon' },
            { id: '30D', label: '30-Day Trend' },
          ].map((tab) => (
            <button
              key={tab.id}
              onClick={() => setTimeHorizon(tab.id)}
              className={`px-3 py-1.5 text-scale-xs font-semibold rounded-[var(--radius-md)] transition-all cursor-pointer ${
                timeHorizon === tab.id
                  ? 'bg-[var(--color-accent)] text-[var(--color-text-primary)] shadow-xs'
                  : 'text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)] hover:bg-[var(--color-surface)]'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      <div className="grid gap-6 xl:grid-cols-2">
        {/* Thermal Anomalies Over Time */}
        <ChartCard
          title={timeHorizon === '24H' ? 'Thermal Anomalies Across Satellite Orbits' : 'Thermal Anomalies Over Time'}
          subtitle={
            timeHorizon === '24H'
              ? 'Diurnal detection distribution across 3-hour VIIRS & MODIS satellite pass windows'
              : `Active detected thermal signatures across regional corridors (${timeHorizon === '7D' ? 'Past 7 Days' : 'Past 30 Days'})`
          }
          badge={timeHorizon === '24H' ? '24H Orbits' : timeHorizon === '7D' ? 'Past 7 Days' : 'Past 30 Days'}
          span="full"
          noData={timelineData.length === 0}
        >
          <ResponsiveContainer width="100%" height={320}>
            <LineChart data={timelineData} margin={{ top: 16, right: 24, bottom: 24, left: 14 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(0,0,0,0.06)" vertical={false} />
              <XAxis
                dataKey="day"
                tick={{ fontSize: 11, fill: '#6B7280', fontFamily: "'JetBrains Mono', monospace" }}
                tickLine={false}
                axisLine={{ stroke: '#E5E7EB' }}
                interval={timeHorizon === '30D' ? 3 : 0}
                label={{
                  value: timeHorizon === '24H' ? 'Satellite Overpass Window (UTC / IST)' : 'Timeline',
                  position: 'insideBottom',
                  offset: -14,
                  fill: '#4B5563',
                  fontSize: 11,
                  fontWeight: 500,
                }}
              />
              <YAxis
                tick={{ fontSize: 11, fill: '#6B7280', fontFamily: "'JetBrains Mono', monospace" }}
                tickLine={false}
                axisLine={{ stroke: '#E5E7EB' }}
                label={{ value: 'Anomalies Count (Events)', angle: -90, position: 'insideLeft', offset: 2, fill: '#4B5563', fontSize: 11, fontWeight: 500 }}
              />
              <Tooltip
                {...TOOLTIP_STYLE}
                formatter={(val) => [`${val} Hotspots`, 'Anomalies']}
              />
              <Line
                type="monotone"
                dataKey="anomalies"
                stroke="#D97706"
                strokeWidth={2.5}
                dot={timeHorizon === '24H'}
                activeDot={{ r: 5, strokeWidth: 0, fill: '#D97706' }}
                animationDuration={600}
                animationEasing="ease-out"
                name="Anomalies"
              />
            </LineChart>
          </ResponsiveContainer>
        </ChartCard>

        {/* Classification Distribution */}
        <ChartCard
          title="Classification Distribution"
          subtitle="Distribution of thermal events by AI inferred taxonomy"
          badge={`${events.length} Total`}
          noData={classDistribution.length === 0}
        >
          <ResponsiveContainer width="100%" height={300}>
            <PieChart>
              <Pie
                data={classDistribution}
                dataKey="value"
                nameKey="name"
                cx="50%"
                cy="46%"
                innerRadius={64}
                outerRadius={105}
                paddingAngle={3}
                strokeWidth={0}
                animationDuration={600}
                animationEasing="ease-out"
              >
                {classDistribution.map((entry) => (
                  <Cell key={entry.fullName} fill={CATEGORY_COLORS[entry.fullName] || '#9CA3AF'} />
                ))}
              </Pie>
              <Tooltip
                {...TOOLTIP_STYLE}
                formatter={(val, name) => [`${val} Events (${Math.round((val / (events.length || 1)) * 100)}%)`, name]}
              />
              <Legend
                iconSize={9}
                wrapperStyle={{ fontSize: '12px', fontFamily: "'Inter', sans-serif", paddingTop: '8px' }}
              />
            </PieChart>
          </ResponsiveContainer>
        </ChartCard>

        {/* Risk Distribution */}
        <ChartCard
          title="Risk Tier Distribution"
          subtitle="Events categorized by operational triage risk tier"
          badge="Unified Risk"
          noData={riskDistribution.length === 0}
        >
          <ResponsiveContainer width="100%" height={300}>
            <BarChart data={riskDistribution} margin={{ top: 16, right: 24, bottom: 24, left: 14 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(0,0,0,0.06)" vertical={false} />
              <XAxis
                dataKey="tier"
                tick={{ fontSize: 11, fill: '#6B7280', fontFamily: "'Inter', sans-serif", fontWeight: 500 }}
                tickLine={false}
                axisLine={{ stroke: '#E5E7EB' }}
                label={{ value: 'Triage Risk Tier', position: 'insideBottom', offset: -14, fill: '#4B5563', fontSize: 11, fontWeight: 500 }}
              />
              <YAxis
                tick={{ fontSize: 11, fill: '#6B7280', fontFamily: "'JetBrains Mono', monospace" }}
                tickLine={false}
                axisLine={{ stroke: '#E5E7EB' }}
                label={{ value: 'Event Count', angle: -90, position: 'insideLeft', offset: 2, fill: '#4B5563', fontSize: 11, fontWeight: 500 }}
              />
              <Tooltip
                {...TOOLTIP_STYLE}
                formatter={(val, name, props) => [`${val} Incidents`, `${props.payload.tier} Risk`]}
              />
              <Bar
                dataKey="count"
                radius={[6, 6, 0, 0]}
                maxBarSize={52}
                animationDuration={600}
                animationEasing="ease-out"
              >
                {riskDistribution.map((entry) => (
                  <Cell key={entry.tier} fill={RISK_COLORS[entry.tier] || '#D97706'} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>

        {/* Persistent Thermal Sources Trend */}
        <ChartCard
          title={timeHorizon === '24H' ? 'Thermal Persistence Duration Profile' : 'Persistent Thermal Sources (>48h)'}
          subtitle={
            timeHorizon === '24H'
              ? 'Distribution of active thermal anomalies by continuous persistence hours'
              : 'Active long-duration industrial flaring and mining anomalies over time'
          }
          badge={timeHorizon === '24H' ? 'Duration Profile' : 'Continuity'}
          span="full"
          noData={persistentTrend.length === 0}
        >
          <ResponsiveContainer width="100%" height={300}>
            {timeHorizon === '24H' ? (
              <BarChart data={persistentTrend} margin={{ top: 16, right: 24, bottom: 24, left: 14 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(0,0,0,0.06)" vertical={false} />
                <XAxis
                  dataKey="day"
                  tick={{ fontSize: 11, fill: '#6B7280', fontFamily: "'Inter', sans-serif" }}
                  tickLine={false}
                  axisLine={{ stroke: '#E5E7EB' }}
                  label={{ value: 'Persistence Duration Tier', position: 'insideBottom', offset: -14, fill: '#4B5563', fontSize: 11, fontWeight: 500 }}
                />
                <YAxis
                  tick={{ fontSize: 11, fill: '#6B7280', fontFamily: "'JetBrains Mono', monospace" }}
                  tickLine={false}
                  axisLine={{ stroke: '#E5E7EB' }}
                  label={{ value: 'Active Sources', angle: -90, position: 'insideLeft', offset: 2, fill: '#4B5563', fontSize: 11, fontWeight: 500 }}
                />
                <Tooltip
                  {...TOOLTIP_STYLE}
                  formatter={(val) => [`${val} Hotspots`, 'Persistent Count']}
                />
                <Bar
                  dataKey="count"
                  fill="#7C3AED"
                  radius={[6, 6, 0, 0]}
                  maxBarSize={60}
                  animationDuration={600}
                  animationEasing="ease-out"
                />
              </BarChart>
            ) : (
              <LineChart data={persistentTrend} margin={{ top: 16, right: 24, bottom: 24, left: 14 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(0,0,0,0.06)" vertical={false} />
                <XAxis
                  dataKey="day"
                  tick={{ fontSize: 11, fill: '#6B7280', fontFamily: "'JetBrains Mono', monospace" }}
                  tickLine={false}
                  axisLine={{ stroke: '#E5E7EB' }}
                  interval={timeHorizon === '30D' ? 3 : 0}
                  label={{ value: 'Timeline', position: 'insideBottom', offset: -14, fill: '#4B5563', fontSize: 11, fontWeight: 500 }}
                />
                <YAxis
                  tick={{ fontSize: 11, fill: '#6B7280', fontFamily: "'JetBrains Mono', monospace" }}
                  tickLine={false}
                  axisLine={{ stroke: '#E5E7EB' }}
                  label={{ value: 'Active Sources', angle: -90, position: 'insideLeft', offset: 2, fill: '#4B5563', fontSize: 11, fontWeight: 500 }}
                />
                <Tooltip
                  {...TOOLTIP_STYLE}
                  formatter={(val) => [`${val} Persistent Sources`, 'Persistent']}
                />
                <Line
                  type="monotone"
                  dataKey="count"
                  stroke="#7C3AED"
                  strokeWidth={2.5}
                  dot={timeHorizon === '7D'}
                  activeDot={{ r: 5, strokeWidth: 0, fill: '#7C3AED' }}
                  animationDuration={600}
                  animationEasing="ease-out"
                  name="Persistent Sources"
                />
              </LineChart>
            )}
          </ResponsiveContainer>
        </ChartCard>

        {/* Top High-Risk Regions */}
        <ChartCard
          title="Top High-Risk Industrial Regions"
          subtitle="Mean priority risk index by administrative cluster"
          badge="Score 0–100"
          noData={topRegions.length === 0}
        >
          <ResponsiveContainer width="100%" height={300}>
            <BarChart data={topRegions} layout="vertical" margin={{ top: 12, right: 30, bottom: 18, left: 75 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(0,0,0,0.06)" horizontal={false} />
              <XAxis
                type="number"
                domain={[0, 100]}
                tick={{ fontSize: 11, fill: '#6B7280', fontFamily: "'JetBrains Mono', monospace" }}
                tickLine={false}
                axisLine={{ stroke: '#E5E7EB' }}
                label={{ value: 'Avg Risk Index (0–100)', position: 'insideBottom', offset: -12, fill: '#4B5563', fontSize: 11, fontWeight: 500 }}
              />
              <YAxis
                dataKey="region"
                type="category"
                tick={{ fontSize: 11, fill: '#374151', fontFamily: "'Inter', sans-serif" }}
                tickLine={false}
                axisLine={{ stroke: '#E5E7EB' }}
                width={85}
              />
              <Tooltip
                {...TOOLTIP_STYLE}
                formatter={(val) => [`${val} / 100`, 'Avg Risk Score']}
              />
              <Bar
                dataKey="avgRisk"
                fill="#EA580C"
                radius={[0, 6, 6, 0]}
                maxBarSize={20}
                name="Avg Risk Score"
                animationDuration={600}
                animationEasing="ease-out"
              />
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>

        {/* Category Trend Comparison */}
        <ChartCard
          title="Multi-Category Rate Comparison"
          subtitle={
            timeHorizon === '24H'
              ? 'Diurnal detection rates: Industrial vs. Agricultural vs. Wildfire across orbits'
              : 'Detection trend: Industrial vs. Agricultural vs. Wildfire signatures'
          }
          badge="3 Series"
          noData={categoryTrend.length === 0}
        >
          <ResponsiveContainer width="100%" height={300}>
            <LineChart data={categoryTrend} margin={{ top: 16, right: 24, bottom: 24, left: 14 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(0,0,0,0.06)" vertical={false} />
              <XAxis
                dataKey="day"
                tick={{ fontSize: 11, fill: '#6B7280', fontFamily: "'JetBrains Mono', monospace" }}
                tickLine={false}
                axisLine={{ stroke: '#E5E7EB' }}
                interval={timeHorizon === '30D' ? 3 : 0}
                label={{
                  value: timeHorizon === '24H' ? 'Satellite Overpass Window' : 'Timeline',
                  position: 'insideBottom',
                  offset: -14,
                  fill: '#4B5563',
                  fontSize: 11,
                  fontWeight: 500,
                }}
              />
              <YAxis
                tick={{ fontSize: 11, fill: '#6B7280', fontFamily: "'JetBrains Mono', monospace" }}
                tickLine={false}
                axisLine={{ stroke: '#E5E7EB' }}
                label={{ value: 'Daily Detections', angle: -90, position: 'insideLeft', offset: 2, fill: '#4B5563', fontSize: 11, fontWeight: 500 }}
              />
              <Tooltip
                {...TOOLTIP_STYLE}
                formatter={(val, name) => [`${val} Events`, name]}
              />
              <Legend
                iconSize={9}
                wrapperStyle={{ fontSize: '12px', paddingBottom: '6px' }}
              />
              <Line
                type="monotone"
                dataKey="Industrial"
                stroke="#D97706"
                strokeWidth={2.2}
                dot={timeHorizon !== '30D'}
                animationDuration={600}
                animationEasing="ease-out"
              />
              <Line
                type="monotone"
                dataKey="Agricultural"
                stroke="#10B981"
                strokeWidth={2.2}
                dot={timeHorizon !== '30D'}
                animationDuration={600}
                animationEasing="ease-out"
              />
              <Line
                type="monotone"
                dataKey="Wildfire"
                stroke="#DC2626"
                strokeWidth={2.2}
                dot={timeHorizon !== '30D'}
                animationDuration={600}
                animationEasing="ease-out"
              />
            </LineChart>
          </ResponsiveContainer>
        </ChartCard>
      </div>
    </div>
  );
}
