import React, { useState, useEffect, useRef } from 'react';
import {
  StyleSheet,
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  Platform,
  Dimensions,
  Animated,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Stack, useRouter } from 'expo-router';
import { Leaf, MapPin, Trees, Users, ChevronDown, ChevronUp, Layers, Info, Map } from 'lucide-react-native';
import { CITIES, City, loadCities } from '@/constants/cities';
import { Asset } from 'expo-asset';


const { width } = Dimensions.get('window');

const GREEN_SPACE_COLORS = {
  park: '#4CAF50',
  forest: '#2E7D32',
  garden: '#66BB6A',
  reserve: '#1B5E20',
};

type BaseMapType = 'streets' | 'satellite' | 'topo' | 'dark';

type LeafletMapProps = {
  city: City;
  greenSpaceColors: Record<string, string>;
  activeLayers: Set<string>;
  onBreaksCalculated?: (breaks: number[]) => void;
  colorblindMode?: boolean;
  baseMap?: BaseMapType;
};

//-----------------------------
// Helper function to calculate breaks (quantiles) from data
function getBreaks(features: any[], property: string, nClasses: number = 7): number[] {
  const values = features
    .map(f => f.properties[property])
    .filter(v => v != null && !isNaN(v))
    .sort((a, b) => a - b);
  
  const breaks: number[] = [];
  for (let i = 1; i < nClasses; i++) {
    const q = Math.floor((values.length * i) / nClasses);
    breaks.push(values[q]);
  }
  return breaks;
}

// Helper function to get color based on value and breaks (matching webapp.js)
function getColor(value: number | null | undefined, breaks: number[], colorblindMode: boolean = false): string {
  if (value == null || isNaN(value)) return colorblindMode ? '#440154' : '#660000ff'; // no greenspace
  if (value === -1) return '#999999'; // no residents
  
  if (colorblindMode) {
    // ColorBrewer 'YlGnBu' 7-class (low → high) - colorblind-friendly
    // low -> high: ['#c7e9b4', '#7fcdbb', '#41b6c4', '#1d91c0', '#225ea8', '#253494', '#081d58']
    if (value <= breaks[0]) return '#c7e9b4';
    if (value <= breaks[1]) return '#7fcdbb';
    if (value <= breaks[2]) return '#41b6c4';
    if (value <= breaks[3]) return '#1d91c0';
    if (value <= breaks[4]) return '#225ea8';
    if (value <= breaks[5]) return '#253494';
    return '#081d58'; // highest
  } else {
    // Original color scheme
    if (value <= breaks[0]) return '#bf0000'; // very low
    if (value <= breaks[1]) return '#e36c0a';
    if (value <= breaks[2]) return '#f7c948';
    if (value <= breaks[3]) return '#b7e28a';
    if (value <= breaks[4]) return '#5ec962';
    if (value <= breaks[5]) return '#21918c';
    return '#2d6a4f'; // highest
  }
}

