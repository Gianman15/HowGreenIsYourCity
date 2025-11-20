export type City = {
  id: string;
  name: string;
  country: string;
  coordinates: {
    latitude: number;
    longitude: number;
  };
  totalArea: number;
  greenSpacePercentage: number;
  population: number;
  geojsonFiles?: {
    census: string;
    greenspace: string;
    greenspacePerCapita: string;
    greenspacePerCapitaSmooth?: string;
    summaryStats?: string;
  };
};

type SummaryStats = {
  city_name: string;
  cduid: string;
  average_greenspace_per_capita_m2: number;
  total_greenspace_area_km2: number;
  total_population: number;
  greenspace_percentage: number;
  total_land_area_km2: number;
  number_of_census_tracts: number;
  tracts_with_population: number;
};

// Base city configuration without dynamic stats
const BASE_CITIES = [
  {
    id: 'Montreal',
    name: 'Montreal',
    country: 'Canada',
    coordinates: {
      latitude: 45.450,
      longitude: -73.70,
    },
    geojsonFiles: {
      census: 'https://raw.githubusercontent.com/gianman15/HowGreenIsYourCity/main/data/montreal/censustracts.geojson',
      greenspace: 'https://raw.githubusercontent.com/gianman15/HowGreenIsYourCity/main/data/montreal/greenspace_clipped_2466.geojson',
      greenspacePerCapita: 'https://raw.githubusercontent.com/gianman15/HowGreenIsYourCity/main/data/montreal/greenspace_per_capita.geojson',
      greenspacePerCapitaSmooth: 'https://raw.githubusercontent.com/gianman15/HowGreenIsYourCity/main/data/montreal/greenspace_per_capita_smoothed.geojson',
      summaryStats: 'https://raw.githubusercontent.com/gianman15/HowGreenIsYourCity/main/data/montreal/summary_stats.json',
    },
  },
  {
    id: 'Ottawa',
    name: 'Ottawa',
    country: 'Canada',
    coordinates: {
      latitude: 45.4247,
      longitude: -75.6950,
    },
    geojsonFiles: {
      census: 'https://raw.githubusercontent.com/gianman15/HowGreenIsYourCity/main/data/ottawa/censustracts.geojson',
      greenspace: 'https://raw.githubusercontent.com/gianman15/HowGreenIsYourCity/main/data/ottawa/greenspace_clipped_3506.geojson',
      greenspacePerCapita: 'https://raw.githubusercontent.com/gianman15/HowGreenIsYourCity/main/data/ottawa/greenspace_per_capita.geojson',
      greenspacePerCapitaSmooth: 'https://raw.githubusercontent.com/gianman15/HowGreenIsYourCity/main/data/ottawa/greenspace_per_capita_smoothed.geojson',
      summaryStats: 'https://raw.githubusercontent.com/gianman15/HowGreenIsYourCity/main/data/ottawa/summary_stats.json',
    },
  },
  {
    id: 'toronto',
    name: 'Toronto',
    country: 'Canada',
    coordinates: {
      latitude: 43.6532,
      longitude: -79.3832,
    },
    geojsonFiles: {
      census: 'https://raw.githubusercontent.com/gianman15/HowGreenIsYourCity/main/data/toronto/censustracts.geojson',
      greenspace: 'https://raw.githubusercontent.com/gianman15/HowGreenIsYourCity/main/data/toronto/greenspace_clipped_3520.geojson',
      greenspacePerCapita: 'https://raw.githubusercontent.com/gianman15/HowGreenIsYourCity/main/data/toronto/greenspace_per_capita.geojson',
      greenspacePerCapitaSmooth: 'https://raw.githubusercontent.com/gianman15/HowGreenIsYourCity/main/data/toronto/greenspace_per_capita_smoothed.geojson',
      summaryStats: 'https://raw.githubusercontent.com/gianman15/HowGreenIsYourCity/main/data/toronto/summary_stats.json',
    },
  },
  {
    id: 'vancouver',
    name: 'Vancouver',
    country: 'Canada',
    coordinates: {
      latitude: 49.2827,
      longitude: -123.1207,
    },
    geojsonFiles: {
      census: 'https://raw.githubusercontent.com/gianman15/HowGreenIsYourCity/main/data/vancouver/censustracts.geojson',
      greenspace: 'https://raw.githubusercontent.com/gianman15/HowGreenIsYourCity/main/data/vancouver/greenspace_clipped_5915.geojson',
      greenspacePerCapita: 'https://raw.githubusercontent.com/gianman15/HowGreenIsYourCity/main/data/vancouver/greenspace_per_capita.geojson',
      greenspacePerCapitaSmooth: 'https://raw.githubusercontent.com/gianman15/HowGreenIsYourCity/main/data/vancouver/greenspace_per_capita_smoothed.geojson',
      summaryStats: 'https://raw.githubusercontent.com/gianman15/HowGreenIsYourCity/main/data/vancouver/summary_stats.json',
    },
  },
] as const;

// Cache for loaded stats
const statsCache = new Map<string, SummaryStats>();

// Function to load summary stats from GitHub
async function loadSummaryStats(url: string): Promise<SummaryStats | null> {
  try {
    if (statsCache.has(url)) {
      return statsCache.get(url)!;
    }
    
    const response = await fetch(url);
    if (!response.ok) {
      console.error(`Failed to fetch summary stats from ${url}`);
      return null;
    }
    
    const stats = await response.json() as SummaryStats;
    statsCache.set(url, stats);
    return stats;
  } catch (error) {
    console.error(`Error loading summary stats from ${url}:`, error);
    return null;
  }
}

// Function to enrich city with stats
async function enrichCityWithStats(baseCity: typeof BASE_CITIES[number]): Promise<City> {
  const summaryStatsUrl = baseCity.geojsonFiles.summaryStats;
  
  if (!summaryStatsUrl) {
    // Fallback to default values if no summary stats URL
    return {
      ...baseCity,
      totalArea: 0,
      greenSpacePercentage: 0,
      population: 0,
    } as City;
  }
  
  const stats = await loadSummaryStats(summaryStatsUrl);
  
  if (stats) {
    return {
      ...baseCity,
      totalArea: stats.total_land_area_km2,
      greenSpacePercentage: stats.greenspace_percentage,
      population: stats.total_population,
    } as City;
  }
  
  // Fallback to default values
  return {
    ...baseCity,
    totalArea: 0,
    greenSpacePercentage: 0,
    population: 0,
  } as City;
}

// Initialize cities with stats loaded
let citiesPromise: Promise<City[]> | null = null;

export async function loadCities(): Promise<City[]> {
  if (!citiesPromise) {
    citiesPromise = Promise.all(BASE_CITIES.map(enrichCityWithStats));
  }
  return citiesPromise;
}

// Synchronous export with placeholder values (for initial render)
export const CITIES: City[] = BASE_CITIES.map(city => ({
  ...city,
  totalArea: 0,
  greenSpacePercentage: 0,
  population: 0,
})) as City[]
