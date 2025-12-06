import { useState, useEffect, useRef, useCallback } from 'react';
import { driverAPI } from '@/api/driverAPI';
import { 
  calculateAndFormatDistance, 
  calculateRoute, 
  Coordinates, 
  DistanceResult, 
  RouteInfo 
} from '@/utils/distanceCalculator';
import { useWebSocketDriverTracking } from './useWebSocketDriverTracking';

export interface UseRealTimeDriverTrackingProps {
  rideId: string;
  driverId: string | null;
  passengerLocation: Coordinates;
  targetLocation?: Coordinates | null; // Target location for distance calculation (pickup or destination)
  pollingInterval?: number; // in milliseconds
  enabled?: boolean;
  useWebSocket?: boolean; // Enable WebSocket for real-time updates
  wsUrl?: string; // WebSocket URL
}

export interface UseRealTimeDriverTrackingReturn {
  driverLocation: Coordinates | null;
  distance: number | null;
  formattedDistance: string | null;
  eta: number | null;
  formattedEta: string | null;
  routeGeometry: any | null; // GeoJSON geometry for map display
  isLoading: boolean;
  error: string | null;
  lastUpdated: string | null;
  retryCount: number;
  retry: () => void;
  // WebSocket specific properties
  isWebSocketConnected: boolean;
  isWebSocketConnecting: boolean;
  webSocketReconnectAttempts: number;
  connectWebSocket: () => void;
  disconnectWebSocket: () => void;
}

const DEFAULT_POLLING_INTERVAL = 10000; // 10 seconds (increased when using WebSocket)
const WEBSOCKET_FALLBACK_POLLING_INTERVAL = 30000; // 30 seconds (slower polling when WebSocket is active)
const MAX_RETRY_COUNT = 3;
const RETRY_DELAY_BASE = 1000; // 1 second

/**
 * Formats ETA in seconds to a human-readable string
 */
function formatEta(etaInSeconds: number): string {
  if (etaInSeconds < 60) {
    return `${Math.round(etaInSeconds)} sec`;
  } else if (etaInSeconds < 3600) {
    const minutes = Math.round(etaInSeconds / 60);
    return `${minutes} min`;
  } else {
    const hours = Math.floor(etaInSeconds / 3600);
    const minutes = Math.round((etaInSeconds % 3600) / 60);
    return `${hours}h ${minutes}m`;
  }
}

/**
 * Estimates ETA based on distance (simple calculation)
 * This is a fallback until OSRM routing is implemented
 */
function estimateEta(distanceInMeters: number): number {
  // Assume average speed of 30 km/h in urban areas
  const averageSpeedKmh = 30;
  const averageSpeedMs = (averageSpeedKmh * 1000) / 3600; // Convert to m/s
  return distanceInMeters / averageSpeedMs;
}

