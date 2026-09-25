import { useEffect, useMemo, useRef } from 'react';
import { Popup, Marker } from 'maplibre-gl';
import { useMap } from './MapCore';
import { filterEvents, useStore } from '../../store/useStore';
import { getRiskColor } from '../../utils/formatters';

const SOURCE_ID = 'hotspots';
const CLUSTER_LAYER = 'clusters';
const CLUSTER_COUNT_LAYER = 'cluster-count';
const UNCLUSTERED_LAYER = 'unclustered-point';
const UNCLUSTERED_GLOW_LAYER = 'unclustered-point-glow';

export default function HotspotLayer() {
  const ctx = useMap();
  const { map, mapReady } = ctx || { map: null, mapReady: false };
  const events = useStore((s) => s.events);
  const filters = useStore((s) => s.filters);
  const timeSliderValue = useStore((s) => s.timeSliderValue);
  const selectEvent = useStore((s) => s.selectEvent);
  const selectedEventId = useStore((s) => s.selectedEventId);
  const getSelectedEvent = useStore((s) => s.getSelectedEvent);
  const predictCoords = useStore((s) => s.predictCoords);

  const popupRef = useRef(null);
  const predictMarkerRef = useRef(null);
  const filteredGeoJson = useMemo(
    () => ({ type: 'FeatureCollection', features: filterEvents(events, filters, timeSliderValue) }),
    [events, filters, timeSliderValue]
  );
  const filteredGeoJsonRef = useRef(filteredGeoJson);

  useEffect(() => {
    filteredGeoJsonRef.current = filteredGeoJson;
  }, [filteredGeoJson]);

  // Smoothly pan to event when selected from lists or search
  useEffect(() => {
    if (!map || !mapReady || !selectedEventId) return;
    const event = getSelectedEvent();
    if (event && event.geometry?.coordinates) {
      const [lng, lat] = event.geometry.coordinates;
      map.flyTo({
        center: [Number(lng), Number(lat)],
        zoom: Math.max(map.getZoom(), 10),
        duration: 1200,
      });
    }
  }, [map, mapReady, selectedEventId, getSelectedEvent]);

  // Render prediction marker pin when user clicks map or types coords
  useEffect(() => {
    if (!map || !mapReady) return;

    if (predictMarkerRef.current) {
      predictMarkerRef.current.remove();
      predictMarkerRef.current = null;
    }

    if (predictCoords && !isNaN(predictCoords.lng) && !isNaN(predictCoords.lat)) {
      const el = document.createElement('div');
      el.className = 'prediction-pin';
      el.innerHTML = `
        <div style="position: relative; width: 32px; height: 32px; display: flex; align-items: center; justify-content: center; cursor: pointer;">
          <div style="position: absolute; width: 32px; height: 32px; border-radius: 50%; background: rgba(59, 130, 246, 0.3); animation: ping 1.5s cubic-bezier(0, 0, 0.2, 1) infinite;"></div>
          <div style="position: absolute; width: 18px; height: 18px; border-radius: 50%; background: #2563EB; border: 2.5px solid #FFFFFF; box-shadow: 0 0 10px rgba(37, 99, 235, 0.8);"></div>
        </div>
      `;

      const marker = new Marker({ element: el })
        .setLngLat([predictCoords.lng, predictCoords.lat])
        .addTo(map);

      predictMarkerRef.current = marker;
    }

    return () => {
      if (predictMarkerRef.current) {
        predictMarkerRef.current.remove();
        predictMarkerRef.current = null;
      }
    };
  }, [map, mapReady, predictCoords]);

  // Attach and manage layers
  useEffect(() => {
    if (!map || !mapReady) return;

    const addLayers = () => {
      try {
        if (!map.isStyleLoaded()) {
          return;
        }
        const data = filteredGeoJsonRef.current;

        // Do not gate local GeoJSON layers on remote raster tile completion.
        // A slow/404 tile source must not suppress fire markers.
        if (!map.getSource(SOURCE_ID)) {
          map.addSource(SOURCE_ID, {
            type: 'geojson',
            data,
            cluster: true,
            clusterMaxZoom: 14,
            clusterRadius: 45,
          });
        } else {
          map.getSource(SOURCE_ID).setData(data);
        }

        // 1. Cluster circles - NASA FIRMS style high-contrast fire gradient
        if (!map.getLayer(CLUSTER_LAYER)) {
          map.addLayer({
            id: CLUSTER_LAYER,
            type: 'circle',
            source: SOURCE_ID,
            filter: ['has', 'point_count'],
            paint: {
              'circle-color': [
                'step', ['get', 'point_count'],
                '#DC2626', 10,
                '#EA580C', 25,
                '#B91C1C',
              ],
              'circle-radius': [
                'step', ['get', 'point_count'],
                16, 10,
                22, 25,
                28,
              ],
              'circle-stroke-width': 2.5,
              'circle-stroke-color': '#FFA39E',
              'circle-opacity': 0.95,
            },
          });
        }

        // 2. Cluster count labels
        if (!map.getLayer(CLUSTER_COUNT_LAYER)) {
          map.addLayer({
            id: CLUSTER_COUNT_LAYER,
            type: 'symbol',
            source: SOURCE_ID,
            filter: ['has', 'point_count'],
            layout: {
              'text-field': '{point_count_abbreviated}',
              'text-font': ['Open Sans Semibold'],
              'text-size': 12,
            },
            paint: {
              'text-color': '#FFFFFF',
            },
          });
        }

        // 3. Unclustered points - Outer soft fire glow aura
        if (!map.getLayer(UNCLUSTERED_GLOW_LAYER)) {
          map.addLayer(
            {
              id: UNCLUSTERED_GLOW_LAYER,
              type: 'circle',
              source: SOURCE_ID,
              filter: ['!', ['has', 'point_count']],
              paint: {
                'circle-color': '#FF2200',
                'circle-radius': [
                  'interpolate', ['linear'], ['zoom'],
                  3, 8,
                  8, 14,
                  14, 22,
                ],
                'circle-opacity': 0.45,
                'circle-blur': 0.7,
              },
            },
            CLUSTER_LAYER
          );
        }

        // 4. Unclustered points - High-contrast vibrant red hotspot dots (NASA FIRMS signature)
        if (!map.getLayer(UNCLUSTERED_LAYER)) {
          map.addLayer({
            id: UNCLUSTERED_LAYER,
            type: 'circle',
            source: SOURCE_ID,
            filter: ['!', ['has', 'point_count']],
            paint: {
              'circle-color': [
                'case',
                ['>=', ['coalesce', ['get', 'risk_score'], 50], 80], '#FF1100',
                ['>=', ['coalesce', ['get', 'risk_score'], 50], 60], '#FF3B30',
                ['>=', ['coalesce', ['get', 'risk_score'], 50], 35], '#FF6B00',
                '#FF8800'
              ],
              'circle-radius': [
                'interpolate', ['linear'], ['zoom'],
                3, 4,
                8, 6.5,
                14, 10,
              ],
              'circle-stroke-width': 1.5,
              'circle-stroke-color': '#FFFFFF',
              'circle-opacity': 0.95,
            },
          });
        }
      } catch (error) {
        if (error?.message !== 'Style is not done loading.') {
          console.warn('HotspotLayer: addLayers error', error);
        }
      }
    };

    addLayers();
    
    // Verify layers were added; if not, schedule retries
    const checkAndRetry = () => {
      const hasClusterLayer = !!map.getLayer(CLUSTER_LAYER);
      const hasUnclusteredLayer = !!map.getLayer(UNCLUSTERED_LAYER);
      const hasSource = !!map.getSource(SOURCE_ID);
      if (!hasClusterLayer || !hasUnclusteredLayer || !hasSource) {
        // Layers missing, will retry
      }
    };
    checkAndRetry();
    
    const retryTimers = [50, 250, 750, 1500, 3000, 6000].map((delay) => setTimeout(() => { addLayers(); checkAndRetry(); }, delay));

    // Reinstall local overlays after a basemap style replacement.
    // Use both 'style.load' (fires on setStyle completion) and 'styledata' 
    // (fires on any style data change) for maximum reliability across MapLibre versions.
    const onStyleLoad = () => {
      addLayers();
      checkAndRetry();
    };
    map.on('style.load', onStyleLoad);
    map.on('styledata', onStyleLoad);

    // Map click handlers for clusters and unclustered hotspots
    const onClusterClick = (e) => {
      const features = map.queryRenderedFeatures(e.point, { layers: [CLUSTER_LAYER] });
      if (!features || features.length === 0) return;
      const clusterId = features[0].properties.cluster_id;
      map.getSource(SOURCE_ID).getClusterExpansionZoom(clusterId, (err, zoom) => {
        if (err) return;
        map.flyTo({ center: features[0].geometry.coordinates, zoom, duration: 800 });
      });
    };

    const onHotspotClick = (e) => {
      if (!e.features || e.features.length === 0) return;
      const feature = e.features[0];
      const p = feature.properties || {};
      const coords = feature.geometry.coordinates.slice();

      if (popupRef.current) popupRef.current.remove();

      const confVal = Math.round(Number(p.confidence || 75));
      const riskVal = Math.round(Number(p.risk_score || confVal));
      const category = p.category || (typeof p.classification === 'string' ? p.classification : p.classification?.category) || 'Thermal Hotspot';
      const riskTier = p.risk_tier || (riskVal >= 80 ? 'Critical' : riskVal >= 60 ? 'High' : 'Moderate');
      const frpVal = p.frp != null ? Number(p.frp).toFixed(1) : '—';
      const brightVal = p.brightness_temp != null ? Number(p.brightness_temp).toFixed(1) : (p.brightness != null ? Number(p.brightness).toFixed(1) : '—');

      let osmData = {};
      try {
        osmData = typeof p.osm_context === 'string' ? JSON.parse(p.osm_context || '{}') : (p.osm_context || p.industrial_context || {});
      } catch {
        osmData = p.osm_context || p.industrial_context || {};
      }
      const isInd = Boolean(p.is_industrial ?? osmData.is_industrial);
      const rawDist = p.nearest_industrial_distance_m ?? osmData.nearest_industrial_distance_m;
      const indDistance = rawDist != null ? Math.round(Number(rawDist)) : null;
      const facilityName = p.nearest_facility_name || osmData.name || osmData.facility_name;
      const osmSummary = isInd
        ? `🏭 Industrial zone ${facilityName ? `· ${facilityName}` : ''} ${indDistance != null ? `(${indDistance}m)` : ''}`
        : (indDistance != null && indDistance < 5000 ? `🏭 Industry ${indDistance}m away` : 'No industrial zone nearby (>2km buffer)');

      const landCoverStr = p.land_cover_type ? p.land_cover_type.replace(/_/g, ' ') : (p.land_cover || 'Regional');
      const ndviStr = p.ndvi_value != null ? `NDVI ${Number(p.ndvi_value).toFixed(2)}` : null;

      const popup = new Popup({
        closeButton: true,
        closeOnClick: false,
        maxWidth: '300px',
        offset: 14,
        className: 'firms-dark-popup',
      })
        .setLngLat(coords)
        .setHTML(`
          <div style="padding: 14px; font-family: 'Inter', sans-serif; background: #0F172A; color: #F8FAFC; border-radius: 8px; border: 1px solid #334155; box-shadow: 0 10px 25px -5px rgba(0,0,0,0.5);">
            <div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 8px;">
              <span style="font-family: 'JetBrains Mono', monospace; font-size: 13px; font-weight: 700; color: #F1F5F9;">${p.id || 'HOTSPOT'}</span>
              <span style="padding: 2px 7px; font-size: 10px; font-weight: 700; border-radius: 4px; text-transform: uppercase; color: #FFFFFF; background: ${getRiskColor(riskTier)};">
                ${riskTier} (${riskVal})
              </span>
            </div>

            <div style="font-size: 12px; font-weight: 600; color: #E2E8F0; margin-bottom: 8px; display: flex; align-items: center; gap: 6px;">
              <span style="width: 8px; height: 8px; border-radius: 50%; background: #EF4444; box-shadow: 0 0 6px #EF4444;"></span>
              ${category}
            </div>

            <!-- Multi-Source Context Badges -->
            <div style="display: flex; flex-direction: column; gap: 4px; margin-bottom: 10px;">
              <div style="font-size: 10px; font-weight: 600; padding: 4px 7px; border-radius: 4px; background: ${isInd ? 'rgba(245, 158, 11, 0.15)' : 'rgba(100, 116, 139, 0.2)'}; color: ${isInd ? '#FBBF24' : '#94A3B8'}; border: 1px solid ${isInd ? 'rgba(245, 158, 11, 0.3)' : 'rgba(100, 116, 139, 0.3)'};">
                ${osmSummary}
              </div>
              <div style="font-size: 10px; font-weight: 500; padding: 4px 7px; border-radius: 4px; background: rgba(16, 185, 129, 0.12); color: #34D399; border: 1px solid rgba(16, 185, 129, 0.25);">
                🛰️ Land cover: ${landCoverStr} ${ndviStr ? `· ${ndviStr}` : ''}
              </div>
            </div>

            <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 8px; font-size: 11px; background: #1E293B; padding: 8px; border-radius: 6px; margin-bottom: 12px;">
              <div>
                <span style="color: #94A3B8;">Confidence:</span>
                <div style="font-family: 'JetBrains Mono', monospace; font-weight: 600; color: #F8FAFC;">${confVal}%</div>
              </div>
              <div>
                <span style="color: #94A3B8;">FRP:</span>
                <div style="font-family: 'JetBrains Mono', monospace; font-weight: 600; color: #F8FAFC;">${frpVal} MW</div>
              </div>
              <div>
                <span style="color: #94A3B8;">Brightness:</span>
                <div style="font-family: 'JetBrains Mono', monospace; font-weight: 600; color: #F8FAFC;">${brightVal} K</div>
              </div>
              <div>
                <span style="color: #94A3B8;">Coords:</span>
                <div style="font-family: 'JetBrains Mono', monospace; font-size: 10px; color: #94A3B8;">${Number(coords[1]).toFixed(3)}, ${Number(coords[0]).toFixed(3)}</div>
              </div>
            </div>

            <button
              onclick="window.__thermosSelectEvent('${p.id}')"
              style="width: 100%; padding: 7px 0; font-size: 12px; font-weight: 600; background: #EF4444; border: none; border-radius: 6px; cursor: pointer; color: #FFFFFF; transition: background 0.15s;"
            >
              Analyze Hotspot →
            </button>
          </div>
        `)
        .addTo(map);

      popupRef.current = popup;
      selectEvent(p.id);
    };

    map.on('click', CLUSTER_LAYER, onClusterClick);
    map.on('click', UNCLUSTERED_LAYER, onHotspotClick);

    map.on('mouseenter', CLUSTER_LAYER, () => { map.getCanvas().style.cursor = 'pointer'; });
    map.on('mouseleave', CLUSTER_LAYER, () => { map.getCanvas().style.cursor = ''; });
    map.on('mouseenter', UNCLUSTERED_LAYER, () => { map.getCanvas().style.cursor = 'pointer'; });
    map.on('mouseleave', UNCLUSTERED_LAYER, () => { map.getCanvas().style.cursor = ''; });

    return () => {
      console.debug('[HotspotLayer] Cleanup running');
      retryTimers.forEach(clearTimeout);
      if (popupRef.current) popupRef.current.remove();
      map.off('click', CLUSTER_LAYER, onClusterClick);
      map.off('click', UNCLUSTERED_LAYER, onHotspotClick);
      map.off('style.load', onStyleLoad);
      map.off('styledata', onStyleLoad);
      try {
        if (map.getLayer(CLUSTER_COUNT_LAYER)) map.removeLayer(CLUSTER_COUNT_LAYER);
        if (map.getLayer(CLUSTER_LAYER)) map.removeLayer(CLUSTER_LAYER);
        if (map.getLayer(UNCLUSTERED_LAYER)) map.removeLayer(UNCLUSTERED_LAYER);
        if (map.getLayer(UNCLUSTERED_GLOW_LAYER)) map.removeLayer(UNCLUSTERED_GLOW_LAYER);
        if (map.getSource(SOURCE_ID)) map.removeSource(SOURCE_ID);
      } catch {
        // The basemap may be swapping while React unmounts this overlay.
      }
    };
  }, [map, mapReady, selectEvent]);

  // Update source data whenever filtered events change
  useEffect(() => {
    if (!map || !mapReady) return;
    const source = map.getSource(SOURCE_ID);
    if (source) {
      source.setData(filteredGeoJson);
    }
  }, [map, mapReady, filteredGeoJson]);

  // Global handler for popup "Analyze Hotspot" button
  useEffect(() => {
    window.__thermosSelectEvent = (id) => {
      selectEvent(id);
      if (popupRef.current) popupRef.current.remove();
    };
    return () => { delete window.__thermosSelectEvent; };
  }, [selectEvent]);

  return null;
}
