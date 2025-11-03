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
  };
};

export const CITIES: City[] = [
  {
    id: 'Montreal',
    name: 'Montreal',
    country: 'Canada',
    coordinates: {
      latitude: 45.450,
      longitude: -73.70,
    },
    totalArea: 728.6,
    greenSpacePercentage: 47.0,
    population: 5850000,
    geojsonFiles: {
      census: 'https://raw.githubusercontent.com/gianman15/HowGreenIsYourCity/main/data/montreal/censustracts.geojson',
      greenspace: 'https://raw.githubusercontent.com/gianman15/HowGreenIsYourCity/main/data/montreal/greenspace_only.geojson',
      greenspacePerCapita: 'https://raw.githubusercontent.com/gianman15/HowGreenIsYourCity/main/data/montreal/greenspace_per_capita.geojson',
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
    totalArea: 179.8,
    greenSpacePercentage: 38.5,
    population: 644431,
    geojsonFiles: {
      census: 'https://raw.githubusercontent.com/gianman15/HowGreenIsYourCity/main/data/ottawa/censustracts.geojson',
      greenspace: 'https://raw.githubusercontent.com/gianman15/HowGreenIsYourCity/main/data/ottawa/greenspace_only.geojson',
      greenspacePerCapita: 'https://raw.githubusercontent.com/gianman15/HowGreenIsYourCity/main/data/ottawa/greenspace_per_capita.geojson',
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
    totalArea: 114.97,
    greenSpacePercentage: 42.3,
    population: 662248,
    geojsonFiles: {
      census: 'https://raw.githubusercontent.com/gianman15/HowGreenIsYourCity/main/data/vancouver/censustracts.geojson',
      greenspace: 'https://raw.githubusercontent.com/gianman15/HowGreenIsYourCity/main/data/vancouver/greenspace_only.geojson',
      greenspacePerCapita: 'https://raw.githubusercontent.com/gianman15/HowGreenIsYourCity/main/data/vancouver/greenspace_per_capita.geojson',
    },
  },
]
