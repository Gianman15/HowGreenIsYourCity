import React from 'react';
import {
  StyleSheet,
  View,
  Text,
  ScrollView,
  Linking,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Leaf, MapPin, BarChart3, Database, Layers, RefreshCw } from 'lucide-react-native';

export default function InfoScreen() {
  const insets = useSafeAreaInsets();

  return (
    <View style={styles.container}>
      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 32 }]}
        showsVerticalScrollIndicator={false}
      >
        {/* What are Green Spaces */}
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <View style={styles.iconContainer}>
              <Leaf size={24} color="#2E7D32" />
            </View>
            <Text style={styles.sectionTitle}>What are Green Spaces?</Text>
          </View>
          <Text style={styles.paragraph}>
            Urban green spaces are areas covered by vegetation in cities and towns. This includes parks, 
            forests, gardens, nature reserves, street trees, and other vegetated areas visible from satellite imagery.
          </Text>
          <Text style={styles.paragraph}>
            These spaces are identified using satellite data from Landsat 8, which captures reflected light 
            in different wavelengths to calculate the Normalized Difference Vegetation Index (NDVI). This 
            index helps distinguish healthy vegetation from other land cover types.
          </Text>
        </View>

        {/* Why Green Spaces Matter */}
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <View style={styles.iconContainer}>
              <Leaf size={24} color="#2E7D32" />
            </View>
            <Text style={styles.sectionTitle}>Why Green Spaces Matter</Text>
          </View>
          <View style={styles.bulletList}>
            <View style={styles.bulletItem}>
              <View style={styles.bullet} />
              <Text style={styles.bulletText}>
                <Text style={styles.boldText}>Environmental Benefits:</Text> Improves air quality, reduces 
                urban heat island effects, and supports biodiversity
              </Text>
            </View>
            <View style={styles.bulletItem}>
              <View style={styles.bullet} />
              <Text style={styles.bulletText}>
                <Text style={styles.boldText}>Health & Wellbeing:</Text> Provides spaces for recreation, 
                reduces stress, and encourages physical activity
              </Text>
            </View>
            <View style={styles.bulletItem}>
              <View style={styles.bullet} />
              <Text style={styles.bulletText}>
                <Text style={styles.boldText}>Social Impact:</Text> Creates gathering spaces for communities 
                and increases property values
              </Text>
            </View>
          </View>
          <Text style={styles.paragraph}>
            {'\n'}Do you want to learn more about how these per capita values can impact mental health? Feel free to read peer reviewed literature <Text style={{ color: '#1E88E5', textDecorationLine: 'underline' }} onPress={() => Linking.openURL('https://doi.org/10.1016/j.jenvp.2024.102468')}>here</Text>.
          </Text>
        </View>

        {/* Census Tracts */}
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <View style={styles.iconContainer}>
              <MapPin size={24} color="#2E7D32" />
            </View>
            <Text style={styles.sectionTitle}>What are Census Tracts?</Text>
          </View>
          <Text style={styles.paragraph}>
            Census tracts are small geographic areas defined by Statistics Canada for statistical purposes. 
            They typically contain 2,500 to 8,000 people and are designed to be relatively stable over time.
          </Text>
          <Text style={styles.paragraph}>
            In this app, each census tract is analyzed to calculate how much green space exists within its 
            boundaries, allowing for neighborhood-level comparisons across cities.
          </Text>
        </View>

        {/* Per Capita Values */}
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <View style={styles.iconContainer}>
              <BarChart3 size={24} color="#2E7D32" />
            </View>
            <Text style={styles.sectionTitle}>Understanding Per Capita Values</Text>
          </View>
          <Text style={styles.paragraph}>
            Green space per capita measures how much green space is available per person in a given area. 
            It's calculated by dividing the total green space area (in square meters) by the population.
          </Text>
          <Text style={styles.paragraph}>
            <Text style={styles.boldText}>Example:</Text> If a census tract has 100,000 m² of green space 
            and 5,000 residents, the per capita value is 20 m²/person.
          </Text>
          <Text style={styles.paragraph}>
            <Text style={styles.boldText}>Adjusted Values:</Text> The per capita measurements shown in this 
            app are adjusted to include green space within 300 meters of each census tract boundary. This 
            provides a more realistic assessment of accessible green space, since residents often use parks 
            and green areas that are just outside their immediate neighborhood boundaries.
          </Text>
          <Text style={styles.paragraph}>
            Higher per capita values indicate more accessible green space for residents. The World Health 
            Organization recommends at least 9 m² of green space per person in urban areas.
          </Text>
        </View>

        {/* Data Sources */}
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <View style={styles.iconContainer}>
              <Database size={24} color="#2E7D32" />
            </View>
            <Text style={styles.sectionTitle}>Data Sources</Text>
          </View>
          <View style={styles.bulletList}>
            <View style={styles.bulletItem}>
              <View style={styles.bullet} />
              <Text style={styles.bulletText}>
                <Text style={styles.boldText}>Satellite Imagery:</Text> Landsat 8 Collection 2 (USGS Earth Explorer) 
                - captured during peak growing season for accurate vegetation detection
              </Text>
            </View>
            <View style={styles.bulletItem}>
              <View style={styles.bullet} />
              <Text style={styles.bulletText}>
                <Text style={styles.boldText}>Census Data:</Text> Statistics Canada 2021 Census - provides 
                population counts and census tract boundaries
              </Text>
            </View>
            <View style={styles.bulletItem}>
              <View style={styles.bullet} />
              <Text style={styles.bulletText}>
                <Text style={styles.boldText}>Processing Methodology:</Text> Green spaces identified from Near IR (0.85-0.88um) and Red (0.64-0.67um) Landsat 8 bands using NDVI threshold analysis (30m resolution).
                {'\n'} Images clipped to census division boundaries. Satellite images taken from 2024-2025 from the month of July (peak growing season). All image and data processing done in python using rasterio and geopandas, pipeline available on my GitHub.
              </Text>
            </View>
          </View>
        </View>

        {/* Map Symbology */}
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <View style={styles.iconContainer}>
              <Layers size={24} color="#2E7D32" />
            </View>
            <Text style={styles.sectionTitle}>Map Symbols & Controls</Text>
          </View>
          <Text style={styles.paragraph}>
            The map toolbar contains the following controls (from left to right):
          </Text>
          <View style={styles.iconPreviewRow}>
            <View style={styles.iconPreview}>
              <View style={styles.iconPreviewButton}>
                <Text style={styles.iconPreviewIcon}>🗺️</Text>
              </View>
              <Text style={styles.iconPreviewLabel}>Base Map</Text>
            </View>
            <View style={styles.iconPreview}>
              <View style={styles.iconPreviewButton}>
                <Layers size={18} color="#2E7D32" />
              </View>
              <Text style={styles.iconPreviewLabel}>Layers</Text>
            </View>
            <View style={styles.iconPreview}>
              <View style={styles.iconPreviewButton}>
                <Text style={styles.iconPreviewIcon}>🎨</Text>
              </View>
              <Text style={styles.iconPreviewLabel}>Color Mode</Text>
            </View>
            <View style={styles.iconPreview}>
              <View style={styles.iconPreviewButton}>
                <Text style={styles.iconPreviewIcon}>ℹ️</Text>
              </View>
              <Text style={styles.iconPreviewLabel}>Info</Text>
            </View>
          </View>
          <View style={styles.bulletList}>
            <View style={styles.bulletItem}>
              <View style={styles.bullet} />
              <Text style={styles.bulletText}>
                <Text style={styles.boldText}>Base Map (🗺️):</Text> Switch between different background maps - 
                Streets (default), Satellite imagery, Topographic, or Dark mode
              </Text>
            </View>
            <View style={styles.bulletItem}>
              <View style={styles.bullet} />
              <Text style={styles.bulletText}>
                <Text style={styles.boldText}>Layers (⚏):</Text> Toggle between viewing raw green 
                space coverage or per capita green space by census tract
              </Text>
            </View>
            <View style={styles.bulletItem}>
              <View style={styles.bullet} />
              <Text style={styles.bulletText}>
                <Text style={styles.boldText}>Colorblind Mode (🎨/👁️):</Text> Switch between standard color scheme 
                and a colorblind-friendly palette for better accessibility
              </Text>
            </View>
            <View style={styles.bulletItem}>
              <View style={styles.bullet} />
              <Text style={styles.bulletText}>
                <Text style={styles.boldText}>Green Polygons:</Text> Represent vegetated areas detected from 
                satellite imagery
              </Text>
            </View>
            <View style={styles.bulletItem}>
              <View style={styles.bullet} />
              <Text style={styles.bulletText}>
                <Text style={styles.boldText}>Color-Coded Tracts:</Text> Census tracts are shaded from red 
                (low per capita) to green (high per capita) green space
              </Text>
            </View>
            <View style={styles.bulletItem}>
              <View style={styles.bullet} />
              <Text style={styles.bulletText}>
                <Text style={styles.boldText}>City Selector:</Text> Dropdown menu to choose which city to display
              </Text>
            </View>
          </View>
        </View>

        {/* Compare Page */}
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <View style={styles.iconContainer}>
              <RefreshCw size={24} color="#2E7D32" />
            </View>
            <Text style={styles.sectionTitle}>Using the Compare Page</Text>
          </View>
          <Text style={styles.paragraph}>
            The Compare Cities page allows you to view two cities side-by-side to compare their green space 
            distribution patterns.
          </Text>
          <View style={styles.bulletList}>
            <View style={styles.bulletItem}>
              <View style={styles.bullet} />
              <Text style={styles.bulletText}>
                Use the dropdown menus above each map to select different cities
              </Text>
            </View>
            <View style={styles.bulletItem}>
              <View style={styles.bullet} />
              <Text style={styles.bulletText}>
                The layer toggle and color scheme apply to both maps simultaneously
              </Text>
            </View>
            <View style={styles.bulletItem}>
              <View style={styles.bullet} />
              <Text style={styles.bulletText}>
                <Text style={styles.boldText}>Interactive Filtering:</Text> Click on any census tract in the 
                greenspace per capita layer to filter the opposing map to show only tracts in the same color 
                range, making it easy to compare similar neighborhoods across cities
              </Text>
            </View>
            <View style={styles.bulletItem}>
              <View style={styles.bullet} />
              <Text style={styles.bulletText}>
                Click anywhere outside the census tracts or use the "Clear Filter" button to reset the comparison
              </Text>
            </View>
            <View style={styles.bulletItem}>
              <View style={styles.bullet} />
              <Text style={styles.bulletText}>
                Summary statistics at the bottom show key metrics for quick comparison
              </Text>
            </View>
            <View style={styles.bulletItem}>
              <View style={styles.bullet} />
              <Text style={styles.bulletText}>
                Zoom and pan each map independently to explore different neighborhoods
              </Text>
            </View>
          </View>
        </View>

        {/* Note */}
        <View style={styles.noteContainer}>
          <Text style={styles.noteTitle}>Note</Text>
          <Text style={styles.noteText}>
            This application is designed for educational and informational purposes. Green space calculations 
            are based on satellite imagery analysis and may not capture all small-scale (or low health) vegetation or recent 
            changes. Census data reflects 2021 population figures.
          </Text>
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F5F9F5',
  },
  header: {
    backgroundColor: '#FFFFFF',
    paddingHorizontal: 24,
    paddingBottom: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#E0E0E0',
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 4,
    elevation: 2,
  },
  headerTitle: {
    fontSize: 24,
    fontWeight: '700' as const,
    color: '#1B5E20',
  },
  closeButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#E8F5E9',
    justifyContent: 'center',
    alignItems: 'center',
  },
  scrollView: {
    flex: 1,
  },
  content: {
    paddingHorizontal: 24,
    paddingTop: 24,
  },
  section: {
    marginBottom: 32,
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 16,
    gap: 12,
  },
  iconContainer: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#E8F5E9',
    justifyContent: 'center',
    alignItems: 'center',
  },
  sectionTitle: {
    fontSize: 20,
    fontWeight: '700' as const,
    color: '#1B5E20',
    flex: 1,
  },
  paragraph: {
    fontSize: 15,
    color: '#424242',
    lineHeight: 24,
    marginBottom: 12,
  },
  boldText: {
    fontWeight: '700' as const,
    color: '#2E7D32',
  },
  bulletList: {
    gap: 12,
  },
  bulletItem: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
  },
  bullet: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: '#2E7D32',
    marginTop: 9,
  },
  bulletText: {
    flex: 1,
    fontSize: 15,
    color: '#424242',
    lineHeight: 24,
  },
  noteContainer: {
    backgroundColor: '#E8F5E9',
    padding: 20,
    borderRadius: 12,
    borderLeftWidth: 4,
    borderLeftColor: '#2E7D32',
    marginBottom: 16,
  },
  noteTitle: {
    fontSize: 16,
    fontWeight: '700' as const,
    color: '#1B5E20',
    marginBottom: 8,
  },
  noteText: {
    fontSize: 14,
    color: '#558B2F',
    lineHeight: 22,
  },
  iconPreviewRow: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    alignItems: 'center',
    backgroundColor: '#F5F9F5',
    padding: 16,
    borderRadius: 12,
    marginBottom: 16,
    gap: 8,
  },
  iconPreview: {
    alignItems: 'center',
    gap: 8,
  },
  iconPreviewButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#E8F5E9',
    justifyContent: 'center',
    alignItems: 'center',
  },
  iconPreviewIcon: {
    fontSize: 20,
  },
  iconPreviewLabel: {
    fontSize: 11,
    color: '#558B2F',
    fontWeight: '600' as const,
    textAlign: 'center',
  },
});
