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
import { Stack } from 'expo-router';
import { Leaf, MapPin, Trees, Users, ChevronDown, ChevronUp, Layers } from 'lucide-react-native';
import { CITIES, City } from '@/constants/cities';
import { Asset } from 'expo-asset';


const { width } = Dimensions.get('window');

const GREEN_SPACE_COLORS = {
  park: '#4CAF50',
  forest: '#2E7D32',
  garden: '#66BB6A',
  reserve: '#1B5E20',
};

type LeafletMapProps = {
  city: City;
  greenSpaceColors: Record<string, string>;
  activeLayers: Set<string>;
  sharedBreaks?: number[];
  colorblindMode?: boolean;
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

// Helper function to get color based on value and breaks (matching webapp.js)
function getColor(value: number | null | undefined, breaks: number[], colorblindMode: boolean = false): string {
  if (value == null || isNaN(value)) return colorblindMode ? '#440154' : '#660000ff'; // no greenspace
  if (value === -1) return '#999999'; // no residents
  
  if (colorblindMode) {
    // Viridis color scheme (yellow-green-blue) - colorblind friendly
    if (value <= breaks[0]) return '#440154'; // dark purple/blue (lowest)
    if (value <= breaks[1]) return '#31688e';
    if (value <= breaks[2]) return '#35b779';
    if (value <= breaks[3]) return '#6ece58';
    if (value <= breaks[4]) return '#b5de2b';
    if (value <= breaks[5]) return '#fde724';
    return '#ffff00'; // bright yellow (highest)
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

function LeafletMap({ city, activeLayers, sharedBreaks, colorblindMode = false }: LeafletMapProps) {
  const mapRef = useRef<HTMLDivElement>(null);
  const mapInstanceRef = useRef<any>(null);
  const layersRef = useRef<Record<string, any>>({}); // Store references to layers
  const geojsonDataRef = useRef<any>(null); // Store GeoJSON data for re-rendering
  const [dataLoaded, setDataLoaded] = useState(false);

  // Initialize map only once per city
  useEffect(() => {
    if (Platform.OS !== 'web' || !mapRef.current) return;
    
    setDataLoaded(false);

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

      if (!mapRef.current) return;

      // Initialize the map
      const map = L.map(mapRef.current).setView(
        [city.coordinates.latitude, city.coordinates.longitude],
        12
      );

      // Add OpenStreetMap tile layer
      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '© OpenStreetMap contributors',
        maxZoom: 18,
      }).addTo(map);

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
            style: {
              color: '#5833ff', // Blue color for census tracts
              weight: 2,
              fillOpacity: 0.0,
            },
            onEachFeature: (feature, layer) => {
              const population = feature.properties.pop21;
              layer.bindPopup(
                `<strong>Census Tract</strong><br/>Population: ${
                  population !== undefined ? population : 'N/A'
                }`
              );
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
      
      mapInstanceRef.current = map;
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
      setDataLoaded(false);
    };
  }, [city]);

  // Update greenspace per capita layer when breaks or colorblind mode changes
  useEffect(() => {
    if (Platform.OS !== 'web' || !mapInstanceRef.current || !geojsonDataRef.current || !dataLoaded) return;

    const updatePerCapitaLayer = async () => {
      const L = await import('leaflet');
      const map = mapInstanceRef.current;
      
      // Remove existing layer if it exists
      if (layersRef.current.greenspacePerCapita && map.hasLayer(layersRef.current.greenspacePerCapita)) {
        map.removeLayer(layersRef.current.greenspacePerCapita);
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
        },
      });

      layersRef.current.greenspacePerCapita = greenspacePerCapitaLayer;
      
      // Add to map if it's in the active layers
      if (activeLayers.has('greenspacePerCapita')) {
        greenspacePerCapitaLayer.addTo(map);
      }
    };

    updatePerCapitaLayer();
  }, [dataLoaded, sharedBreaks, colorblindMode, activeLayers]);


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
        layer.addTo(map);
      }

      // Ensure the Census Tract layer is always on top
      if (layerName === 'census') {
        layer.bringToFront();
      }
    } else {
      // Remove layer if it's inactive and currently on the map
      if (map.hasLayer(layer)) {
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

export default function CompareScreen() {
  const insets = useSafeAreaInsets();
  const [leftCity, setLeftCity] = useState<City>(CITIES[0]);
  const [rightCity, setRightCity] = useState<City>(CITIES[1]);
  const [isExpanded, setIsExpanded] = useState<boolean>(false);
  const [cityDrawerExpanded, setCityDrawerExpanded] = useState<boolean>(false);
  const [activeLayers, setActiveLayers] = useState<Set<string>>(new Set(['greenspacePerCapita'])); // Changed default layer
  const [sharedBreaks, setSharedBreaks] = useState<number[]>([]);
  const [legendExpanded, setLegendExpanded] = useState<boolean>(true);
  const [colorblindMode, setColorblindMode] = useState<boolean>(false);
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

  // Calculate shared breaks when cities change
  useEffect(() => {
    const fetchAndCalculateBreaks = async () => {
      try {
        const leftUrl = leftCity.geojsonFiles?.greenspacePerCapita;
        const rightUrl = rightCity.geojsonFiles?.greenspacePerCapita;
        
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
  }, [leftCity, rightCity]);

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

  const swapCities = () => {
    const temp = leftCity;
    setLeftCity(rightCity);
    setRightCity(temp);
  };

  return (
    <View style={styles.container}>
      <Stack.Screen
        options={{
          title: 'Compare Cities',
          headerStyle: {
            backgroundColor: '#FFFFFF',
          },
          headerTintColor: '#1B5E20',
          headerTitleStyle: {
            fontWeight: '700' as const,
          },
        }}
      />

      {isSmartphone && !cityDrawerExpanded ? (
        <TouchableOpacity 
          style={styles.cityButtonCompact}
          onPress={toggleCityDrawer}
          activeOpacity={0.8}
        >
          <MapPin size={20} color="#FFFFFF" />
          <Text style={styles.cityButtonText}>{leftCity.name} vs {rightCity.name}</Text>
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
              {CITIES.map((city) => (
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
              {CITIES.map((city) => (
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
        
        <TouchableOpacity 
          style={styles.layerButton}
          onPress={() => setShowLayerSelector(!showLayerSelector)}
          activeOpacity={0.8}
        >
          <Layers size={20} color="#FFFFFF" />
        </TouchableOpacity>

        <TouchableOpacity 
          style={styles.colorblindButton}
          onPress={() => setColorblindMode(!colorblindMode)}
          activeOpacity={0.8}
        >
          <Text style={styles.colorblindButtonText}>
            {colorblindMode ? '👁️' : '🎨'}
          </Text>
        </TouchableOpacity>

        {activeLayers.has('greenspacePerCapita') && sharedBreaks.length > 0 && (
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
                <Text style={styles.legendTitle}>Greenspace per Capita (m²)</Text>
                {legendExpanded ? <ChevronDown size={16} color="#1B5E20" /> : <ChevronUp size={16} color="#1B5E20" />}
              </TouchableOpacity>
            </View>
            {legendExpanded && (
              <View style={styles.legendItems} pointerEvents="box-none">
                <View style={styles.legendItem}>
                  <View style={[styles.legendColor, { backgroundColor: colorblindMode ? '#ffff00' : '#2d6a4f' }]} />
                  <Text style={styles.legendText}>&gt; {sharedBreaks[5]?.toFixed(0)}</Text>
                </View>
                <View style={styles.legendItem}>
                  <View style={[styles.legendColor, { backgroundColor: colorblindMode ? '#fde724' : '#21918c' }]} />
                  <Text style={styles.legendText}>{sharedBreaks[4]?.toFixed(0)} - {sharedBreaks[5]?.toFixed(0)}</Text>
                </View>
                <View style={styles.legendItem}>
                  <View style={[styles.legendColor, { backgroundColor: colorblindMode ? '#b5de2b' : '#5ec962' }]} />
                  <Text style={styles.legendText}>{sharedBreaks[3]?.toFixed(0)} - {sharedBreaks[4]?.toFixed(0)}</Text>
                </View>
                <View style={styles.legendItem}>
                  <View style={[styles.legendColor, { backgroundColor: colorblindMode ? '#6ece58' : '#b7e28a' }]} />
                  <Text style={styles.legendText}>{sharedBreaks[2]?.toFixed(0)} - {sharedBreaks[3]?.toFixed(0)}</Text>
                </View>
                <View style={styles.legendItem}>
                  <View style={[styles.legendColor, { backgroundColor: colorblindMode ? '#35b779' : '#f7c948' }]} />
                  <Text style={styles.legendText}>{sharedBreaks[1]?.toFixed(0)} - {sharedBreaks[2]?.toFixed(0)}</Text>
                </View>
                <View style={styles.legendItem}>
                  <View style={[styles.legendColor, { backgroundColor: colorblindMode ? '#31688e' : '#e36c0a' }]} />
                  <Text style={styles.legendText}>{sharedBreaks[0]?.toFixed(0)} - {sharedBreaks[1]?.toFixed(0)}</Text>
                </View>
                <View style={styles.legendItem}>
                  <View style={[styles.legendColor, { backgroundColor: colorblindMode ? '#440154' : '#bf0000' }]} />
                  <Text style={styles.legendText}>&lt; {sharedBreaks[0]?.toFixed(0)}</Text>
                </View>
                <View style={styles.legendItem}>
                  <View style={[styles.legendColor, { backgroundColor: '#999999' }]} />
                  <Text style={styles.legendText}>No residents</Text>
                </View>
              </View>
            )}
          </View>
        )}

         {showLayerSelector && (
          <View style={[styles.layerSelector, { maxHeight: windowDimensions.height - 150 }]}>
            <Text style={styles.layerSelectorTitle}>Map Layers</Text>
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
            </ScrollView>
          </View>
        )}
      </View>

      {isSmartphone && !isExpanded ? (
        <TouchableOpacity 
          style={[styles.factsButtonCompact, { bottom: insets.bottom + 20 }]}
          onPress={toggleSheet}
          activeOpacity={0.8}
        >
          <Leaf size={20} color="#FFFFFF" />
          <Text style={styles.factsButtonText}>Comparison Stats</Text>
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
    marginBottom: 12,
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
  layerButton: {
    position: 'absolute',
    top: 65, // moved up 75 from previous 80
    right: 20,
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: '#2E7D32',
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 4,
    elevation: 5,
    zIndex: 1000, // Move zIndex here
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
  layerSelectorTitle: {
    fontSize: 16,
    fontWeight: '700' as const,
    color: '#1B5E20',
    marginBottom: 16,
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
    left: '50%',
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
    width: 240,
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
  colorblindButton: {
    position: 'absolute',
    bottom: 90,
    right: 20,
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: '#2E7D32',
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 4,
    elevation: 5,
    zIndex: 1000,
  },
  colorblindButtonText: {
    fontSize: 20,
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