function LeafletMap({ city, activeLayers, onBreaksCalculated, colorblindMode = false, baseMap = 'streets' }: LeafletMapProps) {
  const mapRef = useRef<HTMLDivElement>(null);
  const mapInstanceRef = useRef<any>(null);
  const layersRef = useRef<Record<string, any>>({}); // Store references to layers
  const tileLayerRef = useRef<any>(null);
  const initInProgressRef = useRef<boolean>(false);
  const colorblindModeRef = useRef<boolean>(colorblindMode);
  
  // Keep ref in sync with prop
  useEffect(() => {
    colorblindModeRef.current = colorblindMode;
  }, [colorblindMode]);

  useEffect(() => {
    if (Platform.OS !== 'web') return;

    let cancelled = false;

    const initMap = async () => {
      // Prevent concurrent initializations
      if (initInProgressRef.current) return;
      initInProgressRef.current = true;

      const L = await import('leaflet');

      // Clean up existing map instance and layers first
      if (mapInstanceRef.current) {
        try {
          mapInstanceRef.current.remove();
        } catch (e) {
          console.warn('Error removing previous map instance during init:', e);
        }
        mapInstanceRef.current = null;
      }

      // Clear layer references
      layersRef.current = {};
      tileLayerRef.current = null;

      if (!mapRef.current || cancelled) {
        initInProgressRef.current = false;
        return;
      }

      // Try to initialize the map. If Leaflet complains that the container is already
      // initialized, attempt one controlled recovery by removing Leaflet's internal id
      // and retrying. We avoid aggressive deletion of DOM internals unless necessary.
      let map: any = null;
      try {
        map = L.map(mapRef.current).setView(
          [city.coordinates.latitude, city.coordinates.longitude],
          12
        );
      } catch (err: any) {
        const msg = err && err.message ? String(err.message) : '';
        if (msg.includes('already initialized')) {
          try {
            if (mapRef.current && (mapRef.current as any)._leaflet_id) {
              delete (mapRef.current as any)._leaflet_id;
            }
            map = L.map(mapRef.current).setView(
              [city.coordinates.latitude, city.coordinates.longitude],
              12
            );
          } catch (err2) {
            console.error('Failed to recover from already-initialized container:', err2);
            initInProgressRef.current = false;
            return;
          }
        } else {
          initInProgressRef.current = false;
          throw err;
        }
      }

      // Add base map tile layer based on selection
      const getTileLayer = () => {
        switch (baseMap) {
          case 'satellite':
            return L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', {
              attribution: 'Tiles © Esri',
              maxZoom: 18,
            });
          case 'topo':
            return L.tileLayer('https://{s}.tile.opentopomap.org/{z}/{x}/{y}.png', {
              attribution: '© OpenTopoMap contributors',
              maxZoom: 17,
            });
          case 'dark':
            return L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', {
              attribution: '© OpenStreetMap contributors © CARTO',
              maxZoom: 19,
            });
          case 'streets':
          default:
            return L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
              attribution: '© OpenStreetMap contributors',
              maxZoom: 18,
            });
        }
      };
      
      tileLayerRef.current = getTileLayer();
      tileLayerRef.current.addTo(map);

      // Store map reference immediately so interactions can be enabled
      mapInstanceRef.current = map;

      // Ensure the container allows pointer events and shows draggable cursor
      try {
        if (mapRef.current) {
          (mapRef.current as HTMLDivElement).style.cursor = 'grab';
          (mapRef.current as HTMLDivElement).style.pointerEvents = 'auto';
          // give focusable area for keyboard interactions
          (mapRef.current as any).tabIndex = (mapRef.current as any).tabIndex || 0;
        }
      } catch (e) {
        // non-fatal
      }

      // Ensure interaction handlers are enabled (covers cases where handlers
      // are left disabled by previous init/cleanup sequences).
      const enableInteractions = () => {
        try {
          if (map.dragging) map.dragging.enable();
          if (map.touchZoom) map.touchZoom.enable();
          if (map.scrollWheelZoom) map.scrollWheelZoom.enable();
          if (map.doubleClickZoom) map.doubleClickZoom.enable();
          if (map.boxZoom) map.boxZoom.enable();
          if (map.keyboard && map.keyboard.enable) map.keyboard.enable();
        } catch (e) {
          console.warn('Error enabling map interactions:', e);
        }
      };

      // Enable interactions immediately
      enableInteractions();

      // On first load without cache, Leaflet might need extra time to attach handlers
      // Re-enable interactions and invalidate size after a short delay
      setTimeout(() => {
        try {
          if (map && map.invalidateSize) {
            map.invalidateSize();
            enableInteractions(); // Re-enable to ensure handlers are attached
          }
        } catch (e) {
          // ignore
        }
      }, 100); // Increased from 0ms to 100ms for better reliability

      // Fetch and store the greenspace GeoJSON layer
      if (city.geojsonFiles?.greenspace) {
        try {
          const response = await fetch(city.geojsonFiles.greenspace);
          if (!response.ok) {
            throw new Error(
              `Failed to fetch ${city.geojsonFiles.greenspace}: ${response.status} ${response.statusText}`
            );
          }
          const geojsonData = await response.json();

          const greenspaceLayer = L.geoJSON(geojsonData, {
            style: {
              color: '#118011', // Green color for greenspace
              weight: 1,
              fillOpacity: 0.15,
            },
            onEachFeature: (feature, layer) => {
              const area = feature.properties.area;
              layer.bindPopup(
                `<strong>Greenspace</strong><br/>Area: ${
                  area !== undefined ? area.toFixed(2) : 'N/A'
                } km²`
              );

              // Hover highlight
              layer.on('mouseover', function (e: any) {
                try {
                  const target = e?.target as any;
                  if (!target) return;
                  target.setStyle?.({
                    color: '#ffff00',
                    weight: 2,
                    fillOpacity: 0.35,
                  });
                  if (target.bringToFront) target.bringToFront();
                } catch (err) {
                  // ignore
                }
              });

              layer.on('mouseout', function (e: any) {
                try {
                  const target = e?.target as any;
                  if (!target) return;
                  target.setStyle?.({
                    color: '#118011',
                    weight: 1,
                    fillOpacity: 0.15,
                  });
                } catch (err) {
                  // ignore
                }
              });
            },
          });

          layersRef.current.greenspace = greenspaceLayer;
          
          // Add to map immediately if it's in the default active layers
          if (activeLayers.has('greenspace')) {
            greenspaceLayer.addTo(map);
          }
        } catch (error) {
          console.error(`Error loading greenspace GeoJSON data:`, error);
        }
      }

      // Fetch and store the census GeoJSON layer
      if (city.geojsonFiles?.census) {
        try {
          const response = await fetch(city.geojsonFiles.census);
          if (!response.ok) {
            throw new Error(
              `Failed to fetch ${city.geojsonFiles.census}: ${response.status} ${response.statusText}`
            );
          }
          const geojsonData = await response.json();

          const censusLayer = L.geoJSON(geojsonData, {
            style: () => ({
              color: colorblindMode ? '#ffff00' : '#5833ff',
              weight: 2,
              fillOpacity: 0.0,
            }),
            onEachFeature: (feature, layer) => {
              const population = feature.properties.pop21;
              const ctuid = feature.properties.CTUID;
              layer.bindPopup(
                `<strong>Census Tract</strong><br/>Population: ${
                  population !== undefined ? population : 'N/A'
                }<br/>CTUID: ${ctuid || 'N/A'}`
              );

              // Store reference to colorblindMode ref for hover handlers
              (layer as any)._colorblindModeRef = colorblindModeRef;

              // Highlight on hover: change style to yellow and bring to front
              layer.on('mouseover', function (e: any) {
                try {
                  const target = e?.target as any;
                  if (!target) return;
                  target.setStyle?.({
                    color: '#ffff00',
                    weight: 3,
                    fillOpacity: 0.25,
                  });
                  // bring highlighted tract above others
                  if (target.bringToFront) target.bringToFront();
                } catch (err) {
                  // ignore
                }
              });

              // Restore style on mouseout
              layer.on('mouseout', function (e: any) {
                try {
                  const target = e?.target as any;
                  if (!target) return;
                  const currentColorblindMode = (target as any)._colorblindModeRef ? (target as any)._colorblindModeRef.current : false;
                  target.setStyle?.({
                    color: currentColorblindMode ? '#ffff00' : '#5833ff',
                    weight: 2,
                    fillOpacity: 0.0,
                  });
                } catch (err) {
                  // ignore
                }
              });
            },
          });

          layersRef.current.census = censusLayer;
          
          // Add to map immediately if it's in the default active layers
          if (activeLayers.has('census')) {
            censusLayer.addTo(map);
          }
        } catch (error) {
          console.error(`Error loading census GeoJSON data:`, error);
        }
      }

      // Fetch and store the greenspace per capita GeoJSON layer
      if (city.geojsonFiles?.greenspacePerCapita) {
        try {
          const response = await fetch(city.geojsonFiles.greenspacePerCapita);
          if (!response.ok) {
            throw new Error(
              `Failed to fetch ${city.geojsonFiles.greenspacePerCapita}: ${response.status} ${response.statusText}`
            );
          }
          const geojsonData = await response.json();

          // Calculate breaks from the actual data (quantile classification)
          const breaks = getBreaks(geojsonData.features, 'greenspace_per_capita', 7);
          console.log('Calculated breaks for greenspace per capita:', breaks);

          // Notify parent component about calculated breaks
          if (onBreaksCalculated) {
            onBreaksCalculated(breaks);
          }

          const greenspacePerCapitaLayer = L.geoJSON(geojsonData, {
            style: (feature) => {
              const value = (feature!.properties as any).greenspace_per_capita;
              return {
                color: '#222',
                weight: 1,
                fillOpacity: 0.5,
                fillColor: getColor(value, breaks, colorblindMode),
              };
            },
            onEachFeature: (feature, layer) => {
              const capita = (feature!.properties as any).greenspace_per_capita;
              layer.on('click', function () {
                layer.bindPopup(
                  `<strong>Greenspace Per Capita</strong><br/>Value: ${
                    capita === -1
                      ? 'no residents'
                      : capita !== undefined && capita !== null
                      ? capita.toFixed(2)
                      : 'N/A'
                  } m²`
                ).openPopup();
              });

              // Store breaks and colorblindMode ref in layer properties for access in event handlers
              (layer as any)._breaksRef = breaks;
              (layer as any)._colorblindModeRef = colorblindModeRef;

              // Hover highlight: temporarily change fillColor to yellow-ish and increase opacity
              layer.on('mouseover', function (e: any) {
                try {
                  const target = e?.target as any;
                  if (!target) return;
                  target.setStyle?.({
                    color: '#ffff00',
                    weight: 2,
                    fillOpacity: 0.6,
                    fillColor: '#ffff66',
                  });
                  if (target.bringToFront) target.bringToFront();
                } catch (err) {
                  // ignore
                }
              });

              layer.on('mouseout', function (e: any) {
                try {
                  const target = e?.target as any;
                  if (!target) return;
                  const val = target?.feature?.properties?.greenspace_per_capita;
                  const currentBreaks = (target as any)._breaksRef || breaks;
                  const currentColorblindMode = (target as any)._colorblindModeRef ? (target as any)._colorblindModeRef.current : false;
                  target.setStyle?.({
                    color: '#222',
                    weight: 1,
                    fillOpacity: 0.5,
                    fillColor: getColor(val, currentBreaks, currentColorblindMode),
                  });
                } catch (err) {
                  // ignore
                }
              });
            },
          });

          layersRef.current.greenspacePerCapita = greenspacePerCapitaLayer;
          
          // Add to map immediately if it's in the default active layers
          if (activeLayers.has('greenspacePerCapita')) {
            greenspacePerCapitaLayer.addTo(map);
          }
        } catch (error) {
          console.error(`Error loading greenspace per capita GeoJSON data:`, error);
        }
      }

      // Fetch and store the smoothed greenspace per capita GeoJSON layer
      if (city.geojsonFiles?.greenspacePerCapitaSmooth) {
        try {
          console.log('Fetching smoothed greenspace per capita from:', city.geojsonFiles.greenspacePerCapitaSmooth);
          const response = await fetch(city.geojsonFiles.greenspacePerCapitaSmooth);
          if (!response.ok) {
            throw new Error(
              `Failed to fetch ${city.geojsonFiles.greenspacePerCapitaSmooth}: ${response.status} ${response.statusText}`
            );
          }
          const geojsonData = await response.json();
          console.log('Smoothed greenspace data loaded, feature count:', geojsonData.features?.length);

          // Calculate breaks from the actual data (quantile classification)
          const breaks = getBreaks(geojsonData.features, 'greenspace_per_capita', 7);
          console.log('Calculated breaks for smoothed greenspace per capita:', breaks);

          const greenspacePerCapitaSmoothLayer = L.geoJSON(geojsonData, {
            style: (feature) => {
              const value = (feature!.properties as any).greenspace_per_capita;
              return {
                color: '#222',
                weight: 1,
                fillOpacity: 0.5,
                fillColor: getColor(value, breaks, colorblindMode),
              };
            },
            onEachFeature: (feature, layer) => {
              const capita = (feature!.properties as any).greenspace_per_capita;
              layer.on('click', function () {
                layer.bindPopup(
                  `<strong>Accessible Greenspace (300m)</strong><br/>Value: ${
                    capita === -1
                      ? 'no residents'
                      : capita !== undefined && capita !== null
                      ? capita.toFixed(2)
                      : 'N/A'
                  } m²`
                ).openPopup();
              });

              // Store breaks and colorblindMode ref in layer properties for access in event handlers
              (layer as any)._breaksRef = breaks;
              (layer as any)._colorblindModeRef = colorblindModeRef;

              // Hover highlight similar to per-capita layer
              layer.on('mouseover', function (e: any) {
                try {
                  const target = e?.target as any;
                  if (!target) return;
                  target.setStyle?.({
                    color: '#ffff00',
                    weight: 2,
                    fillOpacity: 0.6,
                    fillColor: '#ffff66',
                  });
                  if (target.bringToFront) target.bringToFront();
                } catch (err) {
                  // ignore
                }
              });

              layer.on('mouseout', function (e: any) {
                try {
                  const target = e?.target as any;
                  if (!target) return;
                  const val = target?.feature?.properties?.greenspace_per_capita;
                  const currentBreaks = (target as any)._breaksRef || breaks;
                  const currentColorblindMode = (target as any)._colorblindModeRef ? (target as any)._colorblindModeRef.current : false;
                  target.setStyle?.({
                    color: '#222',
                    weight: 1,
                    fillOpacity: 0.5,
                    fillColor: getColor(val, currentBreaks, currentColorblindMode),
                  });
                } catch (err) {
                  // ignore
                }
              });
            },
          });

          layersRef.current.greenspacePerCapitaSmooth = greenspacePerCapitaSmoothLayer;
          console.log('Smoothed layer stored in layersRef, active layers:', Array.from(activeLayers));
          
          // Add to map immediately if it's in the default active layers
          if (activeLayers.has('greenspacePerCapitaSmooth')) {
            console.log('Adding smoothed layer to map immediately');
            greenspacePerCapitaSmoothLayer.addTo(map);
          }
        } catch (error) {
          console.error(`Error loading smoothed greenspace per capita GeoJSON data:`, error);
        }
      }
      
      // Mark initialization complete
      initInProgressRef.current = false;
    };

    initMap();

    return () => {
      // Cleanup function
      cancelled = true;
      if (mapInstanceRef.current) {
        try {
          mapInstanceRef.current.remove();
        } catch (e) {
          console.warn('Error removing map during cleanup:', e);
        }
        mapInstanceRef.current = null;
      }
      layersRef.current = {};
      tileLayerRef.current = null;
      initInProgressRef.current = false;
    };
  }, [city]);

  // Update tile layer when baseMap changes
  useEffect(() => {
    if (Platform.OS !== 'web' || !mapInstanceRef.current) return;

    const updateTileLayer = async () => {
      const L = await import('leaflet');
      const map = mapInstanceRef.current;

      // Remove old tile layer
      if (tileLayerRef.current && map.hasLayer(tileLayerRef.current)) {
        map.removeLayer(tileLayerRef.current);
      }

      // Add new tile layer
      const getTileLayer = () => {
        switch (baseMap) {
          case 'satellite':
            return L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', {
              attribution: 'Tiles © Esri',
              maxZoom: 18,
            });
          case 'topo':
            return L.tileLayer('https://{s}.tile.opentopomap.org/{z}/{x}/{y}.png', {
              attribution: '© OpenTopoMap contributors',
              maxZoom: 17,
            });
          case 'dark':
            return L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', {
              attribution: '© OpenStreetMap contributors © CARTO',
              maxZoom: 19,
            });
          case 'streets':
          default:
            return L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
              attribution: '© OpenStreetMap contributors',
              maxZoom: 18,
            });
        }
      };
      
      tileLayerRef.current = getTileLayer();
      tileLayerRef.current.addTo(map);
    };

    updateTileLayer();
  }, [baseMap]);

  // Update styles for choropleth layers when colorblind mode changes
  useEffect(() => {
    if (Platform.OS !== 'web' || !mapInstanceRef.current) return;

    const recolorLayer = (layerName: string) => {
      const layer = layersRef.current[layerName];
      if (!layer) return;

      // Try to derive breaks from the layer's GeoJSON features
      try {
        const geo = (layer as any).toGeoJSON?.() || (layer as any).toGeoJSON?.(layer);
        const features = geo?.features || [];
        const breaks = getBreaks(features, 'greenspace_per_capita', 7);

        (layer as any).eachLayer((sublayer: any) => {
          try {
            const val = sublayer?.feature?.properties?.greenspace_per_capita;
            sublayer.setStyle?.({ fillColor: getColor(val, breaks, colorblindMode) });
            // Update the stored getter so mouseout uses current colorblind mode
            if (sublayer._breaksRef) sublayer._breaksRef = breaks;
          } catch (e) {
            // ignore per-feature errors
          }
        });
      } catch (e) {
        console.warn(`Could not recolor layer ${layerName}:`, e);
      }
    };

    // Recolor census layer
    const censusLayer = layersRef.current.census;
    if (censusLayer) {
      try {
        (censusLayer as any).eachLayer((sublayer: any) => {
          if (sublayer && typeof sublayer.setStyle === 'function') {
            sublayer.setStyle({ color: colorblindMode ? '#ffff00' : '#5833ff' });
          }
        });
      } catch (err) {
        console.error('Error updating census layer style for colorblindMode:', err);
      }
    }

    recolorLayer('greenspacePerCapita');
    recolorLayer('greenspacePerCapitaSmooth');
  }, [colorblindMode]);


 // Add/remove layers based on activeLayers state
  useEffect(() => {
  if (!mapInstanceRef.current) return;

  const map = mapInstanceRef.current;

  console.log('Layer visibility update - Active layers:', Array.from(activeLayers));
  console.log('Available layers in layersRef:', Object.keys(layersRef.current));

  // Check each layer and add/remove accordingly
  Object.keys(layersRef.current).forEach((layerName) => {
    const layer = layersRef.current[layerName];

    if (activeLayers.has(layerName)) {
      // Add layer if it's active and not already on the map
      if (!map.hasLayer(layer)) {
        console.log(`Adding layer: ${layerName}`);
        layer.addTo(map);
      }

      // Ensure the Census Tract layer is always on top
      if (layerName === 'census') {
        layer.bringToFront();
      }
    } else {
      // Remove layer if it's inactive and currently on the map
      if (map.hasLayer(layer)) {
        console.log(`Removing layer: ${layerName}`);
        map.removeLayer(layer);
      }
    }
  });
}, [activeLayers]);

  if (Platform.OS !== 'web') return null;

  return <div ref={mapRef} style={{ width: '100%', height: '100%' }} />;
}

