export type GreenSpace = {
  id: string;
  name: string;
  type: 'park' | 'forest' | 'garden' | 'reserve';
  coordinates: {
    latitude: number;
    longitude: number;
  };
  area: number;
};

export type City = {
  id: string;
  name: string;
  country: string;
  coordinates: {
    latitude: number;
    longitude: number;
  };
  greenSpaces: GreenSpace[];
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
    id: 'montreal',
    name: 'Montreal',
    country: 'Canada',
    coordinates: {
      latitude: 45.450,
      longitude: -73.70,
    },
    totalArea: 728.6,
    greenSpacePercentage: 47.0,
    population: 5850000,
    greenSpaces: [
      {
        id: 'gardens-bay',
        name: 'Gardens by the Bay',
        type: 'garden',
        coordinates: { latitude: 1.2816, longitude: 103.8636 },
        area: 1.01,
      },
      // Other green spaces...
    ],
    geojsonFiles: {
      census: 'http://localhost:8081/assets/data/montreal/bound_lct_000b21a_e.geojson',
      greenspace: 'http://localhost:8081/assets/data/montreal/greenspace.geojson',
      greenspacePerCapita: 'http://localhost:8081/assets/data/montreal/greenspace_per_capita.geojson',
    },
  },
    {
    id: 'copenhagen',
    name: 'Copenhagen',
    country: 'Denmark',
    coordinates: {
      latitude: 55.6761,
      longitude: 12.5683,
    },
    totalArea: 179.8,
    greenSpacePercentage: 38.5,
    population: 644431,
    greenSpaces: [
      {
        id: 'kings-garden',
        name: "King's Garden",
        type: 'garden',
        coordinates: { latitude: 55.6854, longitude: 12.5786 },
        area: 0.12,
      },
      // Other green spaces...
    ],
    geojsonFiles: {
      census: 'http://localhost:8081/assets/data/copenhagen/census.geojson',
      greenspace: 'http://localhost:8081/assets/data/copenhagen/greenspace.geojson',
      greenspacePerCapita: 'http://localhost:8081/assets/data/copenhagen/greenspace_per_capita.geojson',
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
    greenSpaces: [
      {
        id: 'stanley-park',
        name: 'Stanley Park',
        type: 'park',
        coordinates: { latitude: 49.3044, longitude: -123.1443 },
        area: 4.05,
      },
      // Other green spaces...
    ],
    geojsonFiles: {
      census: 'http://localhost:8081/assets/data/vancouver/census.geojson',
      greenspace: 'http://localhost:8081/assets/data/vancouver/greenspace.geojson',
      greenspacePerCapita: 'http://localhost:8081/assets/data/vancouver/greenspace_per_capita.geojson',
    },
  },
]
