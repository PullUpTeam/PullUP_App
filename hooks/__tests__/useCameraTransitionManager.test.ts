// hooks/__tests__/useCameraTransitionManager.test.ts - Tests for camera transition manager hook
import {
  CameraTransitionConfig,
  CameraTransitionError,
  createTransitionError,
  createTransitionSuccess,
  validateCameraConfig,
  calculateRouteBounds,
  calculateDistance,
  createPhaseTransitionConfig
} from '@/utils/cameraTransitionUtils';
import { NavigationPhase } from '@/hooks/navigation/types';

// Mock the NavigationMapboxMapRef
const mockMapRef = {
  current: {
    centerOnDriver: jest.fn(),
    recenterWithBearing: jest.fn(),
    flyTo: jest.fn(),
    resetView: jest.fn(),
    clearMapElements: jest.fn(),
    updateGeofenceVisibility: jest.fn(),
    transitionToRouteOverview: jest.fn(),
    transitionToFollowMode: jest.fn(),
    transitionWithBounds: jest.fn()
  }
};

describe('CameraTransitionManager Core Logic', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  const mockDriverLocation: [number, number] = [-122.4194, 37.7749];
  const mockPickupLocation: [number, number] = [-122.4000, 37.7500];
  const mockDestinationLocation: [number, number] = [-122.0822, 37.4220];

  describe('Camera Configuration Validation', () => {
    it('should validate ROUTE_OVERVIEW config with coordinates', () => {
      const config: CameraTransitionConfig = {
        type: 'ROUTE_OVERVIEW',
        coordinates: [mockPickupLocation, mockDestinationLocation]
      };

      expect(validateCameraConfig(config)).toBe(true);
    });

    it('should reject ROUTE_OVERVIEW config without coordinates', () => {
      const config: CameraTransitionConfig = {
        type: 'ROUTE_OVERVIEW'
      };

      expect(validateCameraConfig(config)).toBe(false);
    });

    it('should validate CENTER_ON_DRIVER config with centerCoordinate', () => {
      const config: CameraTransitionConfig = {
        type: 'CENTER_ON_DRIVER',
        centerCoordinate: mockDriverLocation
      };

      expect(validateCameraConfig(config)).toBe(true);
    });

    it('should reject CENTER_ON_DRIVER config without centerCoordinate', () => {
      const config: CameraTransitionConfig = {
        type: 'CENTER_ON_DRIVER'
      };

      expect(validateCameraConfig(config)).toBe(false);
    });

    it('should validate FOLLOW_NAVIGATION config', () => {
      const config: CameraTransitionConfig = {
        type: 'FOLLOW_NAVIGATION',
        centerCoordinate: mockDriverLocation
      };

      expect(validateCameraConfig(config)).toBe(true);
    });
  });

  describe('Route Bounds Calculation', () => {
    it('should calculate bounds for pickup to destination route', () => {
      const result = calculateRouteBounds(mockPickupLocation, mockDestinationLocation);

      expect(result.centerCoordinate).toHaveLength(2);
      expect(result.centerCoordinate[0]).toBeCloseTo(-122.2411, 2); // Average longitude
      expect(result.centerCoordinate[1]).toBeCloseTo(37.586, 2); // Average latitude
      expect(result.zoom).toBeGreaterThan(0);
      expect(result.zoom).toBeLessThan(22);
      expect(result.bounds.ne).toHaveLength(2);
      expect(result.bounds.sw).toHaveLength(2);
    });

    it('should handle very close coordinates with high zoom', () => {
      const closeDestination: [number, number] = [-122.4001, 37.7501]; // Very close to pickup
      
      const result = calculateRouteBounds(mockPickupLocation, closeDestination);
      
      expect(result.zoom).toBeGreaterThan(14); // Should be high zoom for close coordinates
      expect(result.centerCoordinate[0]).toBeCloseTo(-122.40005, 4);
      expect(result.centerCoordinate[1]).toBeCloseTo(37.75005, 4);
    });

    it('should apply padding to bounds calculation', () => {
      const padding = { top: 100, bottom: 200, left: 50, right: 50 };
      
      const result = calculateRouteBounds(mockPickupLocation, mockDestinationLocation, padding);
      
      expect(result.bounds.ne[0]).toBeGreaterThan(Math.max(mockPickupLocation[0], mockDestinationLocation[0]));
      expect(result.bounds.ne[1]).toBeGreaterThan(Math.max(mockPickupLocation[1], mockDestinationLocation[1]));
      expect(result.bounds.sw[0]).toBeLessThan(Math.min(mockPickupLocation[0], mockDestinationLocation[0]));
      expect(result.bounds.sw[1]).toBeLessThan(Math.min(mockPickupLocation[1], mockDestinationLocation[1]));
    });
  });

  describe('Phase-Based Camera Configuration', () => {
    it('should create route overview config for to-destination phase', () => {
      const config = createPhaseTransitionConfig(
        'to-destination',
        mockPickupLocation,
        mockDestinationLocation,
        mockDriverLocation
      );

      expect(config.type).toBe('ROUTE_OVERVIEW');
      expect(config.coordinates).toEqual([mockPickupLocation, mockDestinationLocation]);
      expect(config.centerCoordinate).toBeDefined();
      expect(config.zoom).toBeDefined();
    });

    it('should create follow navigation config for to-pickup phase', () => {
      const config = createPhaseTransitionConfig(
        'to-pickup',
        undefined,
        undefined,
        mockDriverLocation
      );

      expect(config.type).toBe('FOLLOW_NAVIGATION');
      expect(config.centerCoordinate).toEqual(mockDriverLocation);
      expect(config.zoom).toBe(18);
      expect(config.pitch).toBe(60);
    });

    it('should create center on driver config for at-pickup phase', () => {
      const config = createPhaseTransitionConfig(
        'at-pickup',
        undefined,
        undefined,
        mockDriverLocation
      );

      expect(config.type).toBe('CENTER_ON_DRIVER');
      expect(config.centerCoordinate).toEqual(mockDriverLocation);
      expect(config.zoom).toBe(19);
      expect(config.pitch).toBe(45);
    });

    it('should create completed phase config with reset view', () => {
      const config = createPhaseTransitionConfig(
        'completed',
        undefined,
        undefined,
        mockDriverLocation
      );

      expect(config.type).toBe('CENTER_ON_DRIVER');
      expect(config.centerCoordinate).toEqual(mockDriverLocation);
      expect(config.zoom).toBe(16);
      expect(config.pitch).toBe(0);
    });

    it('should create fallback config when coordinates are missing', () => {
      const config = createPhaseTransitionConfig('to-destination');

      expect(config.type).toBe('CENTER_ON_DRIVER');
      expect(config.centerCoordinate).toEqual([0, 0]);
      expect(config.zoom).toBe(16);
    });
  });

  describe('Distance Calculation', () => {
    it('should calculate distance between coordinates correctly', () => {
      const distance = calculateDistance(mockPickupLocation, mockDestinationLocation);
      
      // Distance should be approximately 50km between these coordinates
      expect(distance).toBeGreaterThan(45000);
      expect(distance).toBeLessThan(55000);
    });

    it('should return 0 for identical coordinates', () => {
      const distance = calculateDistance(mockDriverLocation, mockDriverLocation);
      expect(distance).toBe(0);
    });

    it('should handle coordinates across the globe', () => {
      const coord1: [number, number] = [0, 0]; // Equator, Prime Meridian
      const coord2: [number, number] = [180, 0]; // Equator, International Date Line
      
      const distance = calculateDistance(coord1, coord2);
      
      // Should be approximately half the Earth's circumference
      expect(distance).toBeGreaterThan(19000000); // ~19,000 km
      expect(distance).toBeLessThan(21000000); // ~21,000 km
    });

    it('should handle invalid coordinates gracefully', () => {
      const invalidCoord: [number, number] = [NaN, 37.7749];
      const validCoord: [number, number] = [-122.0822, 37.4220];
      
      const distance = calculateDistance(invalidCoord, validCoord);
      expect(isNaN(distance)).toBe(true);
    });
  });

  describe('Transition Error Handling', () => {
    it('should create error result with custom message', () => {
      const result = createTransitionError(CameraTransitionError.INVALID_CONFIG, 'Custom error message');
      
      expect(result.success).toBe(false);
      expect(result.error).toBe('Custom error message');
    });

    it('should create error result with default message', () => {
      const result = createTransitionError(CameraTransitionError.CAMERA_NOT_READY);
      
      expect(result.success).toBe(false);
      expect(result.error).toBe(CameraTransitionError.CAMERA_NOT_READY);
    });

    it('should create success result', () => {
      const result = createTransitionSuccess();
      
      expect(result.success).toBe(true);
      expect(result.error).toBeUndefined();
    });

    it('should create success result with duration', () => {
      const duration = 1500;
      const result = createTransitionSuccess(duration);
      
      expect(result.success).toBe(true);
      expect(result.duration).toBe(duration);
    });
  });

  describe('Camera Transition Types', () => {
    it('should handle SHOW_FULL_ROUTE transition type', () => {
      const config: CameraTransitionConfig = {
        type: 'SHOW_FULL_ROUTE',
        coordinates: [mockPickupLocation, mockDestinationLocation],
        duration: 2000
      };

      expect(validateCameraConfig(config)).toBe(true);
      expect(config.type).toBe('SHOW_FULL_ROUTE');
      expect(config.coordinates).toHaveLength(2);
    });

    it('should handle CENTER_ON_DRIVER transition type', () => {
      const config: CameraTransitionConfig = {
        type: 'CENTER_ON_DRIVER',
        centerCoordinate: mockDriverLocation,
        zoom: 18,
        pitch: 45,
        duration: 1000
      };

      expect(validateCameraConfig(config)).toBe(true);
      expect(config.type).toBe('CENTER_ON_DRIVER');
      expect(config.centerCoordinate).toEqual(mockDriverLocation);
    });

    it('should handle FOLLOW_NAVIGATION transition type', () => {
      const config: CameraTransitionConfig = {
        type: 'FOLLOW_NAVIGATION',
        centerCoordinate: mockDriverLocation,
        bearing: 45,
        zoom: 18,
        pitch: 60
      };

      expect(validateCameraConfig(config)).toBe(true);
      expect(config.type).toBe('FOLLOW_NAVIGATION');
      expect(config.bearing).toBe(45);
    });

    it('should handle ROUTE_OVERVIEW transition type', () => {
      const config: CameraTransitionConfig = {
        type: 'ROUTE_OVERVIEW',
        coordinates: [mockPickupLocation, mockDestinationLocation],
        padding: { top: 100, bottom: 200, left: 50, right: 50 },
        duration: 2000
      };

      expect(validateCameraConfig(config)).toBe(true);
      expect(config.type).toBe('ROUTE_OVERVIEW');
      expect(config.padding).toBeDefined();
    });
  });

  describe('Navigation Phase Configurations', () => {
    const phases: NavigationPhase[] = [
      'to-pickup',
      'at-pickup', 
      'picking-up',
      'to-destination',
      'at-destination',
      'completed'
    ];

    it('should have appropriate zoom levels for each phase', () => {
      phases.forEach(phase => {
        const config = createPhaseTransitionConfig(phase, mockPickupLocation, mockDestinationLocation, mockDriverLocation);
        
        expect(config.zoom).toBeGreaterThan(0);
        expect(config.zoom).toBeLessThan(22);
        
        // Specific zoom expectations
        if (phase === 'at-pickup') {
          expect(config.zoom).toBe(19); // Close zoom for pickup
        } else if (phase === 'to-destination') {
          expect(config.zoom).toBeLessThanOrEqual(14); // Wide view for route overview
        } else if (phase === 'completed') {
          expect(config.zoom).toBe(16); // Medium zoom for completion
        }
      });
    });

    it('should have appropriate pitch angles for each phase', () => {
      phases.forEach(phase => {
        const config = createPhaseTransitionConfig(phase, mockPickupLocation, mockDestinationLocation, mockDriverLocation);
        
        expect(config.pitch).toBeGreaterThanOrEqual(0);
        expect(config.pitch).toBeLessThanOrEqual(60);
        
        // Specific pitch expectations
        if (phase === 'to-pickup') {
          expect(config.pitch).toBe(60); // Navigation view
        } else if (phase === 'to-destination') {
          expect(config.pitch).toBe(0); // Top-down for route overview
        } else if (phase === 'completed') {
          expect(config.pitch).toBe(0); // Flat view for completion
        }
      });
    });

    it('should have appropriate transition durations for each phase', () => {
      phases.forEach(phase => {
        const config = createPhaseTransitionConfig(phase, mockPickupLocation, mockDestinationLocation, mockDriverLocation);
        
        expect(config.duration).toBeGreaterThan(0);
        expect(config.duration).toBeLessThanOrEqual(3000);
        
        // Route overview should have longer duration
        if (phase === 'to-destination') {
          expect(config.duration).toBeGreaterThanOrEqual(2000);
        }
      });
    });
  });

  describe('Edge Cases and Error Handling', () => {
    it('should handle invalid coordinates gracefully', () => {
      const invalidConfig: CameraTransitionConfig = {
        type: 'CENTER_ON_DRIVER',
        centerCoordinate: [NaN, NaN]
      };

      expect(validateCameraConfig(invalidConfig)).toBe(true); // Validation passes, but execution would handle NaN
    });

    it('should handle missing coordinates for route overview', () => {
      const invalidConfig: CameraTransitionConfig = {
        type: 'ROUTE_OVERVIEW'
        // Missing coordinates
      };

      expect(validateCameraConfig(invalidConfig)).toBe(false);
    });

    it('should handle extreme coordinate values', () => {
      const extremeConfig: CameraTransitionConfig = {
        type: 'CENTER_ON_DRIVER',
        centerCoordinate: [-180, -90] // South Pole, Date Line
      };

      expect(validateCameraConfig(extremeConfig)).toBe(true);
    });

    it('should handle identical pickup and destination coordinates', () => {
      const result = calculateRouteBounds(mockPickupLocation, mockPickupLocation);
      
      expect(result.centerCoordinate).toEqual(mockPickupLocation);
      expect(result.zoom).toBeGreaterThan(14); // Should be high zoom for identical coordinates
    });

    it('should handle very large distances', () => {
      const coord1: [number, number] = [-180, -90]; // South Pole, Date Line
      const coord2: [number, number] = [180, 90];   // North Pole, Date Line
      
      const result = calculateRouteBounds(coord1, coord2);
      
      expect(result.centerCoordinate[0]).toBeCloseTo(0, 1); // Should center around 0 longitude
      expect(result.centerCoordinate[1]).toBeCloseTo(0, 1); // Should center around 0 latitude
      expect(result.zoom).toBeLessThanOrEqual(10); // Should be low zoom for large distances
    });

    it('should handle configuration with all optional parameters', () => {
      const fullConfig: CameraTransitionConfig = {
        type: 'ROUTE_OVERVIEW',
        coordinates: [mockPickupLocation, mockDestinationLocation],
        centerCoordinate: mockDriverLocation,
        duration: 2500,
        zoom: 15,
        bearing: 90,
        pitch: 30,
        padding: {
          top: 100,
          bottom: 150,
          left: 75,
          right: 75
        }
      };

      expect(validateCameraConfig(fullConfig)).toBe(true);
      expect(fullConfig.duration).toBe(2500);
      expect(fullConfig.zoom).toBe(15);
      expect(fullConfig.bearing).toBe(90);
      expect(fullConfig.pitch).toBe(30);
      expect(fullConfig.padding).toBeDefined();
    });
  });

  describe('Camera Transition Error Types', () => {
    it('should define all error types correctly', () => {
      expect(CameraTransitionError.INVALID_CONFIG).toBe('INVALID_CONFIG');
      expect(CameraTransitionError.CAMERA_NOT_READY).toBe('CAMERA_NOT_READY');
      expect(CameraTransitionError.ANIMATION_FAILED).toBe('ANIMATION_FAILED');
      expect(CameraTransitionError.TIMEOUT).toBe('TIMEOUT');
      expect(CameraTransitionError.INVALID_COORDINATES).toBe('INVALID_COORDINATES');
    });

    it('should create appropriate error messages for each error type', () => {
      const configError = createTransitionError(CameraTransitionError.INVALID_CONFIG);
      const readyError = createTransitionError(CameraTransitionError.CAMERA_NOT_READY);
      const animationError = createTransitionError(CameraTransitionError.ANIMATION_FAILED);
      const timeoutError = createTransitionError(CameraTransitionError.TIMEOUT);
      const coordinateError = createTransitionError(CameraTransitionError.INVALID_COORDINATES);

      expect(configError.error).toBe('INVALID_CONFIG');
      expect(readyError.error).toBe('CAMERA_NOT_READY');
      expect(animationError.error).toBe('ANIMATION_FAILED');
      expect(timeoutError.error).toBe('TIMEOUT');
      expect(coordinateError.error).toBe('INVALID_COORDINATES');

      // All should be failed results
      [configError, readyError, animationError, timeoutError, coordinateError].forEach(result => {
        expect(result.success).toBe(false);
      });
    });
  });

  describe('Integration with Navigation Phases', () => {
    it('should create appropriate configs for critical phase transitions', () => {
      // Test the critical pickup -> destination transition
      const toDestinationConfig = createPhaseTransitionConfig(
        'to-destination',
        mockPickupLocation,
        mockDestinationLocation,
        mockDriverLocation
      );

      expect(toDestinationConfig.type).toBe('ROUTE_OVERVIEW');
      expect(toDestinationConfig.coordinates).toEqual([mockPickupLocation, mockDestinationLocation]);
      expect(toDestinationConfig.zoom).toBeLessThanOrEqual(14); // Wide view for route
      expect(toDestinationConfig.pitch).toBe(0); // Top-down view
      expect(toDestinationConfig.duration).toBeGreaterThanOrEqual(2000); // Longer duration

      // Test follow mode for active navigation
      const toPickupConfig = createPhaseTransitionConfig(
        'to-pickup',
        undefined,
        undefined,
        mockDriverLocation
      );

      expect(toPickupConfig.type).toBe('FOLLOW_NAVIGATION');
      expect(toPickupConfig.centerCoordinate).toEqual(mockDriverLocation);
      expect(toPickupConfig.zoom).toBe(18); // Close navigation view
      expect(toPickupConfig.pitch).toBe(60); // Navigation angle
    });

    it('should handle phase transitions without required coordinates', () => {
      // Test to-destination without pickup/destination coordinates
      const fallbackConfig = createPhaseTransitionConfig('to-destination');

      expect(fallbackConfig.type).toBe('CENTER_ON_DRIVER');
      expect(fallbackConfig.centerCoordinate).toEqual([0, 0]);
      expect(fallbackConfig.zoom).toBe(16);

      // Test other phases without driver location
      const phases: NavigationPhase[] = ['to-pickup', 'at-pickup', 'picking-up', 'at-destination', 'completed'];
      
      phases.forEach(phase => {
        const config = createPhaseTransitionConfig(phase);
        expect(config.type).toBe('CENTER_ON_DRIVER');
        expect(config.centerCoordinate).toEqual([0, 0]);
      });
    });
  });
});