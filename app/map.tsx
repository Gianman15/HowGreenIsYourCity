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
  onBreaksCalculated?: (breaks: number[]) => void;
  colorblindMode?: boolean;
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

function LeafletMap({ city, activeLayers, onBreaksCalculated, colorblindMode = false }: LeafletMapProps) {
  const mapRef = useRef<HTMLDivElement>(null);
  const mapInstanceRef = useRef<any>(null);
  const layersRef = useRef<Record<string, any>>({}); // Store references to layers

  useEffect(() => {
    if (Platform.OS !== 'web' || !mapRef.current) return;

    const initMap = async () => {
      const L = await import('leaflet');

      // Clean up existing map instance and layers first
      if (mapInstanceRef.current) {
        mapInstanceRef.current.remove();
        mapInstanceRef.current = null;
      }
      
      // Clear layer references
      layersRef.current = {};

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
    };
  }, [city, colorblindMode]);


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

export default function HomeScreen() {
  const insets = useSafeAreaInsets();
  const [selectedCity, setSelectedCity] = useState<City>(CITIES[0]);
  const [isExpanded, setIsExpanded] = useState<boolean>(false);
  const [cityDrawerExpanded, setCityDrawerExpanded] = useState<boolean>(false);
  const [activeLayers, setActiveLayers] = useState<Set<string>>(new Set(['greenspacePerCapita'])); // Changed default layer
  const [showLayerSelector, setShowLayerSelector] = useState<boolean>(true);
  const [cityBreaks, setCityBreaks] = useState<number[]>([]);
  const [legendExpanded, setLegendExpanded] = useState<boolean>(true);
  const [colorblindMode, setColorblindMode] = useState<boolean>(false);
  const animatedHeight = useRef(new Animated.Value(COLLAPSED_HEIGHT)).current;
  const animatedCityHeight = useRef(new Animated.Value(CITY_COLLAPSED_HEIGHT)).current;

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
        }}
      />

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
          {CITIES.map((city) => (
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

      <View style={styles.mapContainer}>
        {Platform.OS === 'web' ? (
          <LeafletMap 
            city={selectedCity} 
            greenSpaceColors={GREEN_SPACE_COLORS} 
            activeLayers={activeLayers}
            onBreaksCalculated={setCityBreaks}
            colorblindMode={colorblindMode}
          />
        ) : (
          <View style={styles.nativeMapPlaceholder}>
            <MapPin size={48} color="#2E7D32" />
            <Text style={styles.placeholderText}>
              Map view for {selectedCity.name}
            </Text>
          </View>
        )}
        
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

        {activeLayers.has('greenspacePerCapita') && cityBreaks.length > 0 && (
          <View style={styles.legend}>
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
                  <Text style={styles.legendText}>&gt; {cityBreaks[5]?.toFixed(0)}</Text>
                </View>
                <View style={styles.legendItem}>
                  <View style={[styles.legendColor, { backgroundColor: colorblindMode ? '#fde724' : '#21918c' }]} />
                  <Text style={styles.legendText}>{cityBreaks[4]?.toFixed(0)} - {cityBreaks[5]?.toFixed(0)}</Text>
                </View>
                <View style={styles.legendItem}>
                  <View style={[styles.legendColor, { backgroundColor: colorblindMode ? '#b5de2b' : '#5ec962' }]} />
                  <Text style={styles.legendText}>{cityBreaks[3]?.toFixed(0)} - {cityBreaks[4]?.toFixed(0)}</Text>
                </View>
                <View style={styles.legendItem}>
                  <View style={[styles.legendColor, { backgroundColor: colorblindMode ? '#6ece58' : '#b7e28a' }]} />
                  <Text style={styles.legendText}>{cityBreaks[2]?.toFixed(0)} - {cityBreaks[3]?.toFixed(0)}</Text>
                </View>
                <View style={styles.legendItem}>
                  <View style={[styles.legendColor, { backgroundColor: colorblindMode ? '#35b779' : '#f7c948' }]} />
                  <Text style={styles.legendText}>{cityBreaks[1]?.toFixed(0)} - {cityBreaks[2]?.toFixed(0)}</Text>
                </View>
                <View style={styles.legendItem}>
                  <View style={[styles.legendColor, { backgroundColor: colorblindMode ? '#31688e' : '#e36c0a' }]} />
                  <Text style={styles.legendText}>{cityBreaks[0]?.toFixed(0)} - {cityBreaks[1]?.toFixed(0)}</Text>
                </View>
                <View style={styles.legendItem}>
                  <View style={[styles.legendColor, { backgroundColor: colorblindMode ? '#440154' : '#bf0000' }]} />
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

         {showLayerSelector && (
          <View style={styles.layerSelector}>
            <Text style={styles.layerSelectorTitle}>Map Layers</Text>
            
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
          </View>
        )}
      </View>

      <Animated.View style={[styles.factsContainer, { height: animatedHeight, paddingBottom: 20 + insets.bottom }]}>
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
        <View style={styles.factsGrid}>
          <View style={styles.factCard}>
            <View style={styles.factIconContainer}>
              <Leaf size={24} color="#2E7D32" />
            </View>
            <Text style={styles.factValue}>
              {selectedCity.greenSpacePercentage}%
            </Text>
            <Text style={styles.factLabel}>Green Space Coverage</Text>
          </View>

          <View style={styles.factCard}>
            <View style={styles.factIconContainer}>
              <Users size={24} color="#2E7D32" />
            </View>
            <Text style={styles.factValue}>
              {(selectedCity.greenSpacePercentage * selectedCity.totalArea / selectedCity.population * 1000000).toFixed(0)} m²
            </Text>
            <Text style={styles.factLabel}>Per Capita</Text>
          </View>
        </View>

        <View style={styles.legendContainer}>
          <Text style={styles.legendTitle}>Green Space Types</Text>
          <View style={styles.legendGrid}>
            {Object.entries(GREEN_SPACE_COLORS).map(([type, color]) => (
              <View key={type} style={styles.legendItem}>
                <View style={[styles.legendDot, { backgroundColor: color }]} />
                <Text style={styles.legendText}>
                  {type.charAt(0).toUpperCase() + type.slice(1)}
                </Text>
              </View>
            ))}
          </View>
        </View>
      </Animated.View>
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
    top: 80, // Adjusted from 20 to move it further down
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
});
