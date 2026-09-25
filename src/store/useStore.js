import { create } from 'zustand';
import { fetchLiveEvents, predictLocation as apiPredictLocation } from '../services/api';

export const TIME_PRESETS = {
  '24H': [29 / 30, 1],
  '7D': [23 / 30, 1],
  '30D': [0, 1],
};

const TEMPORAL_HORIZON_DAYS = 30;

export function filterEvents(events, filters, timeSliderValue) {
  if (!events || !Array.isArray(events.features)) return [];

  const [startNorm, endNorm] = timeSliderValue || [0, 1];
  const totalDays = TEMPORAL_HORIZON_DAYS;
  const minAgeDays = Math.max(0, (1 - endNorm) * totalDays);
  const maxAgeDays = Math.max(0, (1 - startNorm) * totalDays);
  const now = Date.now();

  return events.features.filter((feature) => {
    const properties = feature.properties || {};
    const detectedAt = properties.first_detected
      ? new Date(properties.first_detected)
      : (properties.acq_date ? new Date(properties.acq_date) : null);
    const ageDays = detectedAt && !isNaN(detectedAt.getTime())
      ? Math.max(0, (now - detectedAt.getTime()) / 86400000)
      : 0;

    // A full-window selection should include events with missing timestamps.
    if (startNorm > 0.05 || endNorm < 0.95) {
      if (ageDays < minAgeDays || ageDays > maxAgeDays) return false;
    }

    if (filters.confidenceMin > 0 && (properties.confidence || 0) < filters.confidenceMin) return false;

    const classification = typeof properties.classification === 'string'
      ? properties.classification
      : properties.classification?.category;
    if (
      filters.categories.length > 0
      && !filters.categories.includes(properties.category)
      && !filters.categories.includes(classification)
    ) return false;

    if (filters.riskTiers.length > 0 && !filters.riskTiers.includes(properties.risk_tier)) return false;

    if (filters.bbox) {
      const { minLng, maxLng, minLat, maxLat } = filters.bbox;
      const lng = Number(properties.lng ?? feature.geometry?.coordinates?.[0] ?? 0);
      const lat = Number(properties.lat ?? feature.geometry?.coordinates?.[1] ?? 0);
      if (lng < minLng || lng > maxLng || lat < minLat || lat > maxLat) return false;
    }

    if (filters.searchQuery) {
      const query = filters.searchQuery.toLowerCase();
      const classificationText = typeof properties.classification === 'string'
        ? properties.classification
        : (properties.classification?.category || '');
      const searchable = `${properties.id || ''} ${properties.region || ''} ${properties.category || ''} ${classificationText} ${properties.land_cover || ''}`.toLowerCase();
      if (!searchable.includes(query)) return false;
    }

    return true;
  });
}

/**
 * Central store — single source of truth for selected event,
 * active filters, map display state, and location predictions.
 */
export const useStore = create((set, get) => ({
  // All events (GeoJSON) - Powered by NASA FIRMS Live Pipeline
  events: {
    type: 'FeatureCollection',
    metadata: { source: 'live' },
    features: [],
  },
  dataSource: 'live',
  loading: true,
  apiError: null,
  hydrateEvents: async () => {
    set({ loading: true, apiError: null });
    try {
      console.info('[useStore] Hydrating live NASA FIRMS events from backend...');
      const events = await fetchLiveEvents();
      const count = events.features?.length || 0;
      const isDemo = events.metadata?.source === 'demo' || events.metadata?.data_mode === 'demo';
      console.info('[useStore] Live events hydrated. Count:', count, '| Source mode:', isDemo ? 'demo' : 'live');
      set({
        events,
        dataSource: isDemo ? 'demo' : 'live',
        loading: false,
      });
    } catch (error) {
      console.error('[useStore] FIRMS live pipeline hydration failed:', error);
      set({ apiError: error.message, loading: false });
    }
  },

  // Selected event (clicked from map/list/anywhere)
  selectedEventId: null,
  selectEvent: (id) => set({ selectedEventId: id, drawerOpen: id !== null }),
  clearSelection: () => set({ selectedEventId: null, drawerOpen: false }),

  // Drawer state
  drawerOpen: false,
  setDrawerOpen: (open) => set({ drawerOpen: open, selectedEventId: open ? get().selectedEventId : null }),

  // Derived: get selected event feature
  getSelectedEvent: () => {
    const { events, selectedEventId } = get();
    if (!selectedEventId) return null;
    return events.features.find((f) => f.properties?.id === selectedEventId || f.id === selectedEventId) || null;
  },

  // Location-based ML prediction feature
  predictCoords: null, // { lat, lng }
  prediction: null,
  predictLoading: false,
  predictError: null,
  setPredictCoords: (coords) => set({ predictCoords: coords }),
  clearPrediction: () => set({ predictCoords: null, prediction: null, predictError: null }),
  predictLocation: async (lat, lng) => {
    set({ predictCoords: { lat, lng }, predictLoading: true, predictError: null });
    try {
      const res = await apiPredictLocation({ latitude: lat, longitude: lng });
      set({ prediction: res, predictLoading: false });
      return res;
    } catch (err) {
      set({ predictError: err.message, predictLoading: false });
      return null;
    }
  },

  // Filters
  filters: {
    confidenceMin: 0,
    dateRange: '30D',
    categories: [],
    riskTiers: [],
    searchQuery: '',
    bbox: null,
  },
  setFilter: (key, value) =>
    set((state) => {
      const filters = { ...state.filters, [key]: value };
      if (key === 'dateRange' && TIME_PRESETS[value]) {
        return {
          filters,
          timeRange: value,
          timeSliderValue: TIME_PRESETS[value],
        };
      }
      return { filters };
    }),
  resetFilters: () =>
    set({
      filters: {
        confidenceMin: 0,
        dateRange: '30D',
        categories: [],
        riskTiers: [],
        searchQuery: '',
        bbox: null,
      },
      timeRange: '30D',
      timeSliderValue: TIME_PRESETS['30D'],
    }),

  // Time range for bottom strip and map window
  timeRange: '30D',
  setTimeRange: (range) => {
    set((state) => ({
      timeRange: range,
      timeSliderValue: TIME_PRESETS[range] || TIME_PRESETS['30D'],
      filters: {
        ...state.filters,
        dateRange: range,
      },
    }));
  },

  // Time slider value (0–1 normalized range)
  timeSliderValue: [0, 1],
  setTimeSliderValue: (val) => set({ timeSliderValue: val }),

  mapMode: 'events',
  setMapMode: (mode) => set({ mapMode: mode }),

  showIndustrialOverlay: true,
  toggleIndustrialOverlay: () => set((state) => ({ showIndustrialOverlay: !state.showIndustrialOverlay })),

  // Computed: filtered events
  getFilteredEvents: () => {
    const { events, filters, timeSliderValue } = get();
    return filterEvents(events, filters, timeSliderValue);
  },

  // Filtered GeoJSON (for map source)
  getFilteredGeoJSON: () => ({
    type: 'FeatureCollection',
    features: get().getFilteredEvents(),
  }),
}));
