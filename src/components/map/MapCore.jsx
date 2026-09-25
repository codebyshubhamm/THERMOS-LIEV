import { useRef, useEffect, useState, createContext, useContext, useCallback } from 'react';
import { Map as MapLibreMap, NavigationControl, AttributionControl, setWorkerCount, setWorkerUrl } from 'maplibre-gl';
import mapLibreWorkerUrl from 'maplibre-gl/dist/maplibre-gl-worker.mjs?url';
import 'maplibre-gl/dist/maplibre-gl.css';
import { useStore } from '../../store/useStore';

setWorkerUrl(mapLibreWorkerUrl);
setWorkerCount(1);

// The optional FIRMS raster endpoint is only added when a real tile URL is
// configured. A relative Vercel path would return 404 and can prevent custom
// GeoJSON overlays from being installed.
const FIRMS_TILE_URL = import.meta.env.VITE_THERMOS_FIRMS_TILE_URL?.trim();
const FIRMS_RASTER_SOURCE = FIRMS_TILE_URL
  ? {
      firms_wms_fires: {
        type: 'raster',
        tiles: [FIRMS_TILE_URL],
        tileSize: 256,
        attribution: '&copy; NASA FIRMS Active Fire System',
      },
    }
  : {};
const FIRMS_RASTER_LAYERS = FIRMS_TILE_URL
  ? [
      {
        id: 'firms-wms-fires-tiles',
        type: 'raster',
        source: 'firms_wms_fires',
        paint: {
          'raster-opacity': 0.92,
        },
      },
    ]
  : [];

const MapContext = createContext(null);
export const useMap = () => useContext(MapContext);

export const BASEMAP_STYLES = {
  nasa_firms: {
    version: 8,
    name: 'NASA FIRMS Official GIBS',
    glyphs: 'https://fonts.openmaptiles.org/{fontstack}/{range}.pbf',
    sources: {
      nasa_blue_marble: {
        type: 'raster',
        tiles: [
          'https://gibs.earthdata.nasa.gov/wmts/epsg3857/best/BlueMarble_ShadedRelief_Bathymetry/default/GoogleMapsCompatible_Level8/{z}/{y}/{x}.jpeg',
        ],
        tileSize: 256,
        maxzoom: 8,
        attribution: '&copy; NASA Earth Science Data and Information System (ESDIS) / GIBS',
      },
      esri_satellite_hi: {
        type: 'raster',
        tiles: [
          'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
        ],
        tileSize: 256,
        minzoom: 8,
        maxzoom: 18,
        attribution: '&copy; Esri &mdash; Earthstar Geographics',
      },
      ...FIRMS_RASTER_SOURCE,
      carto_labels: {
        type: 'raster',
        tiles: [
          'https://server.arcgisonline.com/ArcGIS/rest/services/Reference/World_Boundaries_and_Places/MapServer/tile/{z}/{y}/{x}',
        ],
        tileSize: 256,
        attribution: '&copy; Esri &mdash; Boundaries & Places',
      },
    },
    layers: [
      {
        id: 'background',
        type: 'background',
        paint: {
          'background-color': '#030b18',
        },
      },
      {
        id: 'nasa-gibs-tiles',
        type: 'raster',
        source: 'nasa_blue_marble',
        maxzoom: 9,
        paint: {
          'raster-opacity': 1.0,
        },
      },
      {
        id: 'esri-hi-res-tiles',
        type: 'raster',
        source: 'esri_satellite_hi',
        minzoom: 8,
        paint: {
          'raster-opacity': 1.0,
        },
      },
      ...FIRMS_RASTER_LAYERS,
      {
        id: 'country-boundaries-labels',
        type: 'raster',
        source: 'carto_labels',
        paint: {
          'raster-opacity': 0.85,
        },
      },
    ],
  },
  nasa_night: {
    version: 8,
    name: 'NASA Black Marble (Earth at Night)',
    glyphs: 'https://fonts.openmaptiles.org/{fontstack}/{range}.pbf',
    sources: {
      nasa_black_marble: {
        type: 'raster',
        tiles: [
          'https://gibs.earthdata.nasa.gov/wmts/epsg3857/best/VIIRS_Black_Marble/default/2016-01-01/GoogleMapsCompatible_Level8/{z}/{y}/{x}.png',
        ],
        tileSize: 256,
        attribution: '&copy; NASA GIBS Black Marble',
      },
      ...FIRMS_RASTER_SOURCE,
      carto_labels: {
        type: 'raster',
        tiles: [
          'https://server.arcgisonline.com/ArcGIS/rest/services/Reference/World_Boundaries_and_Places/MapServer/tile/{z}/{y}/{x}',
        ],
        tileSize: 256,
        attribution: '&copy; Esri &mdash; Boundaries & Places',
      },
    },
    layers: [
      {
        id: 'background',
        type: 'background',
        paint: { 'background-color': '#000000' },
      },
      {
        id: 'nasa-black-marble-tiles',
        type: 'raster',
        source: 'nasa_black_marble',
        paint: { 'raster-opacity': 1.0 },
      },
      ...FIRMS_RASTER_LAYERS,
      {
        id: 'carto-labels-night',
        type: 'raster',
        source: 'carto_labels',
        paint: { 'raster-opacity': 0.75 },
      },
    ],
  },
  dark: {
    version: 8,
    name: 'Esri Dark Gray Canvas',
    glyphs: 'https://fonts.openmaptiles.org/{fontstack}/{range}.pbf',
    sources: {
      esri_dark: {
        type: 'raster',
        tiles: [
          'https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Dark_Gray_Base/MapServer/tile/{z}/{y}/{x}',
        ],
        tileSize: 256,
        attribution: '&copy; Esri &mdash; Dark Canvas Base',
      },
      esri_dark_labels: {
        type: 'raster',
        tiles: [
          'https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Dark_Gray_Reference/MapServer/tile/{z}/{y}/{x}',
        ],
        tileSize: 256,
        attribution: '&copy; Esri &mdash; Dark Canvas Reference',
      },
    },
    layers: [
      {
        id: 'background',
        type: 'background',
        paint: {
          'background-color': '#0a0e17',
        },
      },
      {
        id: 'base-tiles',
        type: 'raster',
        source: 'esri_dark',
        paint: {
          'raster-opacity': 1.0,
        },
      },
      {
        id: 'dark-labels',
        type: 'raster',
        source: 'esri_dark_labels',
        paint: {
          'raster-opacity': 0.85,
        },
      },
    ],
  },
  satellite: {
    version: 8,
    name: 'Esri World Imagery',
    glyphs: 'https://fonts.openmaptiles.org/{fontstack}/{range}.pbf',
    sources: {
      esri_sat: {
        type: 'raster',
        tiles: [
          'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
        ],
        tileSize: 256,
        attribution: '&copy; Esri &mdash; Earthstar Geographics',
      },
    },
    layers: [
      {
        id: 'background',
        type: 'background',
        paint: {
          'background-color': '#030712',
        },
      },
      {
        id: 'base-tiles',
        type: 'raster',
        source: 'esri_sat',
        paint: {
          'raster-opacity': 1.0,
        },
      },
    ],
  },
};