//-----------------------------

const COLLAPSED_HEIGHT = 80; // Reduced from 100
const EXPANDED_HEIGHT = 400; // Reduced from 500
const CITY_COLLAPSED_HEIGHT = 60; // Reduced from 72
const CITY_EXPANDED_HEIGHT = 150; // Reduced from 180

export default function HomeScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const [cities, setCities] = useState<City[]>(CITIES);
  const [selectedCity, setSelectedCity] = useState<City>(CITIES[0]);
  const [citySummary, setCitySummary] = useState<any | null>(null);
  const [isExpanded, setIsExpanded] = useState<boolean>(false);
  const [cityDrawerExpanded, setCityDrawerExpanded] = useState<boolean>(false);
  const [activeLayers, setActiveLayers] = useState<Set<string>>(new Set(['greenspacePerCapita'])); // Changed default layer
  const [cityBreaks, setCityBreaks] = useState<number[]>([]);
  const [legendExpanded, setLegendExpanded] = useState<boolean>(true);
  const [colorblindMode, setColorblindMode] = useState<boolean>(false);
  const [baseMap, setBaseMap] = useState<BaseMapType>('streets');
  const [showBaseMapSelector, setShowBaseMapSelector] = useState<boolean>(false);
  const animatedHeight = useRef(new Animated.Value(COLLAPSED_HEIGHT)).current;
  const animatedCityHeight = useRef(new Animated.Value(CITY_COLLAPSED_HEIGHT)).current;
  
  // Detect if using a smartphone (based on screen dimensions) - updates on rotation
  // Mobile/compact mode when EITHER width OR height is < 768 (includes landscape on phones)
  const [windowDimensions, setWindowDimensions] = useState(Dimensions.get('window'));
  const isSmartphone = windowDimensions.width < 768 || windowDimensions.height < 768;
  const [showLayerSelector, setShowLayerSelector] = useState<boolean>(!isSmartphone);
  
  // Listen for dimension changes (rotation, window resize)
  useEffect(() => {
    const subscription = Dimensions.addEventListener('change', ({ window }) => {
      setWindowDimensions(window);
      // Close layer selector on mobile to prevent overlap
      if (window.width < 768 || window.height < 768) {
        setShowLayerSelector(false);
      }
    });
    
    return () => subscription?.remove();
  }, []);

  // Load cities with stats from GitHub
  useEffect(() => {
    loadCities().then(loadedCities => {
      setCities(loadedCities);
      // Update selected city if it's currently showing placeholder data
      if (selectedCity.totalArea === 0) {
        const updatedCity = loadedCities.find(c => c.id === selectedCity.id);
        if (updatedCity) setSelectedCity(updatedCity);
      }
    });
  }, []);

  // Fetch per-city summary JSON (summary_stats.json) for selected city
  useEffect(() => {
    let cancelled = false;
    const fetchSummary = async () => {
      try {
        const cityKey = selectedCity.id.toLowerCase();
        const url = `https://raw.githubusercontent.com/gianman15/HowGreenIsYourCity/main/data/${cityKey}/summary_stats.json`;
        const resp = await fetch(url);
        if (!resp.ok) throw new Error(`Failed to fetch summary for ${selectedCity.name}: ${resp.status}`);
        const json = await resp.json();
        if (!cancelled) setCitySummary(json);
      } catch (err) {
        console.warn('Could not load city summary:', err);
        if (!cancelled) setCitySummary(null);
      }
    };

    fetchSummary();
    return () => { cancelled = true; };
  }, [selectedCity]);

  const toggleSheet = () => {
    const toValue = isExpanded ? COLLAPSED_HEIGHT : EXPANDED_HEIGHT;
    Animated.spring(animatedHeight, {
      toValue,
      useNativeDriver: false,
      tension: 50,
      friction: 8,
    }).start();
    setIsExpanded(!isExpanded);
  };

  const toggleLayer = (layerName: string) => {
    setActiveLayers((prev) => {
      const newSet = new Set(prev);
      if (newSet.has(layerName)) {
        newSet.delete(layerName);
      } else {
        newSet.add(layerName);
      }
      return newSet;
    });
  };

  const toggleCityDrawer = () => {
    const toValue = cityDrawerExpanded ? CITY_COLLAPSED_HEIGHT : CITY_EXPANDED_HEIGHT;
    Animated.spring(animatedCityHeight, {
      toValue,
      useNativeDriver: false,
      tension: 50,
      friction: 8,
    }).start();
    setCityDrawerExpanded(!cityDrawerExpanded);
  };

  return (
    <View style={styles.container}>
      <Stack.Screen
        options={{
          title: 'Urban Green Spaces',
          headerStyle: {
            backgroundColor: '#FFFFFF',
          },
          headerTintColor: '#1B5E20',
          headerTitleStyle: {
            fontWeight: '700' as const,
          },
          headerRight: () => (
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginRight: 12 }}>
              <TouchableOpacity 
                onPress={() => setShowBaseMapSelector(!showBaseMapSelector)} 
                style={styles.headerButton}
                activeOpacity={0.7}
              >
                <Map size={20} color="#2E7D32" />
              </TouchableOpacity>
              <TouchableOpacity 
                onPress={() => setShowLayerSelector(!showLayerSelector)} 
                style={styles.headerButton}
                activeOpacity={0.7}
              >
                <Layers size={20} color="#2E7D32" />
              </TouchableOpacity>
              <TouchableOpacity 
                onPress={() => setColorblindMode(!colorblindMode)} 
                style={styles.headerButton}
                activeOpacity={0.7}
              >
                <Text style={{ fontSize: 18 }}>{colorblindMode ? '👁️' : '🎨'}</Text>
              </TouchableOpacity>
              <TouchableOpacity 
                onPress={() => router.push('/info')} 
                style={styles.headerButton}
                activeOpacity={0.7}
              >
                <Info size={20} color="#2E7D32" />
              </TouchableOpacity>
            </View>
          ),
        }}
      />

      {!cityDrawerExpanded ? (
        <TouchableOpacity 
          style={styles.cityButtonCompact}
          onPress={toggleCityDrawer}
          activeOpacity={0.8}
        >
          <MapPin size={20} color="#FFFFFF" />
          <Text style={styles.cityButtonText}>{selectedCity.name}</Text>
        </TouchableOpacity>
      ) : (
        <Animated.View style={[styles.cityDrawer, { height: animatedCityHeight }]}>
          <TouchableOpacity style={styles.sheetHeader} onPress={toggleCityDrawer} activeOpacity={0.8}>
            <View style={styles.dragHandle} />
            <View style={styles.sheetHeaderContent}>
              <Text style={styles.factsTitle}>Select City</Text>
              {cityDrawerExpanded ? <ChevronDown size={24} color="#1B5E20" /> : <ChevronUp size={24} color="#1B5E20" />}
            </View>
          </TouchableOpacity>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.citySelectorContent}
          >
            {cities.map((city) => (
              <TouchableOpacity
                key={city.id}
                style={[
                  styles.cityCard,
                  selectedCity.id === city.id && styles.cityCardActive,
                ]}
                onPress={() => { setSelectedCity(city); }}
              >
                <Text
                  style={[
                    styles.cityCardName,
                    selectedCity.id === city.id && styles.cityCardNameActive,
                  ]}
                >
                  {city.name}
                </Text>
                <Text
                  style={[
                    styles.cityCardCountry,
                    selectedCity.id === city.id && styles.cityCardCountryActive,
                  ]}
                >
                  {city.country}
                </Text>
              </TouchableOpacity>
            ))}
          </ScrollView>
        </Animated.View>
      )}

      <View style={styles.mapContainer}>
        {Platform.OS === 'web' ? (
          <LeafletMap 
            city={selectedCity} 
            greenSpaceColors={GREEN_SPACE_COLORS} 
            activeLayers={activeLayers}
            onBreaksCalculated={setCityBreaks}
            colorblindMode={colorblindMode}
            baseMap={baseMap}
          />
        ) : (
          <View style={styles.nativeMapPlaceholder}>
            <MapPin size={48} color="#2E7D32" />
            <Text style={styles.placeholderText}>
              Map view for {selectedCity.name}
            </Text>
          </View>
        )}
        


        {(activeLayers.has('greenspacePerCapita') || activeLayers.has('greenspacePerCapitaSmooth')) && cityBreaks.length > 0 && (
          <View style={[
            styles.legend,
            isSmartphone && { bottom: insets.bottom + 20, left: 220, transform: [] }
          ]}>
            <View pointerEvents="auto">
              <TouchableOpacity 
                onPress={() => {
                  console.log('Legend clicked, current state:', legendExpanded);
                  setLegendExpanded(!legendExpanded);
                }}
                activeOpacity={0.7}
                style={[
                  styles.legendHeader,
                  Platform.OS === 'web' && { cursor: 'pointer' as any }
                ]}
              >
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                  <Text style={styles.legendTitle}>Greenspace per Capita (m²)</Text>
                  <Text style={styles.legendHint}>
                    {legendExpanded ? '(tap to hide)' : '(tap to show)'}
                  </Text>
                </View>
                {legendExpanded ? <ChevronDown size={18} color="#2E7D32" strokeWidth={2.5} /> : <ChevronUp size={18} color="#2E7D32" strokeWidth={2.5} />}
              </TouchableOpacity>
            </View>
            {legendExpanded && (
              <View style={styles.legendItems} pointerEvents="box-none">
                <View style={styles.legendItem}>
                  <View style={[styles.legendColor, { backgroundColor: colorblindMode ? '#081d58' : '#2d6a4f' }]} />
                  <Text style={styles.legendText}>&gt; {cityBreaks[5]?.toFixed(0)}</Text>
                </View>
                <View style={styles.legendItem}>
                  <View style={[styles.legendColor, { backgroundColor: colorblindMode ? '#253494' : '#21918c' }]} />
                  <Text style={styles.legendText}>{cityBreaks[4]?.toFixed(0)} - {cityBreaks[5]?.toFixed(0)}</Text>
                </View>
                <View style={styles.legendItem}>
                  <View style={[styles.legendColor, { backgroundColor: colorblindMode ? '#225ea8' : '#5ec962' }]} />
                  <Text style={styles.legendText}>{cityBreaks[3]?.toFixed(0)} - {cityBreaks[4]?.toFixed(0)}</Text>
                </View>
                <View style={styles.legendItem}>
                  <View style={[styles.legendColor, { backgroundColor: colorblindMode ? '#1d91c0' : '#b7e28a' }]} />
                  <Text style={styles.legendText}>{cityBreaks[2]?.toFixed(0)} - {cityBreaks[3]?.toFixed(0)}</Text>
                </View>
                <View style={styles.legendItem}>
                  <View style={[styles.legendColor, { backgroundColor: colorblindMode ? '#41b6c4' : '#f7c948' }]} />
                  <Text style={styles.legendText}>{cityBreaks[1]?.toFixed(0)} - {cityBreaks[2]?.toFixed(0)}</Text>
                </View>
                <View style={styles.legendItem}>
                  <View style={[styles.legendColor, { backgroundColor: colorblindMode ? '#7fcdbb' : '#e36c0a' }]} />
                  <Text style={styles.legendText}>{cityBreaks[0]?.toFixed(0)} - {cityBreaks[1]?.toFixed(0)}</Text>
                </View>
                <View style={styles.legendItem}>
                  <View style={[styles.legendColor, { backgroundColor: colorblindMode ? '#c7e9b4' : '#bf0000' }]} />
                  <Text style={styles.legendText}>&lt; {cityBreaks[0]?.toFixed(0)}</Text>
                </View>
                <View style={styles.legendItem}>
                  <View style={[styles.legendColor, { backgroundColor: '#999999' }]} />
                  <Text style={styles.legendText}>No residents</Text>
                </View>
              </View>
            )}
          </View>
        )}

         {showBaseMapSelector && (
          <View style={[
            styles.baseMapSelector, 
            { maxHeight: windowDimensions.height - 150 },
            isSmartphone && { right: 20, top: 120 }
          ]}>
            <TouchableOpacity 
              style={styles.selectorTitleContainer}
              onPress={() => setShowBaseMapSelector(false)}
              activeOpacity={0.7}
            >
              <Map size={18} color="#1B5E20" />
              <Text style={styles.layerSelectorTitle}>Base Map</Text>
            </TouchableOpacity>
            <ScrollView 
              style={styles.layerScrollView}
              showsVerticalScrollIndicator={false}
            >
              <TouchableOpacity 
                style={styles.layerOption}
                onPress={() => setBaseMap('streets')}
                activeOpacity={0.7}
              >
                <View style={[
                  styles.layerCheckbox,
                  baseMap === 'streets' && styles.layerCheckboxActive
                ]}>
                  {baseMap === 'streets' && (
                    <View style={styles.layerCheckboxInner} />
                  )}
                </View>
                <View style={styles.layerOptionContent}>
                  <Text style={styles.layerOptionTitle}>Streets</Text>
                  <Text style={styles.layerOptionDescription}>Standard OpenStreetMap view</Text>
                </View>
              </TouchableOpacity>

              <TouchableOpacity 
                style={styles.layerOption}
                onPress={() => setBaseMap('satellite')}
                activeOpacity={0.7}
              >
                <View style={[
                  styles.layerCheckbox,
                  baseMap === 'satellite' && styles.layerCheckboxActive
                ]}>
                  {baseMap === 'satellite' && (
                    <View style={styles.layerCheckboxInner} />
                  )}
                </View>
                <View style={styles.layerOptionContent}>
                  <Text style={styles.layerOptionTitle}>Satellite</Text>
                  <Text style={styles.layerOptionDescription}>Aerial imagery from Esri</Text>
                </View>
              </TouchableOpacity>

              <TouchableOpacity 
                style={styles.layerOption}
                onPress={() => setBaseMap('topo')}
                activeOpacity={0.7}
              >
                <View style={[
                  styles.layerCheckbox,
                  baseMap === 'topo' && styles.layerCheckboxActive
                ]}>
                  {baseMap === 'topo' && (
                    <View style={styles.layerCheckboxInner} />
                  )}
                </View>
                <View style={styles.layerOptionContent}>
                  <Text style={styles.layerOptionTitle}>Topographic</Text>
                  <Text style={styles.layerOptionDescription}>Terrain and elevation details</Text>
                </View>
              </TouchableOpacity>

              <TouchableOpacity 
                style={styles.layerOption}
                onPress={() => setBaseMap('dark')}
                activeOpacity={0.7}
              >
                <View style={[
                  styles.layerCheckbox,
                  baseMap === 'dark' && styles.layerCheckboxActive
                ]}>
                  {baseMap === 'dark' && (
                    <View style={styles.layerCheckboxInner} />
                  )}
                </View>
                <View style={styles.layerOptionContent}>
                  <Text style={styles.layerOptionTitle}>Dark</Text>
                  <Text style={styles.layerOptionDescription}>Dark theme map by CARTO</Text>
                </View>
              </TouchableOpacity>
            </ScrollView>
          </View>
        )}

         {showLayerSelector && (
          <View style={[styles.layerSelector, { maxHeight: windowDimensions.height - 150 }]}>
            <TouchableOpacity 
              style={styles.selectorTitleContainer}
              onPress={() => setShowLayerSelector(false)}
              activeOpacity={0.7}
            >
              <Layers size={18} color="#1B5E20" />
              <Text style={styles.layerSelectorTitle}>Map Layers</Text>
            </TouchableOpacity>
            <ScrollView 
              style={styles.layerScrollView}
              showsVerticalScrollIndicator={false}
            >
              <TouchableOpacity 
                style={styles.layerOption}
                onPress={() => toggleLayer('census')}
                activeOpacity={0.7}
              >
                <View style={[
                  styles.layerCheckbox,
                  activeLayers.has('census') && styles.layerCheckboxActive
                ]}>
                  {activeLayers.has('census') && (
                    <View style={styles.layerCheckboxInner} />
                  )}
                </View>
                <View style={styles.layerOptionContent}>
                  <Text style={styles.layerOptionTitle}>Census Tracts</Text>
                  <Text style={styles.layerOptionDescription}>City boundaries and demographics</Text>
                </View>
              </TouchableOpacity>

              <TouchableOpacity 
                style={styles.layerOption}
                onPress={() => toggleLayer('greenspace')}
                activeOpacity={0.7}
              >
                <View style={[
                  styles.layerCheckbox,
                  activeLayers.has('greenspace') && styles.layerCheckboxActive
                ]}>
                  {activeLayers.has('greenspace') && (
                    <View style={styles.layerCheckboxInner} />
                  )}
                </View>
                <View style={styles.layerOptionContent}>
                  <Text style={styles.layerOptionTitle}>Green Space</Text>
                  <Text style={styles.layerOptionDescription}>Area coverage of dense vegetation seen from space</Text>
                </View>
              </TouchableOpacity>

              <TouchableOpacity 
                style={styles.layerOption}
                onPress={() => toggleLayer('greenspacePerCapita')}
                activeOpacity={0.7}
              >
                <View style={[
                  styles.layerCheckbox,
                  activeLayers.has('greenspacePerCapita') && styles.layerCheckboxActive
                ]}>
                  {activeLayers.has('greenspacePerCapita') && (
                    <View style={styles.layerCheckboxInner} />
                  )}
                </View>
                <View style={styles.layerOptionContent}>
                  <Text style={styles.layerOptionTitle}>Greenspace per person</Text>
                  <Text style={styles.layerOptionDescription}>per capita greenspace allocation within a census tract</Text>
                </View>
              </TouchableOpacity>

              <TouchableOpacity 
                style={styles.layerOption}
                onPress={() => toggleLayer('greenspacePerCapitaSmooth')}
                activeOpacity={0.7}
              >
                <View style={[
                  styles.layerCheckbox,
                  activeLayers.has('greenspacePerCapitaSmooth') && styles.layerCheckboxActive
                ]}>
                  {activeLayers.has('greenspacePerCapitaSmooth') && (
                    <View style={styles.layerCheckboxInner} />
                  )}
                </View>
                <View style={styles.layerOptionContent}>
                  <Text style={styles.layerOptionTitle}>Accessible Greenspace (300m)</Text>
                  <Text style={styles.layerOptionDescription}>Includes nearby greenspace within walking distance</Text>
                </View>
              </TouchableOpacity>
            </ScrollView>
          </View>
        )}
      </View>

      {!isExpanded ? (
        <TouchableOpacity 
          style={[styles.factsButtonCompact, { bottom: insets.bottom + 20 }]}
          onPress={toggleSheet}
          activeOpacity={0.8}
        >
          <Leaf size={20} color="#FFFFFF" />
          <Text style={styles.factsButtonText}>Green Space Facts</Text>
        </TouchableOpacity>
      ) : (
        <Animated.View style={[
          styles.factsContainer, 
          { 
            height: animatedHeight, 
            paddingBottom: 20 + insets.bottom,
            maxHeight: windowDimensions.height - 100, // Prevent overflow
          }
        ]}>
          <TouchableOpacity 
            style={styles.sheetHeader}
            onPress={toggleSheet}
            activeOpacity={0.7}
          >
            <View style={styles.dragHandle} />
            <View style={styles.sheetHeaderContent}>
              <Text style={styles.factsTitle}>Green Space Facts</Text>
              {isExpanded ? (
                <ChevronDown size={24} color="#1B5E20" />
              ) : (
                <ChevronUp size={24} color="#1B5E20" />
              )}
            </View>
          </TouchableOpacity>
          <ScrollView 
            style={styles.factsScrollView}
            showsVerticalScrollIndicator={false}
          >
        <View style={styles.factsGrid}>
          {/* Greenspace coverage */}
          <View style={styles.factCard}>
            <View style={styles.factIconContainer}>
              <Leaf size={24} color="#2E7D32" />
            </View>
            <Text style={styles.factValue}>
              {citySummary?.greenspace_percentage !== undefined
                ? `${Number(citySummary.greenspace_percentage).toFixed(1)}%`
                : `${selectedCity.greenSpacePercentage}%`}
            </Text>
            <Text style={styles.factLabel}>Green Space Coverage</Text>
          </View>

          {/* Per-capita greenspace (m²) */}
          <View style={styles.factCard}>
            <View style={styles.factIconContainer}>
              <Users size={24} color="#2E7D32" />
            </View>
            <Text style={styles.factValue}>
              {(() => {
                const avg = citySummary?.average_greenspace_per_capita_m2;
                const totalGreenKm2 = citySummary?.total_greenspace_area_km2;
                const pop = citySummary?.total_population ?? selectedCity.population;
                if (avg !== undefined && avg !== null) return `${Number(avg).toFixed(0)} m²`;
                if (totalGreenKm2 !== undefined && pop) return `${Math.round((totalGreenKm2 * 1e6) / pop)} m²`;
                // fallback to older heuristic if summary missing
                try {
                  const fallback = (selectedCity.greenSpacePercentage * selectedCity.totalArea) / selectedCity.population * 1000000;
                  return `${Math.round(fallback)} m²`;
                } catch (e) {
                  return 'N/A';
                }
              })()}
            </Text>
            <Text style={styles.factLabel}>Per Capita</Text>
          </View>

          {/* Total area (km²) */}
          <View style={styles.factCard}>
            <View style={styles.factIconContainer}>
              <MapPin size={24} color="#2E7D32" />
            </View>
            <Text style={styles.factValue}>
              {citySummary?.total_land_area_km2 !== undefined
                ? `${Number(citySummary.total_land_area_km2).toFixed(1)} km²`
                : `${selectedCity.totalArea} km²`}
            </Text>
            <Text style={styles.factLabel}>Total Area</Text>
          </View>

          {/* Population */}
          <View style={styles.factCard}>
            <View style={styles.factIconContainer}>
              <Users size={20} color="#2E7D32" />
            </View>
            <Text style={styles.factValue}>
              {citySummary?.total_population !== undefined
                ? String(citySummary.total_population).replace(/\B(?=(\d{3})+(?!\d))/g, ',')
                : String(selectedCity.population).replace(/\B(?=(\d{3})+(?!\d))/g, ',')}
            </Text>
            <Text style={styles.factLabel}>Population</Text>
          </View>
        </View>

        {/** Removed Green Space Types section */}
          </ScrollView>
        </Animated.View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F5F9F5',
  },
  
  citySelector: {
    backgroundColor: '#FFFFFF',
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#E8F5E9',
  },
  citySelectorContent: {
    paddingHorizontal: 16,
    gap: 12,
  },
  cityCard: {
    paddingHorizontal: 20,
    paddingVertical: 14,
    borderRadius: 12,
    backgroundColor: '#F5F9F5',
    borderWidth: 2,
    borderColor: '#E8F5E9',
    minWidth: 140,
  },
  cityCardActive: {
    backgroundColor: '#2E7D32',
    borderColor: '#2E7D32',
  },
  cityCardName: {
    fontSize: 16,
    fontWeight: '600' as const,
    color: '#1B5E20',
    marginBottom: 2,
  },
  cityCardNameActive: {
    color: '#FFFFFF',
  },
  cityCardCountry: {
    fontSize: 12,
    color: '#558B2F',
  },
  cityCardCountryActive: {
    color: '#C8E6C9',
  },
  mapContainer: {
    flex: 1,
    backgroundColor: '#E8F5E9',
  },
  map: {
    width: '100%',
    height: '100%',
  },
  nativeMapPlaceholder: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#F1F8F4',
    gap: 12,
  },
  placeholderText: {
    fontSize: 18,
    fontWeight: '600' as const,
    color: '#2E7D32',
  },
  placeholderSubtext: {
    fontSize: 14,
    color: '#558B2F',
  },
  factsContainer: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: '#FFFFFF',
    paddingHorizontal: 20,
    paddingTop: 8,
    paddingBottom: 20,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -2 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 5,
    overflow: 'hidden',
  },
  factsScrollView: {
    flex: 1,
  },
  sheetHeader: {
    alignItems: 'center',
    paddingTop: 8,
    paddingBottom: 8,
  },
  dragHandle: {
    width: 40,
    height: 4,
    backgroundColor: '#C8E6C9',
    borderRadius: 2,
    marginBottom: 12,
  },
  sheetHeaderContent: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    width: '100%',
  },
  factsTitle: {
    fontSize: 20,
    fontWeight: '700' as const,
    color: '#1B5E20',
  },
  factsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
    marginBottom: 24,
    marginTop: 16,
  },
  factCard: {
    flex: 1,
    minWidth: (width - 56) / 2,
    backgroundColor: '#F5F9F5',
    padding: 16,
    borderRadius: 16,
    alignItems: 'center',
    gap: 8,
  },
  factIconContainer: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: '#E8F5E9',
    justifyContent: 'center',
    alignItems: 'center',
  },
  factValue: {
    fontSize: 24,
    fontWeight: '700' as const,
    color: '#1B5E20',
  },
  factLabel: {
    fontSize: 12,
    color: '#558B2F',
    textAlign: 'center',
  },
  legendContainer: {
    backgroundColor: '#F5F9F5',
    padding: 16,
    borderRadius: 12,
  },
  legendTitle: {
    fontSize: 14,
    fontWeight: '600' as const,
    color: '#1B5E20',
  },
  legendHint: {
    fontSize: 10,
    color: '#7CB342',
    fontStyle: 'italic' as const,
  },
  legendGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 16,
  },
  legendItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  legendDot: {
    width: 12,
    height: 12,
    borderRadius: 6,
  },
  legendText: {
    fontSize: 13,
    color: '#558B2F',
  },
  headerButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#E8F5E9',
    justifyContent: 'center',
    alignItems: 'center',
  },
  baseMapSelector: {
    position: 'absolute',
    top: 120,
    right: 340, // Position to the left of layer selector on desktop
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 16,
    minWidth: 280,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 8,
    elevation: 8,
    zIndex: 10000,
  },
  layerSelector: {
    position: 'absolute',
    top: 120, // Adjusted from 74 to move it further down
    right: 20,
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 16,
    minWidth: 280,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 8,
    elevation: 8,
    zIndex: 10000,
  },
  layerScrollView: {
    flex: 1,
  },
  selectorTitleContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 16,
  },
  layerSelectorTitle: {
    fontSize: 16,
    fontWeight: '700' as const,
    color: '#1B5E20',
  },
  layerOption: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    paddingVertical: 12,
    gap: 12,
  },
  layerCheckbox: {
    width: 24,
    height: 24,
    borderRadius: 6,
    borderWidth: 2,
    borderColor: '#C8E6C9',
    backgroundColor: '#FFFFFF',
    justifyContent: 'center',
    alignItems: 'center',
  },
  layerCheckboxActive: {
    borderColor: '#2E7D32',
    backgroundColor: '#E8F5E9',
  },
  layerCheckboxInner: {
    width: 12,
    height: 12,
    borderRadius: 3,
    backgroundColor: '#2E7D32',
  },
  layerOptionContent: {
    flex: 1,
  },
  layerOptionTitle: {
    fontSize: 14,
    fontWeight: '600' as const,
    color: '#1B5E20',
    marginBottom: 2,
  },
  layerOptionDescription: {
    fontSize: 12,
    color: '#558B2F',
  },
  cityDrawer: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    backgroundColor: '#FFFFFF',
    paddingHorizontal: 16,
    paddingTop: 8,
    borderBottomLeftRadius: 16,
    borderBottomRightRadius: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 8,
    elevation: 8,
    overflow: 'hidden',
    zIndex: 1000,
  },
  legend: {
    position: 'absolute',
    bottom: 75, // Adjusted from 20 to move it up
    left: '7.5%',
    transform: [{ translateX: -120 }],
    backgroundColor: '#ffffffc5',
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderRadius: 8,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.15,
    shadowRadius: 4,
    elevation: 4,
    zIndex: 10000,
    width: 280,
    ...Platform.select({
      web: {
        pointerEvents: 'auto' as any,
      },
    }),
  },
  legendHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    width: '100%',
    marginBottom: 8,
    paddingVertical: 4,
  },
  legendItems: {
    gap: 4,
  },
  legendColor: {
    width: 20,
    height: 16,
    borderRadius: 3,
    borderWidth: 1,
    borderColor: '#DDD',
  },

  cityButtonCompact: {
    position: 'absolute',
    top: 20,
    left: 45,
    backgroundColor: '#2E7D32',
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 12,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 4,
    elevation: 5,
    zIndex: 1000,
  },
  cityButtonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '700' as const,
  },
  factsButtonCompact: {
    position: 'absolute',
    left: 20,
    backgroundColor: '#2E7D32',
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 12,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 4,
    elevation: 5,
    zIndex: 1000,
  },
  factsButtonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '700' as const,
  },
});