export const useRealTimeDriverTracking = ({
  rideId,
  driverId,
  passengerLocation,
  targetLocation,
  pollingInterval = DEFAULT_POLLING_INTERVAL,
  enabled = true,
  useWebSocket = true,
  wsUrl,
}: UseRealTimeDriverTrackingProps): UseRealTimeDriverTrackingReturn => {
  // WebSocket integration
  const {
    driverLocation: wsDriverLocation,
    isConnected: isWebSocketConnected,
    isConnecting: isWebSocketConnecting,
    error: wsError,
    lastUpdated: wsLastUpdated,
    reconnectAttempts: webSocketReconnectAttempts,
    connect: connectWebSocket,
    disconnect: disconnectWebSocket,
  } = useWebSocketDriverTracking({
    rideId,
    driverId,
    enabled: enabled && useWebSocket,
    wsUrl,
  });

  // State management
  const [pollingDriverLocation, setPollingDriverLocation] = useState<Coordinates | null>(null);
  const [distance, setDistance] = useState<number | null>(null);
  const [formattedDistance, setFormattedDistance] = useState<string | null>(null);
  const [eta, setEta] = useState<number | null>(null);
  const [formattedEta, setFormattedEta] = useState<string | null>(null);
  const [routeGeometry, setRouteGeometry] = useState<any | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [lastUpdated, setLastUpdated] = useState<string | null>(null);
  const [retryCount, setRetryCount] = useState<number>(0);

  // Determine the current driver location (WebSocket takes priority)
  const driverLocation = wsDriverLocation || pollingDriverLocation;

  // Refs for cleanup and polling management
  const pollingIntervalRef = useRef<number | null>(null);
  const retryTimeoutRef = useRef<number | null>(null);
  const isMountedRef = useRef<boolean>(true);

  // Cleanup function
  const cleanup = useCallback(() => {
    if (pollingIntervalRef.current) {
      clearInterval(pollingIntervalRef.current);
      pollingIntervalRef.current = null;
    }
    if (retryTimeoutRef.current) {
      clearTimeout(retryTimeoutRef.current);
      retryTimeoutRef.current = null;
    }
  }, []);

  // Fetch driver location via polling (fallback when WebSocket is not available)
  const fetchDriverLocationAndDistance = useCallback(async (): Promise<void> => {
    if (!driverId || !enabled || !isMountedRef.current) {
      return;
    }

    // Skip polling if WebSocket is connected and providing updates
    if (useWebSocket && isWebSocketConnected && wsDriverLocation) {
      return;
    }

    try {
      setIsLoading(true);
      
      // Only clear error if it's not a WebSocket error
      if (!wsError) {
        setError(null);
      }

      // Fetch driver location from API
      const response = await driverAPI.getDriverLocation(driverId);
      
      if (!isMountedRef.current) return;

      if (response.location) {
        const newDriverLocation: Coordinates = {
          latitude: response.location.latitude,
          longitude: response.location.longitude,
        };

        // Update polling location state
        setPollingDriverLocation(newDriverLocation);
        setRetryCount(0); // Reset retry count on success
        
        // Only update lastUpdated if not using WebSocket or WebSocket is not providing updates
        if (!useWebSocket || !isWebSocketConnected) {
          setLastUpdated(new Date().toISOString());
        }
      } else {
        // No location data available
        if (!wsError) {
          setError('Driver location not available');
        }
      }
    } catch (err: any) {
      if (!isMountedRef.current) return;

      console.error('Error fetching driver location:', err);
      
      // Only set error if WebSocket is not providing updates
      if (!useWebSocket || !isWebSocketConnected) {
        const errorMessage = err.message || 'Failed to fetch driver location';
        setError(errorMessage);
      }

      // Implement retry logic for retryable errors
      if (retryCount < MAX_RETRY_COUNT && err.isRetryable !== false) {
        const retryDelay = RETRY_DELAY_BASE * Math.pow(2, retryCount);
        
        retryTimeoutRef.current = setTimeout(() => {
          if (isMountedRef.current) {
            setRetryCount(prev => prev + 1);
            fetchDriverLocationAndDistance();
          }
        }, retryDelay) as unknown as number;
      }
    } finally {
      if (isMountedRef.current) {
        setIsLoading(false);
      }
    }
  }, [driverId, enabled, retryCount, useWebSocket, isWebSocketConnected, wsDriverLocation, wsError]);

  // Manual retry function
  const retry = useCallback(() => {
    setRetryCount(0);
    setError(null);
    fetchDriverLocationAndDistance();
  }, [fetchDriverLocationAndDistance]);

  // Start polling
  const startPolling = useCallback(() => {
    if (!enabled || !driverId || pollingIntervalRef.current) {
      return;
    }

    // Determine polling interval based on WebSocket status
    const effectivePollingInterval = useWebSocket && isWebSocketConnected 
      ? WEBSOCKET_FALLBACK_POLLING_INTERVAL 
      : pollingInterval;

    // Initial fetch
    fetchDriverLocationAndDistance();

    // Set up polling interval
    pollingIntervalRef.current = setInterval(() => {
      fetchDriverLocationAndDistance();
    }, effectivePollingInterval) as unknown as number;
  }, [enabled, driverId, pollingInterval, useWebSocket, isWebSocketConnected, fetchDriverLocationAndDistance]);

  // Stop polling
  const stopPolling = useCallback(() => {
    cleanup();
  }, [cleanup]);

  // Effect to manage polling lifecycle
  useEffect(() => {
    if (enabled && driverId) {
      startPolling();
    } else {
      stopPolling();
    }

    return () => {
      stopPolling();
    };
  }, [enabled, driverId, startPolling, stopPolling]);

  // Calculate route and distance when driver location or target location changes
  const calculateRouteAndDistance = useCallback(async (currentDriverLocation: Coordinates) => {
    if (!currentDriverLocation || !enabled) {
      return;
    }

    // Use targetLocation if provided, otherwise fall back to passengerLocation
    const destinationLocation = targetLocation || passengerLocation;

    try {
      const routeInfo: RouteInfo = await calculateRoute(
        currentDriverLocation,
        destinationLocation
      );

      setDistance(routeInfo.distance);
      setFormattedDistance(routeInfo.formattedDistance);
      setEta(routeInfo.duration);
      setFormattedEta(routeInfo.formattedDuration);
      setRouteGeometry(routeInfo.geometry);
    } catch (routeError) {
      console.warn('Route calculation failed, using straight-line distance:', routeError);
      
      // Fallback to straight-line distance calculation
      const distanceResult: DistanceResult = calculateAndFormatDistance(
        currentDriverLocation,
        destinationLocation
      );

      const estimatedEta = estimateEta(distanceResult.distance);

      setDistance(distanceResult.distance);
      setFormattedDistance(distanceResult.formattedDistance);
      setEta(estimatedEta);
      setFormattedEta(formatEta(estimatedEta));
      setRouteGeometry({
        type: 'LineString',
        coordinates: [
          [currentDriverLocation.longitude, currentDriverLocation.latitude],
          [destinationLocation.longitude, destinationLocation.latitude]
        ]
      });
    }
  }, [targetLocation, passengerLocation, enabled]);

  // Effect to handle driver location changes (from WebSocket or polling)
  useEffect(() => {
    if (driverLocation) {
      calculateRouteAndDistance(driverLocation).catch((err: any) => {
        console.error('Error calculating route and distance:', err);
        if (!wsError) {
          setError('Failed to calculate route');
        }
      });
    }
  }, [driverLocation, calculateRouteAndDistance, wsError]);

  // Effect to handle target location changes (pickup or destination)
  useEffect(() => {
    if (driverLocation && enabled) {
      calculateRouteAndDistance(driverLocation).catch((err: any) => {
        console.error('Error recalculating route:', err);
        if (!wsError) {
          setError('Failed to calculate route');
        }
      });
    }
  }, [targetLocation, passengerLocation, driverLocation, enabled, calculateRouteAndDistance, wsError]);

  // Effect to handle WebSocket updates
  useEffect(() => {
    if (wsLastUpdated) {
      setLastUpdated(wsLastUpdated);
    }
  }, [wsLastUpdated]);

  // Effect to handle WebSocket errors
  useEffect(() => {
    if (wsError && !pollingDriverLocation) {
      setError(wsError);
    } else if (!wsError && wsDriverLocation) {
      // Clear error if WebSocket is working and providing updates
      setError(null);
    }
  }, [wsError, wsDriverLocation, pollingDriverLocation]);

  // Cleanup on unmount
  useEffect(() => {
    isMountedRef.current = true;
    
    return () => {
      isMountedRef.current = false;
      cleanup();
    };
  }, [cleanup]);

  return {
    driverLocation,
    distance,
    formattedDistance,
    eta,
    formattedEta,
    routeGeometry,
    isLoading,
    error,
    lastUpdated,
    retryCount,
    retry,
    // WebSocket specific properties
    isWebSocketConnected,
    isWebSocketConnecting,
    webSocketReconnectAttempts,
    connectWebSocket,
    disconnectWebSocket,
  };
};