// utils/cameraTransitionUtils.ts - Camera transition utilities for navigation phase changes
import { NavigationPhase } from '@/hooks/navigation/types';

export interface CameraTransitionConfig {
  type: 'SHOW_FULL_ROUTE' | 'CENTER_ON_DRIVER' | 'FOLLOW_NAVIGATION' | 'ROUTE_OVERVIEW';
  coordinates?: [number, number][];
  centerCoordinate?: [number, number];
  duration?: number;
  zoom?: number;
  bearing?: number;
  pitch?: number;
  padding?: {
    top?: number;
    bottom?: number;
    left?: number;
    right?: number;
  };
}

export interface CameraTransitionResult {
  success: boolean;
  error?: string;
  duration?: number;
}

export interface RouteOverviewConfig {
  pickupCoordinate: [number, number];
  destinationCoordinate: [number, number];
  padding?: {
    top?: number;
    bottom?: number;
    left?: number;
    right?: number;
  };
  duration?: number;
}

export interface CameraTransitionManager {
  transitionToRouteOverview: (config: RouteOverviewConfig) => Promise<CameraTransitionResult>;
  transitionToFollowMode: (driverLocation: [number, number], bearing?: number) => Promise<CameraTransitionResult>;
  transitionToPhaseCamera: (phase: NavigationPhase, config: CameraTransitionConfig) => Promise<CameraTransitionResult>;
  handleTransitionError: (error: Error, config: CameraTransitionConfig) => Promise<CameraTransitionResult>;
}

/**
 * Default camera configurations for different navigation phases
 */
export const DEFAULT_CAMERA_CONFIGS: Record<NavigationPhase, Partial<CameraTransitionConfig>> = {
  'to-pickup': {
    type: 'FOLLOW_NAVIGATION',
    zoom: 18,
    pitch: 60,
    duration: 1000
  },
  'at-pickup': {
    type: 'CENTER_ON_DRIVER',
    zoom: 19,
    pitch: 45,
    duration: 800
  },
  'picking-up': {
    type: 'CENTER_ON_DRIVER',
    zoom: 18,
    pitch: 30,
    duration: 500
  },
  'to-destination': {
    type: 'ROUTE_OVERVIEW',
    zoom: 14,
    pitch: 0,
    duration: 2000,
    padding: {
      top: 100,
      bottom: 200,
      left: 50,
      right: 50
    }
  },
  'at-destination': {
    type: 'CENTER_ON_DRIVER',
    zoom: 19,
    pitch: 45,
    duration: 800
  },
  'completed': {
    type: 'CENTER_ON_DRIVER',
    zoom: 16,
    pitch: 0,
    duration: 1500
  }
};

/**
 * Calculate optimal camera bounds for route overview
 */
export const calculateRouteBounds = (
  pickupCoordinate: [number, number],
  destinationCoordinate: [number, number],
  padding: { top?: number; bottom?: number; left?: number; right?: number } = {}
): {
  centerCoordinate: [number, number];
  zoom: number;
  bounds: {
    ne: [number, number];
    sw: [number, number];
  };
} => {
  const [pickupLng, pickupLat] = pickupCoordinate;
  const [destLng, destLat] = destinationCoordinate;

  // Calculate bounds
  const minLng = Math.min(pickupLng, destLng);
  const maxLng = Math.max(pickupLng, destLng);
  const minLat = Math.min(pickupLat, destLat);
  const maxLat = Math.max(pickupLat, destLat);

  // Add padding (convert to degrees approximately)
  const paddingLng = (maxLng - minLng) * 0.1; // 10% padding
  const paddingLat = (maxLat - minLat) * 0.1; // 10% padding

  const bounds = {
    ne: [maxLng + paddingLng, maxLat + paddingLat] as [number, number],
    sw: [minLng - paddingLng, minLat - paddingLat] as [number, number]
  };

  // Calculate center
  const centerCoordinate: [number, number] = [
    (minLng + maxLng) / 2,
    (minLat + maxLat) / 2
  ];

  // Calculate appropriate zoom level based on distance
  const distance = calculateDistance(pickupCoordinate, destinationCoordinate);
  let zoom = 14; // Default zoom

  if (distance < 1000) { // Less than 1km
    zoom = 16;
  } else if (distance < 5000) { // Less than 5km
    zoom = 14;
  } else if (distance < 20000) { // Less than 20km
    zoom = 12;
  } else {
    zoom = 10;
  }

  return {
    centerCoordinate,
    zoom,
    bounds
  };
};

