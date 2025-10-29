import React from 'react';
import {
  StyleSheet,
  View,
  Text,
  TouchableOpacity,
  ScrollView,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Leaf, MapPin, Trees, Globe, ArrowRight } from 'lucide-react-native';

export default function LandingScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();

  return (
    <View style={styles.container}>
      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 32 }]}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.hero}>
          <View style={styles.iconCluster}>
            <View style={[styles.floatingIcon, styles.icon1]}>
              <Trees size={32} color="#2E7D32" />
            </View>
            <View style={[styles.floatingIcon, styles.icon2]}>
              <Leaf size={40} color="#1B5E20" />
            </View>
            <View style={[styles.floatingIcon, styles.icon3]}>
              <MapPin size={28} color="#4CAF50" />
            </View>
          </View>

          <Text style={styles.title}>Urban Green Spaces</Text>
          <Text style={styles.subtitle}>
            Discover and compare green space coverage across cities worldwide
          </Text>
        </View>

        <View style={styles.featuresContainer}>
          <View style={styles.featureCard}>
            <View style={styles.featureIconContainer}>
              <Globe size={28} color="#2E7D32" />
            </View>
            <Text style={styles.featureTitle}>City Comparison</Text>
            <Text style={styles.featureDescription}>
              Compare green space coverage, protected areas, and per capita metrics across multiple cities
            </Text>
          </View>

          <View style={styles.featureCard}>
            <View style={styles.featureIconContainer}>
              <MapPin size={28} color="#2E7D32" />
            </View>
            <Text style={styles.featureTitle}>Interactive Maps</Text>
            <Text style={styles.featureDescription}>
              Explore detailed maps showing parks, forests, gardens, and nature reserves
            </Text>
          </View>

          <View style={styles.featureCard}>
            <View style={styles.featureIconContainer}>
              <Leaf size={28} color="#2E7D32" />
            </View>
            <Text style={styles.featureTitle}>Environmental Data</Text>
            <Text style={styles.featureDescription}>
              Access comprehensive statistics and insights about urban green spaces
            </Text>
          </View>
        </View>

        <View style={styles.statsContainer}>
          <Text style={styles.statsTitle}>Why Green Spaces Matter</Text>
          <View style={styles.statsList}>
            <View style={styles.statItem}>
              <View style={styles.statDot} />
              <Text style={styles.statText}>Improve air quality and reduce urban heat</Text>
            </View>
            <View style={styles.statItem}>
              <View style={styles.statDot} />
              <Text style={styles.statText}>Enhance mental and physical wellbeing</Text>
            </View>
            <View style={styles.statItem}>
              <View style={styles.statDot} />
              <Text style={styles.statText}>Support biodiversity and wildlife habitats</Text>
            </View>
            <View style={styles.statItem}>
              <View style={styles.statDot} />
              <Text style={styles.statText}>Create community gathering spaces</Text>
            </View>
          </View>
        </View>

        <TouchableOpacity
          style={styles.ctaButton}
          onPress={() => router.push('/map')}
          activeOpacity={0.8}
        >
          <Text style={styles.ctaText}>Explore the Map</Text>
          <ArrowRight size={24} color="#FFFFFF" />
        </TouchableOpacity>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F5F9F5',
  },
  scrollView: {
    flex: 1,
  },
  content: {
    paddingHorizontal: 24,
  },
  hero: {
    alignItems: 'center',
    paddingTop: 60,
    paddingBottom: 40,
    position: 'relative',
  },
  iconCluster: {
    position: 'relative',
    width: 140,
    height: 140,
    marginBottom: 24,
  },
  floatingIcon: {
    position: 'absolute',
    backgroundColor: '#E8F5E9',
    borderRadius: 50,
    padding: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 4,
  },
  icon1: {
    top: 0,
    left: 0,
  },
  icon2: {
    top: 20,
    right: 0,
  },
  icon3: {
    bottom: 0,
    left: 30,
  },
  title: {
    fontSize: 42,
    fontWeight: '800' as const,
    color: '#1B5E20',
    textAlign: 'center',
    marginBottom: 16,
    lineHeight: 50,
  },
  subtitle: {
    fontSize: 18,
    color: '#558B2F',
    textAlign: 'center',
    lineHeight: 26,
    paddingHorizontal: 16,
  },
  featuresContainer: {
    gap: 16,
    marginBottom: 40,
  },
  featureCard: {
    backgroundColor: '#FFFFFF',
    padding: 24,
    borderRadius: 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 12,
    elevation: 3,
  },
  featureIconContainer: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: '#E8F5E9',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 16,
  },
  featureTitle: {
    fontSize: 20,
    fontWeight: '700' as const,
    color: '#1B5E20',
    marginBottom: 8,
  },
  featureDescription: {
    fontSize: 15,
    color: '#558B2F',
    lineHeight: 22,
  },
  statsContainer: {
    backgroundColor: '#2E7D32',
    padding: 24,
    borderRadius: 20,
    marginBottom: 32,
  },
  statsTitle: {
    fontSize: 22,
    fontWeight: '700' as const,
    color: '#FFFFFF',
    marginBottom: 20,
  },
  statsList: {
    gap: 14,
  },
  statItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  statDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#A5D6A7',
  },
  statText: {
    flex: 1,
    fontSize: 15,
    color: '#E8F5E9',
    lineHeight: 22,
  },
  ctaButton: {
    backgroundColor: '#2E7D32',
    paddingVertical: 18,
    paddingHorizontal: 32,
    borderRadius: 16,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
    shadowColor: '#2E7D32',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 12,
    elevation: 6,
  },
  ctaText: {
    fontSize: 18,
    fontWeight: '700' as const,
    color: '#FFFFFF',
  },
});
