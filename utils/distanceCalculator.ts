import { getDistance, isValidCoordinate } from 'geolib';
import { osrmClient } from './osrmClient';
import { LineString } from 'geojson';

export interface Coordinates {
  latitude: number;
  longitude: number;
}

export interface DistanceResult {
  distance: number; // in meters
  formattedDistance: string;
}

export interface RouteInfo {
  distance: number; // in meters
  duration: number; // in seconds
  geometry: LineString; // GeoJSON LineString geometry
  formattedDistance: string;
  formattedDuration: string;
}

export interface DistanceOptions {
  unit?: 'metric' | 'imperial';
  precision?: number;
}

/**
 * Validates if coordinates are valid latitude and longitude values
 */
export function validateCoordinates(coordinates: Coordinates): boolean {
  return isValidCoordinate(coordinates);
}

/**
 * Validates an array of coordinates
 */
export function validateCoordinatesArray(coordinatesArray: Coordinates[]): boolean {
  return coordinatesArray.every(coord => validateCoordinates(coord));
}

/**
 * Calculates the straight-line distance between two coordinates using geolib
 * @param from Starting coordinates
 * @param to Destination coordinates
 * @returns Distance in meters
 */
export function calculateDistance(from: Coordinates, to: Coordinates): number {
  if (!validateCoordinates(from) || !validateCoordinates(to)) {
    throw new Error('Invalid coordinates provided');
  }

  return getDistance(from, to);
}

/**
 * Formats distance in appropriate units based on the distance value and options
 * @param distanceInMeters Distance in meters
 * @param options Formatting options
 * @returns Formatted distance string
 */
export function formatDistance(
  distanceInMeters: number, 
  options: DistanceOptions = {}
): string {
  const { unit = 'metric', precision = 1 } = options;

  if (distanceInMeters < 0) {
    throw new Error('Distance cannot be negative');
  }

  if (unit === 'imperial') {
    // Convert to feet first
    const distanceInFeet = distanceInMeters * 3.28084;
    
    if (distanceInFeet < 5280) {
      // Show in feet for distances less than 1 mile (5280 feet)
      return `${Math.round(distanceInFeet)} ft`;
    } else {
      // Convert to miles for longer distances (>= 1 mile)
      const distanceInMiles = distanceInFeet / 5280;
      return `${distanceInMiles.toFixed(precision)} mi`;
    }
  } else {
    // Metric system
    if (distanceInMeters < 1000) {
      // Show in meters for distances less than 1000 meters
      return `${Math.round(distanceInMeters)} m`;
    } else {
      // Convert to kilometers for longer distances
      const distanceInKm = distanceInMeters / 1000;
      return `${distanceInKm.toFixed(precision)} km`;
    }
  }
}

/**
 * Calculates distance and returns both raw and formatted values
 * @param from Starting coordinates
 * @param to Destination coordinates
 * @param options Formatting options
 * @returns Object containing distance in meters and formatted string
 */
export function calculateAndFormatDistance(
  from: Coordinates,
  to: Coordinates,
  options: DistanceOptions = {}
): DistanceResult {
  const distance = calculateDistance(from, to);
  const formattedDistance = formatDistance(distance, options);

  return {
    distance,
    formattedDistance
  };
}

/**
 * Determines the appropriate unit system based on locale or user preference
 * @param locale Optional locale string (e.g., 'en-US', 'en-GB')
 * @returns 'metric' or 'imperial'
 */
export function getPreferredUnit(locale?: string): 'metric' | 'imperial' {
  // Countries that primarily use imperial system
  const imperialCountries = ['US', 'LR', 'MM']; // United States, Liberia, Myanmar
  
  if (locale) {
    const country = locale.split('-')[1];
    return imperialCountries.includes(country) ? 'imperial' : 'metric';
  }
  
  // Default to metric if no locale provided
  return 'metric';
}

/**
 * Calculates distance with automatic unit detection based on locale
 * @param from Starting coordinates
 * @param to Destination coordinates
 * @param locale Optional locale for unit preference
 * @returns Formatted distance with appropriate units
 */
export function calculateDistanceWithLocale(
  from: Coordinates,
  to: Coordinates,
  locale?: string
): DistanceResult {
  const unit = getPreferredUnit(locale);
  return calculateAndFormatDistance(from, to, { unit });
}

// Route cache to reduce API calls
const routeCache = new Map<string, { route: RouteInfo; timestamp: number }>();
const CACHE_DURATION = 5 * 60 * 1000; // 5 minutes in milliseconds

/**
 * Generates a cache key for route requests
 */
function generateCacheKey(from: Coordinates, to: Coordinates): string {
  return `${from.latitude.toFixed(6)},${from.longitude.toFixed(6)}-${to.latitude.toFixed(6)},${to.longitude.toFixed(6)}`;
}

/**
 * Checks if cached route is still valid
 */
function isCacheValid(timestamp: number): boolean {
  return Date.now() - timestamp < CACHE_DURATION;
}