/**
 * Calculate distance between two coordinates in meters
 */
export const calculateDistance = (
  coord1: [number, number],
  coord2: [number, number]
): number => {
  const [lng1, lat1] = coord1;
  const [lng2, lat2] = coord2;

  const R = 6371e3; // Earth's radius in meters
  const φ1 = lat1 * Math.PI / 180;
  const φ2 = lat2 * Math.PI / 180;
  const Δφ = (lat2 - lat1) * Math.PI / 180;
  const Δλ = (lng2 - lng1) * Math.PI / 180;

  const a = Math.sin(Δφ / 2) * Math.sin(Δφ / 2) +
    Math.cos(φ1) * Math.cos(φ2) *
    Math.sin(Δλ / 2) * Math.sin(Δλ / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

  return R * c;
};

/**
 * Validate camera transition configuration
 */
export const validateCameraConfig = (config: CameraTransitionConfig): boolean => {
  // Check required fields based on transition type
  switch (config.type) {
    case 'SHOW_FULL_ROUTE':
    case 'ROUTE_OVERVIEW':
      return !!(config.coordinates && config.coordinates.length >= 2);
    case 'CENTER_ON_DRIVER':
    case 'FOLLOW_NAVIGATION':
      return !!(config.centerCoordinate);
    default:
      return false;
  }
};

/**
 * Create camera transition configuration for phase changes
 */
export const createPhaseTransitionConfig = (
  phase: NavigationPhase,
  pickupCoordinate?: [number, number],
  destinationCoordinate?: [number, number],
  driverLocation?: [number, number]
): CameraTransitionConfig => {
  const baseConfig = DEFAULT_CAMERA_CONFIGS[phase];

  switch (phase) {
    case 'to-destination':
      if (pickupCoordinate && destinationCoordinate) {
        const routeBounds = calculateRouteBounds(pickupCoordinate, destinationCoordinate);
        return {
          ...baseConfig,
          type: 'ROUTE_OVERVIEW',
          coordinates: [pickupCoordinate, destinationCoordinate],
          centerCoordinate: routeBounds.centerCoordinate,
          zoom: routeBounds.zoom
        } as CameraTransitionConfig;
      }
      break;
    case 'to-pickup':
    case 'at-pickup':
    case 'picking-up':
    case 'at-destination':
    case 'completed':
      if (driverLocation) {
        return {
          ...baseConfig,
          centerCoordinate: driverLocation
        } as CameraTransitionConfig;
      }
      break;
  }

  // Fallback configuration
  return {
    type: 'CENTER_ON_DRIVER',
    centerCoordinate: driverLocation || [0, 0],
    zoom: 16,
    pitch: 45,
    duration: 1000
  };
};

/**
 * Camera transition error types
 */
export enum CameraTransitionError {
  INVALID_CONFIG = 'INVALID_CONFIG',
  CAMERA_NOT_READY = 'CAMERA_NOT_READY',
  ANIMATION_FAILED = 'ANIMATION_FAILED',
  TIMEOUT = 'TIMEOUT',
  INVALID_COORDINATES = 'INVALID_COORDINATES'
}

/**
 * Create error result for camera transitions
 */
export const createTransitionError = (
  error: CameraTransitionError,
  message?: string
): CameraTransitionResult => ({
  success: false,
  error: message || error
});

/**
 * Create success result for camera transitions
 */
export const createTransitionSuccess = (duration?: number): CameraTransitionResult => ({
  success: true,
  duration
});