export default function MapCore({ children }) {
  const containerRef = useRef(null);
  const mapRef = useRef(null);
  const readyRef = useRef(false);
  const [mapInstance, setMapInstance] = useState(null);
  const [mapReady, setMapReady] = useState(false);
  const [error, setError] = useState(null);
  const [basemap, setBasemap] = useState('nasa_firms'); // Defaults to official NASA FIRMS GIBS map!
  const [viewCoords, setViewCoords] = useState({ lat: 22.5937, lng: 78.9629, zoom: 4.5 });

  useEffect(() => {
    if (mapRef.current || !containerRef.current) return;

    let timeoutId = null;

    const markReady = () => {
      if (readyRef.current) return;
      readyRef.current = true;
      setMapInstance(mapRef.current);
      setMapReady(true);
    };

    const handleError = (event) => {
      const message = event?.error?.message || 'Map style or tile source notice';
      console.warn('MapCore: tile warning', { message });
    };

    const initMap = () => {
      try {
        const node = containerRef.current;
        const style = BASEMAP_STYLES.nasa_firms;

        // The operational event feed is India-centric, so open on the active
        // thermal corridor. The FIRMS Global control still provides world view.
        const map = new MapLibreMap({
          container: node,
          style,
          center: [78.9629, 22.5937],
          zoom: 4.5,
          maxZoom: 18,
          minZoom: 1.5,
          attributionControl: false,
          preserveDrawingBuffer: true,
        });

        mapRef.current = map;
        // The MapLibre instance is ready for local overlays as soon as the
        // style object is accepted; remote imagery may continue loading.
        markReady();
        // `style.load` does not wait for every raster tile. This lets local
        // GeoJSON overlays render even when an optional remote tile is slow.
        map.once('style.load', markReady);
        map.once('load', markReady);
        map.on('error', handleError);

        // Track live center & zoom coordinates (@lat, lng, zoom)
        map.on('move', () => {
          const c = map.getCenter();
          setViewCoords({
            lat: Number(c.lat.toFixed(2)),
            lng: Number(c.lng.toFixed(2)),
            zoom: Number(map.getZoom().toFixed(1)),
          });
        });

        // Click on map background to run location prediction
        map.on('click', (e) => {
          if (map.getLayer('unclustered-point')) {
            const features = map.queryRenderedFeatures(e.point, {
              layers: ['clusters', 'unclustered-point'].filter((l) => map.getLayer(l)),
            });
            if (features && features.length > 0) return;
          }

          const { lng, lat } = e.lngLat;
          useStore.getState().predictLocation(lat, lng);
        });

        map.addControl(new NavigationControl({ showCompass: false }), 'top-right');
        map.addControl(new AttributionControl({ compact: true }), 'bottom-left');

        timeoutId = setTimeout(() => {
          if (!readyRef.current && mapRef.current) {
            markReady();
          }
        }, 8000);
      } catch (err) {
        console.error('MapCore: initialization exception', err);
        setError('Failed to initialize map: ' + (err.message || 'Unknown error'));
      }
    };

    const checkAndInit = () => {
      const node = containerRef.current;
      if (!node) {
        setTimeout(checkAndInit, 100);
        return;
      }
      if (node.offsetParent === null || (node.offsetHeight === 0 && node.clientHeight === 0)) {
        setTimeout(checkAndInit, 100);
        return;
      }
      initMap();
    };

    checkAndInit();

    return () => {
      if (timeoutId) clearTimeout(timeoutId);
      if (mapRef.current) {
        try {
          mapRef.current.remove();
        } catch (e) {
          console.warn('MapCore: error removing map', e);
        }
        mapRef.current = null;
        readyRef.current = false;
        setMapInstance(null);
        setMapReady(false);
      }
    };
  }, []);

  // Handle switching basemaps
  const changeBasemap = useCallback((mode) => {
    if (!mapRef.current || !BASEMAP_STYLES[mode]) return;
    setBasemap(mode);
    try {
      const newStyle = BASEMAP_STYLES[mode];
      mapRef.current.setStyle(newStyle, { diff: false });
    } catch (e) {
      console.warn('Error setting basemap style', e);
    }
  }, []);

  const toggleBasemap = useCallback(() => {
    if (!mapRef.current) return;
    const modes = ['nasa_firms', 'nasa_night', 'dark', 'satellite'];
    const nextIndex = (modes.indexOf(basemap) + 1) % modes.length;
    changeBasemap(modes[nextIndex]);
  }, [basemap, changeBasemap]);

  const flyTo = useCallback((coords, zoom = 12) => {
    if (mapRef.current) {
      mapRef.current.flyTo({ center: coords, zoom, duration: 1500 });
    }
  }, []);

  const fitBounds = useCallback((bounds, padding = 60) => {
    if (mapRef.current) {
      mapRef.current.fitBounds(bounds, { padding, duration: 1200 });
    }
  }, []);

  return (
    <MapContext.Provider
      value={{
        map: mapInstance,
        mapReady,
        flyTo,
        fitBounds,
        toggleBasemap,
        changeBasemap,
        basemap,
        setBasemap,
        viewCoords,
      }}
    >
      <div className="relative w-full h-full min-h-[420px] bg-[#030b18]">
        <div ref={containerRef} className="absolute inset-0 bg-[#030b18]" style={{ height: '100%', minHeight: '420px' }} />

        {!mapReady && !error && (
          <div className="absolute inset-0 z-20 flex items-center justify-center bg-[#030b18]/85 backdrop-blur-sm">
            <div className="text-center">
              <div className="mx-auto mb-2 h-8 w-8 animate-spin rounded-full border-2 border-red-500/20 border-t-red-500" />
              <p className="text-sm font-medium text-slate-200">Loading NASA FIRMS Satellite Map…</p>
            </div>
          </div>
        )}

        {error && (
          <div className="absolute inset-0 z-20 flex items-center justify-center bg-[#030b18] px-6">
            <div className="text-center max-w-sm">
              <div className="mx-auto mb-3 flex h-10 w-10 items-center justify-center rounded-full bg-red-950/60 border border-red-500/30">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#EF4444" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <circle cx="12" cy="12" r="10" />
                  <line x1="15" y1="9" x2="9" y2="15" />
                  <line x1="9" y1="9" x2="15" y2="15" />
                </svg>
              </div>
              <p className="mb-1 text-sm font-semibold text-white">Map Notice</p>
              <p className="text-xs text-gray-400">{error}</p>
            </div>
          </div>
        )}

        {mapReady && children}
      </div>
    </MapContext.Provider>
  );
}