/**
 * Formats duration in human-readable format
 * @param durationInSeconds Duration in seconds
 * @returns Formatted duration string
 */
export function formatDuration(durationInSeconds: number): string {
  if (durationInSeconds < 60) {
    return `${Math.round(durationInSeconds)} sec`;
  } else if (durationInSeconds < 3600) {
    const minutes = Math.round(durationInSeconds / 60);
    return `${minutes} min`;
  } else {
    const hours = Math.floor(durationInSeconds / 3600);
    const minutes = Math.round((durationInSeconds % 3600) / 60);
    return minutes > 0 ? `${hours}h ${minutes}m` : `${hours}h`;
  }
}

/**
 * Calculates route using shared OSRM client with fallback to straight-line distance
 * 
 * This function uses the shared OSRM client to calculate accurate routes between two points,
 * including real-world road networks, traffic patterns, and routing. If the OSRM API is 
 * unavailable or fails, it automatically falls back to straight-line distance calculation 
 * with estimated travel time.
 * 
 * Features:
 * - Real-world routing using shared OSRM client
 * - Automatic fallback to straight-line distance
 * - Route geometry for map display (GeoJSON LineString)
 * - Caching to reduce API calls and improve performance
 * - Configurable distance units (metric/imperial)
 * - Formatted distance and duration strings
 * 
 * @param from Starting coordinates (driver location)
 * @param to Destination coordinates (passenger pickup location)
 * @param options Formatting options including unit preference
 * @returns Promise<RouteInfo> Route information including distance, duration, and geometry
 * 
 * @example
 * ```typescript
 * const driverLocation = { latitude: 40.7589, longitude: -73.9851 };
 * const passengerLocation = { latitude: 40.7128, longitude: -74.0060 };
 * 
 * try {
 *   const route = await calculateRoute(driverLocation, passengerLocation);
 *   console.log(`Distance: ${route.formattedDistance}`);
 *   console.log(`ETA: ${route.formattedDuration}`);
 *   // Use route.geometry for map display
 * } catch (error) {
 *   console.error('Route calculation failed:', error);
 * }
 * ```
 */
export async function calculateRoute(
  from: Coordinates,
  to: Coordinates,
  options: DistanceOptions = {}
): Promise<RouteInfo> {
  if (!validateCoordinates(from) || !validateCoordinates(to)) {
    throw new Error('Invalid coordinates provided');
  }

  const cacheKey = generateCacheKey(from, to);
  const cached = routeCache.get(cacheKey);

  // Return cached result if valid
  if (cached && isCacheValid(cached.timestamp)) {
    return cached.route;
  }

  try {
    // Use shared OSRM client
    const route = await osrmClient.calculateRoute(from, to);
    
    const routeInfo: RouteInfo = {
      distance: route.distance,
      duration: route.duration,
      geometry: route.geometry,
      formattedDistance: formatDistance(route.distance, options),
      formattedDuration: formatDuration(route.duration)
    };

    // Cache the result
    routeCache.set(cacheKey, {
      route: routeInfo,
      timestamp: Date.now()
    });

    return routeInfo;
  } catch (error) {
    console.warn('OSRM routing failed, falling back to straight-line distance:', error);
    
    // Fallback to straight-line distance calculation
    const straightLineDistance = calculateDistance(from, to);
    
    // Estimate duration based on average speed (assuming 50 km/h in urban areas)
    const averageSpeedKmh = 50;
    const averageSpeedMs = averageSpeedKmh * 1000 / 3600; // Convert to m/s
    const estimatedDuration = straightLineDistance / averageSpeedMs;

    const fallbackRoute: RouteInfo = {
      distance: straightLineDistance,
      duration: estimatedDuration,
      geometry: {
        type: 'LineString',
        coordinates: [
          [from.longitude, from.latitude],
          [to.longitude, to.latitude]
        ]
      },
      formattedDistance: formatDistance(straightLineDistance, options),
      formattedDuration: formatDuration(estimatedDuration)
    };

    // Cache the fallback result with shorter duration
    routeCache.set(cacheKey, {
      route: fallbackRoute,
      timestamp: Date.now()
    });

    return fallbackRoute;
  }
}

/**
 * Calculates route with automatic unit detection based on locale
 * @param from Starting coordinates
 * @param to Destination coordinates
 * @param locale Optional locale for unit preference
 * @returns Route information with appropriate units
 */
export async function calculateRouteWithLocale(
  from: Coordinates,
  to: Coordinates,
  locale?: string
): Promise<RouteInfo> {
  const unit = getPreferredUnit(locale);
  return calculateRoute(from, to, { unit });
}

/**
 * Clears the route cache
 */
export function clearRouteCache(): void {
  routeCache.clear();
}

/**
 * Gets cache statistics for debugging
 */
export function getCacheStats(): { size: number; entries: string[] } {
  return {
    size: routeCache.size,
    entries: Array.from(routeCache.keys())
  };
}