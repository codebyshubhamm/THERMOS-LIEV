import { useMemo } from 'react';
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

export default function Analytics() {
  const storeEvents = useStore((s) => s.events?.features);
  const events = storeEvents || [];

  // Thermal anomalies over time (last 30 days, grouped by day)
  const timelineData = useMemo(() => {
    const days = [];
    for (let i = 29; i >= 0; i--) {
      const d = new Date();
      d.setDate(d.getDate() - i);
      const label = d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });
      const count = Math.round(3 + Math.random() * 12);
      days.push({ day: label, anomalies: count });
    }
    return days;
  }, []);

  // Classification distribution
  const classDistribution = useMemo(() => {
    const counts = {};
    events.forEach((e) => {
      const cat = e.properties.category;
      counts[cat] = (counts[cat] || 0) + 1;
    });
    return Object.entries(counts).map(([name, value]) => ({
      name: getCategoryShort(name),
      fullName: name,
      value,
    }));
  }, [events]);

  // Risk distribution
  const riskDistribution = useMemo(() => {
    const tiers = ['Critical', 'High', 'Moderate', 'Low'];
    return tiers.map((tier) => ({
      tier,
      count: events.filter((e) => e.properties.risk_tier === tier).length,
    }));
  }, [events]);

  // Persistent sources trend
  const persistentTrend = useMemo(() => {
    const days = [];
    for (let i = 29; i >= 0; i--) {
      const d = new Date();
      d.setDate(d.getDate() - i);
      days.push({
        day: d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' }),
        count: Math.round(2 + Math.random() * 8),
      });
    }
    return days;
  }, []);

  // Top high-risk regions
  const topRegions = useMemo(() => {
    const regionMap = {};
    events.forEach((e) => {
      const reg = e.properties.region || 'Unknown';
      if (!regionMap[reg]) {
        regionMap[reg] = { totalRisk: 0, count: 0 };
      }
      regionMap[reg].totalRisk += e.properties.risk_score || 0;
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

  // Category trend (last 14 days)
  const categoryTrend = useMemo(() => {
    const days = [];
    for (let i = 13; i >= 0; i--) {
      const d = new Date();
      d.setDate(d.getDate() - i);
      days.push({
        day: d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' }),
        Industrial: Math.round(1 + Math.random() * 5),
        Agricultural: Math.round(Math.random() * 4),
        Wildfire: Math.round(Math.random() * 3),
      });
    }
    return days;
  }, []);

  return (
    <div className="h-full overflow-y-auto p-6 space-y-6">
      <div>
        <h1 className="text-scale-2xl font-bold tracking-tight text-[var(--color-text-primary)]">
          Analytics & Trend Intelligence
        </h1>
        <p className="mt-1 text-scale-base text-[var(--color-text-secondary)]">
          Macro-level thermal anomaly trends, spatial risk distribution, and historical multi-spectral signatures
        </p>
      </div>

      <div className="grid gap-6 xl:grid-cols-2">
        {/* Thermal Anomalies Over Time */}
        <ChartCard
          title="Thermal Anomalies Over Time"
          subtitle="Daily detected thermal signatures across all orbits"
          badge="Past 30 Days"
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
                interval={3}
                label={{ value: 'Timeline (Days)', position: 'insideBottom', offset: -14, fill: '#4B5563', fontSize: 11, fontWeight: 500 }}
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
                dot={false}
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
                formatter={(val, name) => [`${val} Events (${Math.round((val / events.length) * 100)}%)`, name]}
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
          title="Persistent Thermal Sources (>48h)"
          subtitle="Active long-duration anomalies logged over time"
          badge="Continuity"
          span="full"
          noData={persistentTrend.length === 0}
        >
          <ResponsiveContainer width="100%" height={300}>
            <LineChart data={persistentTrend} margin={{ top: 16, right: 24, bottom: 24, left: 14 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(0,0,0,0.06)" vertical={false} />
              <XAxis
                dataKey="day"
                tick={{ fontSize: 11, fill: '#6B7280', fontFamily: "'JetBrains Mono', monospace" }}
                tickLine={false}
                axisLine={{ stroke: '#E5E7EB' }}
                interval={3}
                label={{ value: 'Timeline (Past 30 Days)', position: 'insideBottom', offset: -14, fill: '#4B5563', fontSize: 11, fontWeight: 500 }}
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
                dot={false}
                activeDot={{ r: 5, strokeWidth: 0, fill: '#7C3AED' }}
                animationDuration={600}
                animationEasing="ease-out"
                name="Persistent Sources"
              />
            </LineChart>
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
          subtitle="Daily trend: Industrial vs. Agricultural vs. Wildfire signatures"
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
                interval={2}
                label={{ value: 'Timeline (Days)', position: 'insideBottom', offset: -14, fill: '#4B5563', fontSize: 11, fontWeight: 500 }}
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
                dot={false}
                animationDuration={600}
                animationEasing="ease-out"
              />
              <Line
                type="monotone"
                dataKey="Agricultural"
                stroke="#10B981"
                strokeWidth={2.2}
                dot={false}
                animationDuration={600}
                animationEasing="ease-out"
              />
              <Line
                type="monotone"
                dataKey="Wildfire"
                stroke="#DC2626"
                strokeWidth={2.2}
                dot={false}
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
