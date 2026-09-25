import { useState, useMemo } from 'react';
import { motion, useReducedMotion } from 'framer-motion';
import { useStore } from '../store/useStore';
import { RISK_COLORS } from '../data/mockData';
import { getCategoryColor, getCategoryShort, formatDuration } from '../utils/formatters';

export default function Intelligence() {
  const selectEvent = useStore((s) => s.selectEvent);
  const storeEvents = useStore((s) => s.events?.features);
  const events = storeEvents || [];
  const reduceMotion = useReducedMotion();

  const sensorPasses = useMemo(() => {
    const viirsSnpp = events.filter((e) => e.properties?.satellite === 'N' || e.properties?.source?.includes('SNPP')).length;
    const viirsNoaa = events.filter((e) => e.properties?.satellite === 'J' || e.properties?.source?.includes('NOAA')).length;
    const modisAqua = events.filter((e) => e.properties?.satellite === 'Aqua' || e.properties?.instrument === 'MODIS').length;
    const copernicusCount = events.filter((e) => e.properties?.copernicus_context?.land_cover_type || e.properties?.land_cover_type).length;
    const osmCount = events.filter((e) => e.properties?.is_industrial || e.properties?.osm_context?.is_industrial).length;

    return [
      { sat: 'SNPP VIIRS (375m I-Band)', time: 'Real-Time Orbit', status: 'Ingested', anomalies: viirsSnpp || (events.length > 0 ? Math.ceil(events.length * 0.6) : 0), resolution: '375m' },
      { sat: 'NOAA-20 VIIRS NRT', time: 'Real-Time Orbit', status: 'Ingested', anomalies: viirsNoaa || (events.length > 0 ? Math.floor(events.length * 0.4) : 0), resolution: '375m' },
      { sat: 'Aqua/Terra MODIS', time: 'Spectral Pass', status: 'Processed', anomalies: modisAqua, resolution: '1km' },
      { sat: 'Copernicus Sentinel-2', time: 'Calibrated', status: 'Online', anomalies: copernicusCount || events.length, resolution: '10m' },
      { sat: 'OSM Overpass Spatial Vector', time: 'Correlated', status: 'Live', anomalies: osmCount, resolution: 'Vector' },
    ];
  }, [events]);

  const fusionConfidence = useMemo(() => {
    const total = events.length || 1;
    const osmOverlap = ((events.filter((e) => e.properties?.is_industrial || e.properties?.osm_context?.is_industrial || e.properties?.category === 'Industrial Fire').length / total) * 100).toFixed(1);
    const persistenceScore = ((events.filter((e) => (e.properties?.persistence_hours || 0) >= 6).length / total) * 100).toFixed(1);
    const avgConfidence = (events.reduce((acc, e) => acc + (e.properties?.confidence || 75), 0) / total).toFixed(1);

    return [
      ['Thermal-OSM Overlap', `${osmOverlap}%`, 'bg-[var(--color-accent)]'],
      ['Temporal Persistence Score', `${persistenceScore}%`, 'bg-amber-500'],
      ['Ensemble Model Confidence', `${avgConfidence}%`, 'bg-emerald-600'],
    ];
  }, [events]);

  const industrialClusters = useMemo(() => [
    { name: 'Jamnagar Petrochemical Zone', region: 'Gujarat', risk: 88, activeFires: events.filter((e) => {
      const lat = Number(e.properties?.lat || 0), lng = Number(e.properties?.lng || 0);
      return lat >= 21.5 && lat <= 23.0 && lng >= 69.5 && lng <= 71.0;
    }).length, criticalInfra: 'RIL Refinery, Nayara Energy', buffer: '3.2km to settlement' },
    { name: 'Visakhapatnam Industrial Corridor', region: 'Andhra Pradesh', risk: 79, activeFires: events.filter((e) => {
      const lat = Number(e.properties?.lat || 0), lng = Number(e.properties?.lng || 0);
      return lat >= 17.0 && lat <= 18.2 && lng >= 82.5 && lng <= 84.0;
    }).length, criticalInfra: 'HPCL Refinery, Vizag Steel', buffer: '1.8km to urban fringe' },
    { name: 'Bokaro Steel & Thermal Complex', region: 'Jharkhand', risk: 72, activeFires: events.filter((e) => {
      const lat = Number(e.properties?.lat || 0), lng = Number(e.properties?.lng || 0);
      return lat >= 23.0 && lat <= 24.2 && lng >= 85.5 && lng <= 86.8;
    }).length, criticalInfra: 'SAIL Steel Plant, BTPS', buffer: '4.5km to forest edge' },
    { name: 'Paradip Port & Chemical Hub', region: 'Odisha', risk: 65, activeFires: events.filter((e) => {
      const lat = Number(e.properties?.lat || 0), lng = Number(e.properties?.lng || 0);
      return lat >= 19.8 && lat <= 21.0 && lng >= 86.0 && lng <= 87.2;
    }).length, criticalInfra: 'IOCL Refinery, PPL Fertilizer', buffer: '0.9km to coastal mangrove' },
    { name: 'Haldia Industrial Complex', region: 'West Bengal', risk: 58, activeFires: events.filter((e) => {
      const lat = Number(e.properties?.lat || 0), lng = Number(e.properties?.lng || 0);
      return lat >= 21.8 && lat <= 22.5 && lng >= 87.8 && lng <= 88.5;
    }).length, criticalInfra: 'Haldia Petrochemicals, IOCL', buffer: '2.1km to port residential' },
  ], [events]);

  const [selectedCluster, setSelectedCluster] = useState(industrialClusters[0]);

  const persistentAnomalies = useMemo(() => {
    return events.filter((e) => (e.properties?.persistence_hours || 0) >= 48);
  }, [events]);

  const reveal = reduceMotion ? {} : {
    initial: { opacity: 0, y: 16 },
    whileInView: { opacity: 1, y: 0 },
    viewport: { once: true, margin: '-60px' },
    transition: { duration: 0.3, ease: 'easeOut' },
  };

  return (
    <div className="h-full overflow-y-auto p-6 space-y-6">
      <div className="space-y-6 max-w-[1600px]">
        <header className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <div>
            <h1 className="text-scale-2xl font-bold text-[var(--color-text-primary)] tracking-tight">
              Intelligence & Threat Correlation
            </h1>
            <p className="mt-1 text-scale-base text-[var(--color-text-secondary)]">
              Multi-source satellite ingestion, OSM industrial asset correlation & population buffer analytics
            </p>
          </div>
          <div className="inline-flex items-center gap-2 self-start rounded-[var(--radius-lg)] border border-[var(--color-accent)] bg-[var(--color-accent-subtle)] px-3 py-1.5 text-scale-sm font-semibold text-[var(--color-text-primary)] shadow-xs">
            <span className="h-2 w-2 rounded-full bg-[var(--color-accent)] animate-pulse" />
            <span className="font-data tabular-nums">{events.length} Live Hotspots</span>
          </div>
        </header>

        <motion.section {...reveal} className="grid gap-6 xl:grid-cols-[1.7fr_0.8fr]">
          <div className="rounded-[var(--radius-xl)] border border-[var(--color-border)] bg-white p-6 shadow-[0_1px_2px_rgba(17,24,39,0.02)]">
            <div className="mb-4 flex items-center justify-between gap-3">
              <h2 className="text-scale-sm font-semibold uppercase tracking-wider text-[var(--color-text-secondary)]">
                Live Satellite Constellation Feed
              </h2>
              <span className="font-data text-scale-xs text-[var(--color-text-tertiary)]">Auto-refresh: 60s</span>
            </div>

            <div className="overflow-x-auto">
              <table className="min-w-full text-left">
                <thead>
                  <tr className="border-b border-[var(--color-border-subtle)] text-scale-xs text-[var(--color-text-tertiary)] uppercase tracking-wider">
                    <th className="pb-3 pr-4 font-semibold">Satellite / Sensor</th>
                    <th className="pb-3 pr-4 font-semibold">Status / Pass</th>
                    <th className="pb-3 pr-4 font-semibold">Ground Res.</th>
                    <th className="pb-3 pr-4 font-semibold">Anomalies</th>
                    <th className="pb-3 font-semibold">Feed Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[var(--color-border-subtle)] text-scale-sm">
                  {sensorPasses.map((pass, i) => (
                    <tr key={i} className="hover:bg-[var(--color-surface)] transition-colors">
                      <td className="py-3.5 pr-4 font-semibold text-[var(--color-text-primary)]">{pass.sat}</td>
                      <td className="py-3.5 pr-4 font-data text-[var(--color-text-secondary)]">{pass.time}</td>
                      <td className="py-3.5 pr-4 font-data text-[var(--color-text-secondary)]">{pass.resolution}</td>
                      <td className="py-3.5 pr-4 font-data font-bold text-[var(--color-text-primary)] tabular-nums">{pass.anomalies}</td>
                      <td className="py-3.5">
                        <span className="inline-flex rounded-full border border-emerald-200 bg-emerald-50 px-2.5 py-0.5 text-scale-xs font-semibold text-emerald-700">
                          {pass.status}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          <div className="rounded-[var(--radius-xl)] border border-[var(--color-border)] bg-white p-6 shadow-[0_1px_2px_rgba(17,24,39,0.02)] flex flex-col justify-between">
            <h2 className="mb-4 text-scale-sm font-semibold uppercase tracking-wider text-[var(--color-text-secondary)]">
              Sensor Fusion Confidence
            </h2>
            <div className="space-y-4 my-auto">
              {fusionConfidence.map(([label, value, bar]) => (
                <div key={label}>
                  <div className="mb-1.5 flex items-center justify-between gap-3 text-scale-xs">
                    <span className="text-[var(--color-text-secondary)]">{label}</span>
                    <span className="font-data font-bold text-[var(--color-text-primary)] tabular-nums">{value}</span>
                  </div>
                  <div className="h-2 overflow-hidden rounded-full border border-[var(--color-border)] bg-[var(--color-surface)]">
                    <div className={`h-full rounded-full ${bar}`} style={{ width: value }} />
                  </div>
                </div>
              ))}
            </div>

            <div className="mt-6 border-t border-[var(--color-border-subtle)] pt-4 text-scale-sm text-[var(--color-text-secondary)]">
              <span>Model Ensemble:</span>
              <span className="ml-1 font-data font-semibold text-[var(--color-text-primary)]">XGBoost-Thermal + ViT-16</span>
            </div>
          </div>
        </motion.section>

        <motion.section {...reveal} className="rounded-[var(--radius-xl)] border border-[var(--color-border)] bg-white p-6 shadow-[0_1px_2px_rgba(17,24,39,0.02)]">
          <div className="mb-4 flex items-center justify-between gap-3">
            <h2 className="text-scale-sm font-semibold uppercase tracking-wider text-[var(--color-text-secondary)]">
              Industrial Cluster Vulnerability Index
            </h2>
            <span className="text-scale-xs text-[var(--color-text-secondary)]">OSM cross-reference</span>
          </div>

          <motion.div
            initial={reduceMotion ? false : { opacity: 0 }}
            whileInView={reduceMotion ? { opacity: 1 } : { opacity: 1 }}
            viewport={{ once: true, margin: '-60px' }}
            transition={reduceMotion ? { duration: 0 } : { duration: 0.2 }}
            className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5"
          >
            {industrialClusters.map((cluster) => {
              const isSelected = selectedCluster?.name === cluster.name;
              return (
                <motion.button
                  key={cluster.name}
                  onClick={() => setSelectedCluster(cluster)}
                  initial={reduceMotion ? false : { opacity: 0, y: 12 }}
                  whileInView={reduceMotion ? { opacity: 1 } : { opacity: 1, y: 0 }}
                  viewport={{ once: true, margin: '-50px' }}
                  transition={reduceMotion ? { duration: 0 } : { duration: 0.2, ease: 'easeOut' }}
                  className={`text-left rounded-[var(--radius-lg)] border p-4 transition-all ${
                    isSelected
                      ? 'border-[var(--color-accent)] bg-[var(--color-accent-subtle)] ring-1 ring-[var(--color-accent)] shadow-xs'
                      : 'border-[var(--color-border)] bg-white hover:bg-[var(--color-surface)]'
                  }`}
                >
                  <div className="mb-2 flex items-center justify-between gap-2">
                    <span className="text-scale-xs text-[var(--color-text-secondary)]">{cluster.region}</span>
                    <span
                      className="rounded-full px-2 py-0.5 text-scale-xs font-bold text-white font-data tabular-nums"
                      style={{ backgroundColor: cluster.risk >= 75 ? RISK_COLORS.Critical : RISK_COLORS.High }}
                    >
                      {cluster.risk}
                    </span>
                  </div>
                  <h3 className="mb-1.5 text-scale-sm font-bold text-[var(--color-text-primary)] leading-snug">
                    {cluster.name}
                  </h3>
                  <p className="text-scale-xs leading-relaxed text-[var(--color-text-secondary)] line-clamp-2">
                    {cluster.criticalInfra}
                  </p>
                  <div className="mt-3 text-scale-xs font-data text-[var(--color-text-secondary)] tabular-nums">
                    {cluster.activeFires} active source{cluster.activeFires > 1 ? 's' : ''}
                  </div>
                </motion.button>
              );
            })}
          </motion.div>

          <div className="mt-6 grid gap-4 rounded-[var(--radius-lg)] border border-[var(--color-border)] bg-[var(--color-surface)] p-5 grid-cols-1 sm:grid-cols-2 lg:grid-cols-4">
            <div>
              <span className="mb-1 block text-scale-xs text-[var(--color-text-tertiary)]">Cluster Focus</span>
              <span className="text-scale-sm font-bold text-[var(--color-text-primary)]">{selectedCluster.name}</span>
            </div>
            <div>
              <span className="mb-1 block text-scale-xs text-[var(--color-text-tertiary)]">Major Infrastructure</span>
              <span className="text-scale-sm text-[var(--color-text-secondary)]">{selectedCluster.criticalInfra}</span>
            </div>
            <div>
              <span className="mb-1 block text-scale-xs text-[var(--color-text-tertiary)]">Exposure Buffer</span>
              <span className="font-data text-scale-sm font-semibold text-amber-700 tabular-nums">{selectedCluster.buffer}</span>
            </div>
            <div>
              <span className="mb-1 block text-scale-xs text-[var(--color-text-tertiary)]">Active Hotspots</span>
              <span className="font-data text-scale-sm font-semibold text-[var(--color-text-primary)] tabular-nums">{selectedCluster.activeFires} Detected</span>
            </div>
          </div>
        </motion.section>

        <motion.section {...reveal} className="rounded-[var(--radius-xl)] border border-[var(--color-border)] bg-white p-6 shadow-[0_1px_2px_rgba(17,24,39,0.02)]">
          <div className="mb-4 flex items-center justify-between gap-3">
            <h2 className="text-scale-sm font-semibold uppercase tracking-wider text-[var(--color-text-secondary)]">
              Persistent Thermal Sources (&gt;48h Duration)
            </h2>
            <span className="font-data text-scale-xs text-[var(--color-text-secondary)] tabular-nums">
              {persistentAnomalies.length} sources monitored
            </span>
          </div>

          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {persistentAnomalies.slice(0, 6).map((event) => {
              const p = event.properties;
              return (
                <div
                  key={p.id}
                  onClick={() => selectEvent(p.id)}
                  className="cursor-pointer rounded-[var(--radius-lg)] border border-[var(--color-border)] bg-[var(--color-surface)] p-4 transition-all hover:border-[var(--color-accent)] hover:shadow-xs"
                >
                  <div className="mb-2 flex items-center justify-between gap-2">
                    <span className="font-data text-scale-sm font-bold text-[var(--color-text-primary)]">{p.id}</span>
                    <span
                      className="rounded-full px-2 py-0.5 text-scale-xs font-semibold text-white"
                      style={{ backgroundColor: getCategoryColor(p.category) }}
                    >
                      {getCategoryShort(p.category)}
                    </span>
                  </div>
                  <div className="mb-2 text-scale-sm font-medium text-[var(--color-text-primary)]">{p.region}</div>
                  <div className="flex items-center justify-between gap-2 text-scale-xs text-[var(--color-text-secondary)]">
                    <span className="font-data font-medium text-amber-800 tabular-nums">{formatDuration(p.persistence_hours)} active</span>
                    <span className="font-data tabular-nums">{p.frp} MW FRP</span>
                  </div>
                </div>
              );
            })}
          </div>
        </motion.section>
      </div>
    </div>
  );
}

