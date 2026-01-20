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
  PanResponder,
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
  sharedBreaks?: number[];
  colorblindMode?: boolean;
  baseMap?: BaseMapType;
  selectedBreakRange?: { min: number; max: number } | null;
  onBreakRangeSelect?: (range: { min: number; max: number } | null) => void;
};

//-----------------------------
// Helper function to calculate breaks (quantiles) from data
function getBreaks(features: any[], property: string, nClasses: number = 7): number[] {
  const values = features
    .map(f => f.properties[property])
    .filter(v => v != null && !isNaN(v) && v !== -1) // Exclude -1 (no residents)
    .sort((a, b) => a - b);
  
  const breaks: number[] = [];
  for (let i = 1; i < nClasses; i++) {
    const q = Math.floor((values.length * i) / nClasses);
    breaks.push(values[q]);
  }
  return breaks;
}

// Helper function to get break range for a value
function getBreakRangeIndex(value: number | null | undefined, breaks: number[]): number {
  if (value == null || isNaN(value) || value === -1) return -1;
  
  for (let i = 0; i < breaks.length; i++) {
    if (value <= breaks[i]) return i;
  }
  return breaks.length; // highest range
}

// Helper function to get break range bounds
function getBreakRange(value: number | null | undefined, breaks: number[]): { min: number; max: number } | null {
  if (value == null || isNaN(value) || value === -1) return null;
  
  const idx = getBreakRangeIndex(value, breaks);
  if (idx === -1) return null;
  
  if (idx === 0) {
    return { min: -Infinity, max: breaks[0] };
  } else if (idx === breaks.length) {
    return { min: breaks[breaks.length - 1], max: Infinity };
  } else {
    return { min: breaks[idx - 1], max: breaks[idx] };
  }
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

function LeafletMap({ city, activeLayers, sharedBreaks, colorblindMode = false, baseMap = 'streets', selectedBreakRange, onBreakRangeSelect }: LeafletMapProps) {
  const mapRef = useRef<HTMLDivElement>(null);
  const mapInstanceRef = useRef<any>(null);
  const layersRef = useRef<Record<string, any>>({}); // Store references to layers
  const geojsonDataRef = useRef<any>(null); // Store GeoJSON data for re-rendering
  const geojsonDataSmoothRef = useRef<any>(null); // Store smoothed GeoJSON data
  const [dataLoaded, setDataLoaded] = useState(false);
  const [dataSmoothLoaded, setDataSmoothLoaded] = useState(false);
  const [layersReady, setLayersReady] = useState(0); // Counter to trigger visibility effect
  const tileLayerRef = useRef<any>(null);
  const colorblindModeRef = useRef<boolean>(colorblindMode);
  const selectedBreakRangeRef = useRef<{ min: number; max: number } | null>(selectedBreakRange || null);
  
  // Keep refs in sync with props
  useEffect(() => {
    colorblindModeRef.current = colorblindMode;
  }, [colorblindMode]);
  
  useEffect(() => {
    selectedBreakRangeRef.current = selectedBreakRange || null;
  }, [selectedBreakRange]);

  // Initialize map only once per city
  useEffect(() => {
    if (Platform.OS !== 'web' || !mapRef.current) return;
    
    setDataLoaded(false);
    setDataSmoothLoaded(false);
    setLayersReady(0);

    const initMap = async () => {
      const L = await import('leaflet');

      // Clean up existing map instance and layers first
      if (mapInstanceRef.current) {
        mapInstanceRef.current.remove();
        mapInstanceRef.current = null;
      }
      
      // Clear layer references
      layersRef.current = {};
      geojsonDataRef.current = null;
      tileLayerRef.current = null;

      if (!mapRef.current) return;

      // Determine zoom level based on screen size
      const { width, height } = Dimensions.get('window');
      const isMobile = width < 768 || height < 768;
      const zoomLevel = isMobile ? 10 : 12;

      // Initialize the map
      const map = L.map(mapRef.current, { zoomControl: false }).setView(
        [city.coordinates.latitude, city.coordinates.longitude],
        zoomLevel
      );

      // Store reference immediately so other effects can safely access the map
      mapInstanceRef.current = map;

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

      // Add click handler to clear filter when clicking outside census tracts
      map.on('click', (e: any) => {
        // Check if click was on a layer by seeing if the event has a layer property
        // If not on a layer, clear the filter
        if (!e.originalEvent?.target?.closest('.leaflet-interactive')) {
          if (onBreakRangeSelect) {
            onBreakRangeSelect(null);
          }
        }
      });

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

              // Store colorblindMode ref for hover handlers
              (layer as any)._colorblindModeRef = colorblindModeRef;

              // Highlight on hover
              layer.on('mouseover', function (e: any) {
                try {
                  const target = e?.target as any;
                  if (!target) return;
                  target.setStyle?.({
                    color: '#ffff00',
                    weight: 3,
                    fillOpacity: 0.25,
                  });
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

      // Fetch and store the greenspace per capita GeoJSON data
      if (city.geojsonFiles?.greenspacePerCapita) {
        try {
          const response = await fetch(city.geojsonFiles.greenspacePerCapita);
          if (!response.ok) {
            throw new Error(
              `Failed to fetch ${city.geojsonFiles.greenspacePerCapita}: ${response.status} ${response.statusText}`
            );
          }
          const geojsonData = await response.json();
          geojsonDataRef.current = geojsonData;
          setDataLoaded(true);
        } catch (error) {
          console.error(`Error loading greenspace per capita GeoJSON data:`, error);
        }
      }

      // Fetch and store the smoothed greenspace per capita GeoJSON data
      if (city.geojsonFiles?.greenspacePerCapitaSmooth) {
        try {
          const response = await fetch(city.geojsonFiles.greenspacePerCapitaSmooth);
          if (!response.ok) {
            throw new Error(
              `Failed to fetch ${city.geojsonFiles.greenspacePerCapitaSmooth}: ${response.status} ${response.statusText}`
            );
          }
          const geojsonData = await response.json();
          geojsonDataSmoothRef.current = geojsonData;
          setDataSmoothLoaded(true);
        } catch (error) {
          console.error(`Error loading smoothed greenspace per capita GeoJSON data:`, error);
        }
      }
      
    };

    initMap();

    return () => {
      // Cleanup function
      if (mapInstanceRef.current) {
        mapInstanceRef.current.remove();
        mapInstanceRef.current = null;
      }
      layersRef.current = {};
      geojsonDataRef.current = null;
      geojsonDataSmoothRef.current = null;
      tileLayerRef.current = null;
      setDataLoaded(false);
      setDataSmoothLoaded(false);
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

  // Update greenspace per capita layer when breaks or colorblind mode changes
  useEffect(() => {
    if (Platform.OS !== 'web' || !mapInstanceRef.current || !geojsonDataRef.current || !dataLoaded) return;

    const updatePerCapitaLayer = async () => {
      const L = await import('leaflet');
      const map = mapInstanceRef.current;
      
      // Remove existing layer if it exists
      if (layersRef.current.greenspacePerCapita) {
        if (map.hasLayer(layersRef.current.greenspacePerCapita)) {
          map.removeLayer(layersRef.current.greenspacePerCapita);
        }
        // Clear the old layer reference
        delete layersRef.current.greenspacePerCapita;
      }

      // Use shared breaks if provided AND valid, otherwise calculate from this city's data
      const breaks = (sharedBreaks && sharedBreaks.length > 0) 
        ? sharedBreaks 
        : getBreaks(geojsonDataRef.current.features, 'greenspace_per_capita', 7);
      console.log('Using breaks for greenspace per capita:', breaks);

      const greenspacePerCapitaLayer = L.geoJSON(geojsonDataRef.current, {
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
          
          // Store breaks, colorblindMode ref, and selectedBreakRange ref for hover handlers
          (layer as any)._breaksRef = breaks;
          (layer as any)._colorblindModeRef = colorblindModeRef;
          (layer as any)._selectedBreakRangeRef = selectedBreakRangeRef;
          
          layer.on('click', function () {
            // Calculate break range and notify parent
            if (onBreakRangeSelect && capita !== -1 && capita != null && !isNaN(capita)) {
              const range = getBreakRange(capita, breaks);
              if (range) {
                onBreakRangeSelect(range);
              }
            }
            
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
          
          // Hover highlight
          layer.on('mouseover', function (e: any) {
            try {
              const target = e?.target as any;
              if (!target) return;
              
              // Check if filtering is active and only highlight filtered-in tracts
              const val = target?.feature?.properties?.greenspace_per_capita;
              const currentRange = (target as any)._selectedBreakRangeRef ? (target as any)._selectedBreakRangeRef.current : null;
              
              if (currentRange && val != null && !isNaN(val) && val !== -1) {
                const inRange = val > currentRange.min && val <= currentRange.max;
                if (!inRange) {
                  // Don't apply hover effect to filtered-out tracts
                  return;
                }
              }
              
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
              
              // Check if filtering is active and preserve filtered state
              let opacity = 0.5;
              let weight = 1;
              const currentRange = (target as any)._selectedBreakRangeRef ? (target as any)._selectedBreakRangeRef.current : null;
              if (currentRange && val != null && !isNaN(val) && val !== -1) {
                const inRange = val > currentRange.min && val <= currentRange.max;
                opacity = inRange ? 0.7 : 0.1;
                weight = inRange ? 2 : 1;
              }
              
              target.setStyle?.({
                color: '#222',
                weight: weight,
                fillOpacity: opacity,
                fillColor: getColor(val, currentBreaks, currentColorblindMode),
              });
            } catch (err) {
              // ignore
            }
          });
        },
      });

      layersRef.current.greenspacePerCapita = greenspacePerCapitaLayer;
      console.log('greenspacePerCapita layer created and stored in layersRef');
      
      // Add to map immediately if it's in the active layers
      if (activeLayers.has('greenspacePerCapita')) {
        greenspacePerCapitaLayer.addTo(map);
        console.log('greenspacePerCapita layer added to map on creation');
      }
      
      setLayersReady(prev => prev + 1); // Trigger visibility effect
    };

    updatePerCapitaLayer();
  }, [dataLoaded, sharedBreaks, colorblindMode, activeLayers]);

  // Update smoothed greenspace per capita layer when breaks or colorblind mode changes
  useEffect(() => {
    if (Platform.OS !== 'web' || !mapInstanceRef.current || !geojsonDataSmoothRef.current || !dataSmoothLoaded) return;

    const updatePerCapitaSmoothLayer = async () => {
      const L = await import('leaflet');
      const map = mapInstanceRef.current;
      
      // Remove existing layer if it exists
      if (layersRef.current.greenspacePerCapitaSmooth) {
        if (map.hasLayer(layersRef.current.greenspacePerCapitaSmooth)) {
          map.removeLayer(layersRef.current.greenspacePerCapitaSmooth);
        }
        // Clear the old layer reference
        delete layersRef.current.greenspacePerCapitaSmooth;
      }

      // Use shared breaks if provided AND valid, otherwise calculate from this city's data
      const breaks = (sharedBreaks && sharedBreaks.length > 0) 
        ? sharedBreaks 
        : getBreaks(geojsonDataSmoothRef.current.features, 'greenspace_per_capita', 7);
      console.log('Using breaks for smoothed greenspace per capita:', breaks);

      const greenspacePerCapitaSmoothLayer = L.geoJSON(geojsonDataSmoothRef.current, {
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
          
          // Store breaks and colorblindMode ref for hover handlers
          (layer as any)._breaksRef = breaks;
          (layer as any)._colorblindModeRef = colorblindModeRef;
          (layer as any)._selectedBreakRangeRef = selectedBreakRangeRef;
          
          layer.on('click', function () {
            // Calculate break range and notify parent
            if (onBreakRangeSelect && capita !== -1 && capita != null && !isNaN(capita)) {
              const range = getBreakRange(capita, breaks);
              if (range) {
                onBreakRangeSelect(range);
              }
            }
            
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
          
          // Hover highlight
          layer.on('mouseover', function (e: any) {
            try {
              const target = e?.target as any;
              if (!target) return;
              
              // Check if filtering is active and only highlight filtered-in tracts
              const val = target?.feature?.properties?.greenspace_per_capita;
              const currentRange = (target as any)._selectedBreakRangeRef ? (target as any)._selectedBreakRangeRef.current : null;
              
              if (currentRange && val != null && !isNaN(val) && val !== -1) {
                const inRange = val > currentRange.min && val <= currentRange.max;
                if (!inRange) {
                  // Don't apply hover effect to filtered-out tracts
                  return;
                }
              }
              
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
              
              // Check if filtering is active and preserve filtered state
              let opacity = 0.5;
              let weight = 1;
              const currentRange = (target as any)._selectedBreakRangeRef ? (target as any)._selectedBreakRangeRef.current : null;
              if (currentRange && val != null && !isNaN(val) && val !== -1) {
                const inRange = val > currentRange.min && val <= currentRange.max;
                opacity = inRange ? 0.7 : 0.1;
                weight = inRange ? 2 : 1;
              }
              
              target.setStyle?.({
                color: '#222',
                weight: weight,
                fillOpacity: opacity,
                fillColor: getColor(val, currentBreaks, currentColorblindMode),
              });
            } catch (err) {
              // ignore
            }
          });
        },
      });

      layersRef.current.greenspacePerCapitaSmooth = greenspacePerCapitaSmoothLayer;
      console.log('greenspacePerCapitaSmooth layer created and stored in layersRef');
      
      // Add to map immediately if it's in the active layers
      if (activeLayers.has('greenspacePerCapitaSmooth')) {
        greenspacePerCapitaSmoothLayer.addTo(map);
        console.log('greenspacePerCapitaSmooth layer added to map on creation');
      }
      
      setLayersReady(prev => prev + 1); // Trigger visibility effect
    };

    updatePerCapitaSmoothLayer();
  }, [dataSmoothLoaded, sharedBreaks, colorblindMode, activeLayers]);


 // Add/remove layers based on activeLayers state
  useEffect(() => {
  if (!mapInstanceRef.current) return;

  const map = mapInstanceRef.current;


  // Check each layer and add/remove accordingly
  Object.keys(layersRef.current).forEach((layerName) => {
    const layer = layersRef.current[layerName];

    if (activeLayers.has(layerName)) {
      // Add layer if it's active and not already on the map
      if (!map.hasLayer(layer)) {
        console.log(`Adding layer to map: ${layerName}`);
        layer.addTo(map);
      } else {
        console.log(`Layer ${layerName} already on map`);
      }

      // Ensure the Census Tract layer is always on top
      if (layerName === 'census') {
        layer.bringToFront();
      }
    } else {
      // Remove layer if it's inactive and currently on the map
      if (map.hasLayer(layer)) {
        console.log(`Removing layer from map: ${layerName}`);
        map.removeLayer(layer);
      }
    }
  });
}, [activeLayers, layersReady]);

  // Update census layer color when colorblindMode toggles
  useEffect(() => {
    if (Platform.OS !== 'web' || !mapInstanceRef.current) return;

    const censusLayer = layersRef.current.census;
    if (!censusLayer) return;

    try {
      censusLayer.eachLayer((layer: any) => {
        if (layer && typeof layer.setStyle === 'function') {
          layer.setStyle({ color: colorblindMode ? '#ffff00' : '#5833ff' });
        }
      });
    } catch (err) {
      console.error('Error updating census layer style for colorblindMode:', err);
    }
  }, [colorblindMode]);

  // Filter layers by selected break range
  useEffect(() => {
    if (Platform.OS !== 'web' || !mapInstanceRef.current || !selectedBreakRange) return;
    if (!sharedBreaks || sharedBreaks.length === 0) return;

    const filterLayer = (layerName: string) => {
      const layer = layersRef.current[layerName];
      if (!layer) return;

      try {
        (layer as any).eachLayer((sublayer: any) => {
          const val = sublayer?.feature?.properties?.greenspace_per_capita;
          const currentBreaks = (sublayer as any)._breaksRef || sharedBreaks;
          const currentColorblindMode = (sublayer as any)._colorblindModeRef ? (sublayer as any)._colorblindModeRef.current : false;
          
          if (val == null || isNaN(val) || val === -1) {
            // Dim out invalid values
            sublayer.setStyle?.({ 
              fillOpacity: 0.1,
              fillColor: getColor(val, currentBreaks, currentColorblindMode)
            });
          } else {
            // Check if value is in selected range
            const inRange = val > selectedBreakRange.min && val <= selectedBreakRange.max;
            sublayer.setStyle?.({ 
              fillOpacity: inRange ? 0.7 : 0.1,
              weight: inRange ? 2 : 1,
              fillColor: getColor(val, currentBreaks, currentColorblindMode)
            });
          }
        });
      } catch (err) {
        console.error(`Error filtering layer ${layerName}:`, err);
      }
    };

    filterLayer('greenspacePerCapita');
    filterLayer('greenspacePerCapitaSmooth');
  }, [selectedBreakRange, sharedBreaks]);

  // Reset filter when selectedBreakRange is cleared
  useEffect(() => {
    if (Platform.OS !== 'web' || !mapInstanceRef.current || selectedBreakRange !== null) return;
    if (!sharedBreaks || sharedBreaks.length === 0) return;

    const resetLayer = (layerName: string) => {
      const layer = layersRef.current[layerName];
      if (!layer) return;

      try {
        (layer as any).eachLayer((sublayer: any) => {
          const val = sublayer?.feature?.properties?.greenspace_per_capita;
          const currentBreaks = (sublayer as any)._breaksRef || sharedBreaks;
          const currentColorblindMode = (sublayer as any)._colorblindModeRef ? (sublayer as any)._colorblindModeRef.current : false;
          
          sublayer.setStyle?.({ 
            fillOpacity: 0.5, 
            weight: 1,
            fillColor: getColor(val, currentBreaks, currentColorblindMode)
          });
        });
      } catch (err) {
        console.error(`Error resetting layer ${layerName}:`, err);
      }
    };

    resetLayer('greenspacePerCapita');
    resetLayer('greenspacePerCapitaSmooth');
  }, [selectedBreakRange, sharedBreaks]);

  if (Platform.OS !== 'web') return null;

  return <div ref={mapRef} style={{ width: '100%', height: '100%' }} />;
}

//-----------------------------

const COLLAPSED_HEIGHT = 80; // Reduced from 100
const EXPANDED_HEIGHT = 400; // Reduced from 500
const CITY_COLLAPSED_HEIGHT = 60; // Reduced from 72
const CITY_EXPANDED_HEIGHT = 150; // Reduced from 180

export default function CompareScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const [cities, setCities] = useState<City[]>(CITIES);
  const [leftCity, setLeftCity] = useState<City>(CITIES[0]);
  const [rightCity, setRightCity] = useState<City>(CITIES[1]);
  const [isExpanded, setIsExpanded] = useState<boolean>(false);
  const [cityDrawerExpanded, setCityDrawerExpanded] = useState<boolean>(false);
  const [activeLayers, setActiveLayers] = useState<Set<string>>(new Set(['greenspacePerCapita'])); // Changed default layer
  const [sharedBreaks, setSharedBreaks] = useState<number[]>([]);
  const [legendExpanded, setLegendExpanded] = useState<boolean>(true);
  const [colorblindMode, setColorblindMode] = useState<boolean>(false);
  const [baseMap, setBaseMap] = useState<BaseMapType>('streets');
  const [showBaseMapSelector, setShowBaseMapSelector] = useState<boolean>(false);
  const legendPosition = useRef(new Animated.ValueXY({ x: 0, y: 0 })).current;
  const [isDragging, setIsDragging] = useState(false);
  const [leftSelectedRange, setLeftSelectedRange] = useState<{ min: number; max: number } | null>(null);
  const [rightSelectedRange, setRightSelectedRange] = useState<{ min: number; max: number } | null>(null);
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
      // Update selected cities if they're currently showing placeholder data
      if (leftCity.totalArea === 0) {
        const updatedCity = loadedCities.find(c => c.id === leftCity.id);
        if (updatedCity) setLeftCity(updatedCity);
      }
      if (rightCity.totalArea === 0) {
        const updatedCity = loadedCities.find(c => c.id === rightCity.id);
        if (updatedCity) setRightCity(updatedCity);
      }
    });
  }, []);

  // Calculate shared breaks when cities change
  useEffect(() => {
    const fetchAndCalculateBreaks = async () => {
      try {
        // Determine which URLs to use based on active layers
        const useSmooth = activeLayers.has('greenspacePerCapitaSmooth');
        const leftUrl = useSmooth 
          ? leftCity.geojsonFiles?.greenspacePerCapitaSmooth 
          : leftCity.geojsonFiles?.greenspacePerCapita;
        const rightUrl = useSmooth 
          ? rightCity.geojsonFiles?.greenspacePerCapitaSmooth 
          : rightCity.geojsonFiles?.greenspacePerCapita;
        
        if (!leftUrl || !rightUrl) return;

        const [leftResponse, rightResponse] = await Promise.all([
          fetch(leftUrl),
          fetch(rightUrl)
        ]);

        const [leftData, rightData] = await Promise.all([
          leftResponse.json(),
          rightResponse.json()
        ]);

        // Combine features from both cities
        const combinedFeatures = [...leftData.features, ...rightData.features];
        
        // Calculate breaks from combined data
        const breaks = getBreaks(combinedFeatures, 'greenspace_per_capita', 7);
        console.log('Shared breaks calculated:', breaks);
        setSharedBreaks(breaks);
      } catch (error) {
        console.error('Error calculating shared breaks:', error);
      }
    };

    fetchAndCalculateBreaks();
  }, [leftCity, rightCity, activeLayers]);

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
    
    // Clear selected break ranges when toggling greenspace layers
    // This prevents the hover bug where switching layers causes tract colors to be erased
    if (layerName === 'greenspacePerCapita' || layerName === 'greenspacePerCapitaSmooth') {
      setLeftSelectedRange(null);
      setRightSelectedRange(null);
    }
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

  const swapCities = () => {
    const temp = leftCity;
    setLeftCity(rightCity);
    setRightCity(temp);
  };

  const legendPanResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => false,
      onMoveShouldSetPanResponder: (evt, gestureState) => {
        // Only start dragging if moved more than 5 pixels
        return Math.abs(gestureState.dx) > 5 || Math.abs(gestureState.dy) > 5;
      },
      onPanResponderGrant: () => {
        setIsDragging(true);
        legendPosition.setOffset({
          x: (legendPosition.x as any)._value,
          y: (legendPosition.y as any)._value,
        });
      },
      onPanResponderMove: Animated.event(
        [
          null,
          { dx: legendPosition.x, dy: legendPosition.y },
        ],
        { useNativeDriver: false }
      ),
      onPanResponderRelease: () => {
        setIsDragging(false);
        legendPosition.flattenOffset();
      },
    })
  ).current;

  return (
    <View style={styles.container}>
      <Stack.Screen
        options={{
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
        </TouchableOpacity>
      ) : (
        <Animated.View style={[styles.cityDrawer, { height: animatedCityHeight }]}>
          <TouchableOpacity style={styles.sheetHeader} onPress={toggleCityDrawer} activeOpacity={0.8}>
            <View style={styles.dragHandle} />
            <View style={styles.sheetHeaderContent}>
              <Text style={styles.factsTitle}>Select Cities to Compare</Text>
              {cityDrawerExpanded ? <ChevronDown size={24} color="#1B5E20" /> : <ChevronUp size={24} color="#1B5E20" />}
            </View>
          </TouchableOpacity>
          
          <View style={styles.citySelectorContainer}>
          <View style={styles.citySelectorSection}>
            <Text style={styles.citySelectorLabel}>Left City</Text>
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
                    leftCity.id === city.id && styles.cityCardActive,
                  ]}
                  onPress={() => { setLeftCity(city); }}
                >
                  <Text
                    style={[
                      styles.cityCardName,
                      leftCity.id === city.id && styles.cityCardNameActive,
                    ]}
                  >
                    {city.name}
                  </Text>
                  <Text
                    style={[
                      styles.cityCardCountry,
                      leftCity.id === city.id && styles.cityCardCountryActive,
                    ]}
                  >
                    {city.country}
                  </Text>
                </TouchableOpacity>
              ))}
            </ScrollView>
          </View>
          
          <View style={styles.citySelectorSection}>
            <Text style={styles.citySelectorLabel}>Right City</Text>
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
                    rightCity.id === city.id && styles.cityCardActive,
                  ]}
                  onPress={() => { setRightCity(city); }}
                >
                  <Text
                    style={[
                      styles.cityCardName,
                      rightCity.id === city.id && styles.cityCardNameActive,
                    ]}
                  >
                    {city.name}
                  </Text>
                  <Text
                    style={[
                      styles.cityCardCountry,
                      rightCity.id === city.id && styles.cityCardCountryActive,
                    ]}
                  >
                    {city.country}
                  </Text>
                </TouchableOpacity>
              ))}
            </ScrollView>
          </View>
        </View>
        </Animated.View>
      )}

      <View style={styles.splitMapContainer}>
        <View style={styles.leftMapContainer}>
          <View style={styles.mapWrapper}>
            {Platform.OS === 'web' ? (
              <LeafletMap 
                key={`left-${leftCity.id}`} 
                city={leftCity} 
                greenSpaceColors={GREEN_SPACE_COLORS} 
                activeLayers={activeLayers}
                sharedBreaks={sharedBreaks.length > 0 ? sharedBreaks : undefined}
                colorblindMode={colorblindMode}
                baseMap={baseMap}
                selectedBreakRange={rightSelectedRange}
                onBreakRangeSelect={(range) => {
                  setLeftSelectedRange(range);
                  setRightSelectedRange(null);
                }}
              />
            ) : (
              <View style={styles.nativeMapPlaceholder}>
                <MapPin size={48} color="#2E7D32" />
                <Text style={styles.placeholderText}>
                  Map view for {leftCity.name}
                </Text>
              </View>
            )}
          </View>
          <TouchableOpacity 
            style={[
              styles.cityLabel, 
              styles.clickableCityLabel,
              Platform.OS === 'web' && { cursor: 'pointer' as any, position: 'absolute' as any, zIndex: 99999 }
            ]}
            onPress={() => {
              console.log('Swap button clicked!');
              swapCities();
            }}
            activeOpacity={0.7}
          >
            <Text style={styles.cityLabelText}>{leftCity.name}</Text>
            <Text style={styles.cityLabelSwapHint}>👆 Tap to swap →</Text>
          </TouchableOpacity>
        </View>
        
        <View style={styles.divider} />
        
        <View style={styles.rightMapContainer}>
          <View style={styles.mapWrapper}>
            {Platform.OS === 'web' ? (
              <LeafletMap 
                key={`right-${rightCity.id}`} 
                city={rightCity} 
                greenSpaceColors={GREEN_SPACE_COLORS} 
                activeLayers={activeLayers}
                sharedBreaks={sharedBreaks.length > 0 ? sharedBreaks : undefined}
                colorblindMode={colorblindMode}
                baseMap={baseMap}
                selectedBreakRange={leftSelectedRange}
                onBreakRangeSelect={(range) => {
                  setRightSelectedRange(range);
                  setLeftSelectedRange(null);
                }}
              />
            ) : (
              <View style={styles.nativeMapPlaceholder}>
                <MapPin size={48} color="#2E7D32" />
                <Text style={styles.placeholderText}>
                  Map view for {rightCity.name}
                </Text>
              </View>
            )}
          </View>
          <View style={styles.cityLabel}>
            <Text style={styles.cityLabelText}>{rightCity.name}</Text>
          </View>
        </View>
        
        {/* Clear filter button */}
        {(leftSelectedRange || rightSelectedRange) && (
          <TouchableOpacity 
            style={[styles.clearFilterButton, { bottom: insets.bottom + 20 }]}
            onPress={() => {
              setLeftSelectedRange(null);
              setRightSelectedRange(null);
            }}
            activeOpacity={0.8}
          >
            <Text style={styles.clearFilterText}>✕ Clear Filter</Text>
          </TouchableOpacity>
        )}

        {(activeLayers.has('greenspacePerCapita') || activeLayers.has('greenspacePerCapitaSmooth')) && sharedBreaks.length > 0 && (
          <Animated.View 
            style={[
              styles.legend,
              isSmartphone && { bottom: insets.bottom + 20, left: 220 },
              isSmartphone && !legendExpanded && { width: 120, left: undefined, right: 16, paddingHorizontal: 8 },
              {
                transform: [
                  { translateX: legendPosition.x },
                  { translateY: legendPosition.y },
                ],
              },
              isDragging && { opacity: 0.8 },
            ]}
            {...legendPanResponder.panHandlers}
          >
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
                {!legendExpanded && isSmartphone ? (
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                    <Trees size={20} color="#2E7D32" />
                    <View style={{ flexDirection: 'row', gap: 4 }}>
                      <View style={[styles.legendDotSmall, { backgroundColor: colorblindMode ? '#c7e9b4' : '#bf0000' }]} />
                      <View style={[styles.legendDotSmall, { backgroundColor: colorblindMode ? '#41b6c4' : '#f7c948' }]} />
                      <View style={[styles.legendDotSmall, { backgroundColor: colorblindMode ? '#081d58' : '#2d6a4f' }]} />
                    </View>
                  </View>
                ) : (
                  <>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                      <Text style={styles.legendTitle}>Greenspace per Capita (m²)</Text>
                      {!isSmartphone && (
                        <Text style={styles.legendHint}>
                          {legendExpanded ? '(tap to hide)' : '(tap to show)'}
                        </Text>
                      )}
                    </View>
                    {legendExpanded ? <ChevronDown size={18} color="#2E7D32" strokeWidth={2.5} /> : <ChevronUp size={18} color="#2E7D32" strokeWidth={2.5} />}
                  </>
                )}
              </TouchableOpacity>
            </View>
            {legendExpanded && (
              <View style={styles.legendItems} pointerEvents="box-none">
                <View style={styles.legendItem}>
                  <View style={[styles.legendColor, { backgroundColor: colorblindMode ? '#081d58' : '#2d6a4f' }]} />
                  <Text style={styles.legendText}>&gt; {sharedBreaks[5]?.toFixed(0)}</Text>
                </View>
                <View style={styles.legendItem}>
                  <View style={[styles.legendColor, { backgroundColor: colorblindMode ? '#253494' : '#21918c' }]} />
                  <Text style={styles.legendText}>{sharedBreaks[4]?.toFixed(0)} - {sharedBreaks[5]?.toFixed(0)}</Text>
                </View>
                <View style={styles.legendItem}>
                  <View style={[styles.legendColor, { backgroundColor: colorblindMode ? '#225ea8' : '#5ec962' }]} />
                  <Text style={styles.legendText}>{sharedBreaks[3]?.toFixed(0)} - {sharedBreaks[4]?.toFixed(0)}</Text>
                </View>
                <View style={styles.legendItem}>
                  <View style={[styles.legendColor, { backgroundColor: colorblindMode ? '#1d91c0' : '#b7e28a' }]} />
                  <Text style={styles.legendText}>{sharedBreaks[2]?.toFixed(0)} - {sharedBreaks[3]?.toFixed(0)}</Text>
                </View>
                <View style={styles.legendItem}>
                  <View style={[styles.legendColor, { backgroundColor: colorblindMode ? '#41b6c4' : '#f7c948' }]} />
                  <Text style={styles.legendText}>{sharedBreaks[1]?.toFixed(0)} - {sharedBreaks[2]?.toFixed(0)}</Text>
                </View>
                <View style={styles.legendItem}>
                  <View style={[styles.legendColor, { backgroundColor: colorblindMode ? '#7fcdbb' : '#e36c0a' }]} />
                  <Text style={styles.legendText}>{sharedBreaks[0]?.toFixed(0)} - {sharedBreaks[1]?.toFixed(0)}</Text>
                </View>
                <View style={styles.legendItem}>
                  <View style={[styles.legendColor, { backgroundColor: colorblindMode ? '#c7e9b4' : '#bf0000' }]} />
                  <Text style={styles.legendText}>&lt; {sharedBreaks[0]?.toFixed(0)}</Text>
                </View>
                <View style={styles.legendItem}>
                  <View style={[styles.legendColor, { backgroundColor: '#999999' }]} />
                  <Text style={styles.legendText}>No residents</Text>
                </View>
              </View>
            )}
          </Animated.View>
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
          {!isSmartphone && <Text style={styles.factsButtonText}>Comparison Stats</Text>}
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
              <Text style={styles.factsTitle}>Comparison Stats</Text>
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
        <View style={styles.comparisonGrid}>
          <View style={styles.comparisonColumn}>
            <Text style={styles.comparisonCityName}>{leftCity.name}</Text>
            <View style={styles.factCard}>
              <View style={styles.factIconContainer}>
                <Leaf size={18} color="#2E7D32" />
              </View>
              <Text style={styles.factValue}>
                {leftCity.greenSpacePercentage}%
              </Text>
              <Text style={styles.factLabel}>Coverage</Text>
            </View>
            <View style={styles.factCard}>
              <View style={styles.factIconContainer}>
                <Users size={18} color="#2E7D32" />
              </View>
              <Text style={styles.factValue} numberOfLines={2} adjustsFontSizeToFit>
                {(leftCity.greenSpacePercentage * leftCity.totalArea / leftCity.population * 1000000).toFixed(0)} m²
              </Text>
              <Text style={styles.factLabel}>Per Capita</Text>
            </View>
            <View style={styles.factCard}>
              <View style={styles.factIconContainer}>
                <MapPin size={18} color="#2E7D32" />
              </View>
              <Text style={styles.factValue} numberOfLines={2} adjustsFontSizeToFit>
                {leftCity.totalArea.toFixed(1)} km²
              </Text>
              <Text style={styles.factLabel}>Total Area</Text>
            </View>
          </View>
          
          <View style={styles.comparisonDivider} />
          
          <View style={styles.comparisonColumn}>
            <Text style={styles.comparisonCityName}>{rightCity.name}</Text>
            <View style={styles.factCard}>
              <View style={styles.factIconContainer}>
                <Leaf size={18} color="#2E7D32" />
              </View>
              <Text style={styles.factValue}>
                {rightCity.greenSpacePercentage}%
              </Text>
              <Text style={styles.factLabel}>Coverage</Text>
            </View>
            <View style={styles.factCard}>
              <View style={styles.factIconContainer}>
                <Users size={18} color="#2E7D32" />
              </View>
              <Text style={styles.factValue} numberOfLines={2} adjustsFontSizeToFit>
                {(rightCity.greenSpacePercentage * rightCity.totalArea / rightCity.population * 1000000).toFixed(0)} m²
              </Text>
              <Text style={styles.factLabel}>Per Capita</Text>
            </View>
            <View style={styles.factCard}>
              <View style={styles.factIconContainer}>
                <MapPin size={18} color="#2E7D32" />
              </View>
              <Text style={styles.factValue} numberOfLines={2} adjustsFontSizeToFit>
                {rightCity.totalArea.toFixed(1)} km²
              </Text>
              <Text style={styles.factLabel}>Total Area</Text>
            </View>
          </View>
        </View>
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
    overflow: 'hidden',
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
    backgroundColor: '#F5F9F5',
    padding: 12,
    borderRadius: 16,
    alignItems: 'center',
    gap: 6,
    minWidth: 0, // Allow card to shrink
  },
  factIconContainer: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#E8F5E9',
    justifyContent: 'center',
    alignItems: 'center',
  },
  factValue: {
    fontSize: 20,
    fontWeight: '700' as const,
    color: '#1B5E20',
    textAlign: 'center',
    flexWrap: 'wrap',
  },
  factLabel: {
    fontSize: 11,
    color: '#558B2F',
    textAlign: 'center',
    flexWrap: 'wrap',
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
  citySelectorContainer: {
    gap: 12,
  },
  citySelectorSection: {
    marginBottom: 8,
  },
  citySelectorLabel: {
    fontSize: 14,
    fontWeight: '600' as const,
    color: '#1B5E20',
    marginBottom: 8,
    paddingHorizontal: 4,
  },
  splitMapContainer: {
    flex: 1,
    flexDirection: 'row',
    backgroundColor: '#E8F5E9',
  },
  leftMapContainer: {
    flex: 1,
    position: 'relative',
  },
  rightMapContainer: {
    flex: 1,
    position: 'relative',
  },
  mapWrapper: {
    width: '100%',
    height: '100%',
    position: 'relative',
  },
  divider: {
    width: 2,
    backgroundColor: '#2E7D32',
  },
  cityLabel: {
    position: 'absolute',
    top: 80,
    left: 10,
    backgroundColor: '#FFFFFF',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.15,
    shadowRadius: 4,
    elevation: 4,
    zIndex: 10000,
  },
  clickableCityLabel: {
    borderWidth: 2,
    borderColor: '#2E7D32',
    borderStyle: 'dashed' as any,
    backgroundColor: '#E8F5E9',
  },
  cityLabelText: {
    fontSize: 14,
    fontWeight: '700' as const,
    color: '#1B5E20',
  },
  cityLabelSwapHint: {
    fontSize: 11,
    color: '#2E7D32',
    marginTop: 4,
    fontWeight: '600' as const,
  },
  comparisonGrid: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 16,
    marginBottom: 16,
  },
  comparisonColumn: {
    flex: 1,
    gap: 8,
    minWidth: 0, // Allow column to shrink below content size
  },
  comparisonDivider: {
    width: 1,
    backgroundColor: '#C8E6C9',
  },
  comparisonCityName: {
    fontSize: 14,
    fontWeight: '700' as const,
    color: '#1B5E20',
    textAlign: 'center',
    marginBottom: 8,
    flexWrap: 'wrap',
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
  legendDotSmall: {
    width: 8,
    height: 8,
    borderRadius: 4,
    borderWidth: 1,
    borderColor: '#E0E0E0',
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
  clearFilterButton: {
    position: 'absolute',
    right: 20,
    backgroundColor: '#2E7D32',
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderRadius: 10,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 4,
    elevation: 5,
    zIndex: 1000,
  },
  clearFilterText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '600' as const,
  },
});
