// utils/__tests__/cameraTransitionUtils.test.ts - Tests for camera transition utilities
import {
  calculateRouteBounds,
  calculateDistance,
  validateCameraConfig,
  createPhaseTransitionConfig,
  DEFAULT_CAMERA_CONFIGS,
  CameraTransitionError,
  createTransitionError,
  createTransitionSuccess
} from '../cameraTransitionUtils';
import { NavigationPhase } from '@/hooks/navigation/types';

describe('cameraTransitionUtils', () => {
  describe('calculateDistance', () => {
    it('should calculate distance between two coordinates correctly', () => {
      const coord1: [number, number] = [-122.4194, 37.7749]; // San Francisco
      const coord2: [number, number] = [-122.0822, 37.4220]; // Palo Alto
      
      const distance = calculateDistance(coord1, coord2);
      
      // Distance should be approximately 50km
      expect(distance).toBeGreaterThan(45000);
      expect(distance).toBeLessThan(55000);
    });

    it('should return 0 for identical coordinates', () => {
      const coord: [number, number] = [-122.4194, 37.7749];
      const distance = calculateDistance(coord, coord);
      
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
  });

  describe('calculateRouteBounds', () => {
    it('should calculate bounds for a simple route', () => {
      const pickup: [number, number] = [-122.4194, 37.7749];
      const destination: [number, number] = [-122.0822, 37.4220];
      
      const result = calculateRouteBounds(pickup, destination);
      
      expect(result.centerCoordinate).toHaveLength(2);
      expect(result.centerCoordinate[0]).toBeCloseTo(-122.2508, 2); // Average longitude
      expect(result.centerCoordinate[1]).toBeCloseTo(37.59845, 2); // Average latitude
      expect(result.zoom).toBeGreaterThan(0);
      expect(result.zoom).toBeLessThan(22);
      expect(result.bounds.ne).toHaveLength(2);
      expect(result.bounds.sw).toHaveLength(2);
    });

    it('should handle very close coordinates', () => {
      const pickup: [number, number] = [-122.4194, 37.7749];
      const destination: [number, number] = [-122.4190, 37.7750]; // Very close
      
      const result = calculateRouteBounds(pickup, destination);
      
      expect(result.zoom).toBeGreaterThan(14); // Should be high zoom for close coordinates
      expect(result.centerCoordinate[0]).toBeCloseTo(-122.4192, 3);
      expect(result.centerCoordinate[1]).toBeCloseTo(37.77495, 3);
    });

    it('should handle coordinates with custom padding', () => {
      const pickup: [number, number] = [-122.4194, 37.7749];
      const destination: [number, number] = [-122.0822, 37.4220];
      const padding = { top: 100, bottom: 200, left: 50, right: 50 };
      
      const result = calculateRouteBounds(pickup, destination, padding);
      
      expect(result.bounds.ne[0]).toBeGreaterThan(Math.max(pickup[0], destination[0]));
      expect(result.bounds.ne[1]).toBeGreaterThan(Math.max(pickup[1], destination[1]));
      expect(result.bounds.sw[0]).toBeLessThan(Math.min(pickup[0], destination[0]));
      expect(result.bounds.sw[1]).toBeLessThan(Math.min(pickup[1], destination[1]));
    });
  });

  describe('validateCameraConfig', () => {
    it('should validate SHOW_FULL_ROUTE config', () => {
      const validConfig = {
        type: 'SHOW_FULL_ROUTE' as const,
        coordinates: [[-122.4194, 37.7749], [-122.0822, 37.4220]] as [number, number][]
      };
      
      expect(validateCameraConfig(validConfig)).toBe(true);
    });

    it('should reject SHOW_FULL_ROUTE config without coordinates', () => {
      const invalidConfig = {
        type: 'SHOW_FULL_ROUTE' as const
      };
      
      expect(validateCameraConfig(invalidConfig)).toBe(false);
    });

    it('should validate CENTER_ON_DRIVER config', () => {
      const validConfig = {
        type: 'CENTER_ON_DRIVER' as const,
        centerCoordinate: [-122.4194, 37.7749] as [number, number]
      };
      
      expect(validateCameraConfig(validConfig)).toBe(true);
    });

    it('should reject CENTER_ON_DRIVER config without centerCoordinate', () => {
      const invalidConfig = {
        type: 'CENTER_ON_DRIVER' as const
      };
      
      expect(validateCameraConfig(invalidConfig)).toBe(false);
    });

    it('should validate ROUTE_OVERVIEW config', () => {
      const validConfig = {
        type: 'ROUTE_OVERVIEW' as const,
        coordinates: [[-122.4194, 37.7749], [-122.0822, 37.4220]] as [number, number][]
      };
      
      expect(validateCameraConfig(validConfig)).toBe(true);
    });

    it('should validate FOLLOW_NAVIGATION config', () => {
      const validConfig = {
        type: 'FOLLOW_NAVIGATION' as const,
        centerCoordinate: [-122.4194, 37.7749] as [number, number]
      };
      
      expect(validateCameraConfig(validConfig)).toBe(true);
    });
  });

  describe('createPhaseTransitionConfig', () => {
    it('should create config for to-destination phase', () => {
      const pickup: [number, number] = [-122.4194, 37.7749];
      const destination: [number, number] = [-122.0822, 37.4220];
      const driverLocation: [number, number] = [-122.4000, 37.7500];
      
      const config = createPhaseTransitionConfig('to-destination', pickup, destination, driverLocation);
      
      expect(config.type).toBe('ROUTE_OVERVIEW');
      expect(config.coordinates).toEqual([pickup, destination]);
      expect(config.centerCoordinate).toBeDefined();
      expect(config.zoom).toBeDefined();
    });

    it('should create config for to-pickup phase', () => {
      const driverLocation: [number, number] = [-122.4000, 37.7500];
      
      const config = createPhaseTransitionConfig('to-pickup', undefined, undefined, driverLocation);
      
      expect(config.type).toBe('FOLLOW_NAVIGATION');
      expect(config.centerCoordinate).toEqual(driverLocation);
      expect(config.zoom).toBe(18);
      expect(config.pitch).toBe(60);
    });

    it('should create config for at-pickup phase', () => {
      const driverLocation: [number, number] = [-122.4000, 37.7500];
      
      const config = createPhaseTransitionConfig('at-pickup', undefined, undefined, driverLocation);
      
      expect(config.type).toBe('CENTER_ON_DRIVER');
      expect(config.centerCoordinate).toEqual(driverLocation);
      expect(config.zoom).toBe(19);
      expect(config.pitch).toBe(45);
    });

    it('should create config for completed phase', () => {
      const driverLocation: [number, number] = [-122.4000, 37.7500];
      
      const config = createPhaseTransitionConfig('completed', undefined, undefined, driverLocation);
      
      expect(config.type).toBe('CENTER_ON_DRIVER');
      expect(config.centerCoordinate).toEqual(driverLocation);
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

  describe('DEFAULT_CAMERA_CONFIGS', () => {
    it('should have configs for all navigation phases', () => {
      const phases: NavigationPhase[] = [
        'to-pickup',
        'at-pickup', 
        'picking-up',
        'to-destination',
        'at-destination',
        'completed'
      ];
      
      phases.forEach(phase => {
        expect(DEFAULT_CAMERA_CONFIGS[phase]).toBeDefined();
        expect(DEFAULT_CAMERA_CONFIGS[phase].type).toBeDefined();
        expect(DEFAULT_CAMERA_CONFIGS[phase].duration).toBeDefined();
      });
    });

    it('should have appropriate configs for each phase', () => {
      expect(DEFAULT_CAMERA_CONFIGS['to-pickup'].type).toBe('FOLLOW_NAVIGATION');
      expect(DEFAULT_CAMERA_CONFIGS['to-pickup'].zoom).toBe(18);
      
      expect(DEFAULT_CAMERA_CONFIGS['to-destination'].type).toBe('ROUTE_OVERVIEW');
      expect(DEFAULT_CAMERA_CONFIGS['to-destination'].zoom).toBe(14);
      expect(DEFAULT_CAMERA_CONFIGS['to-destination'].pitch).toBe(0);
      
      expect(DEFAULT_CAMERA_CONFIGS['completed'].pitch).toBe(0);
      expect(DEFAULT_CAMERA_CONFIGS['completed'].zoom).toBe(16);
    });
  });

  describe('createTransitionError', () => {
    it('should create error result with message', () => {
      const result = createTransitionError(CameraTransitionError.INVALID_CONFIG, 'Custom error message');
      
      expect(result.success).toBe(false);
      expect(result.error).toBe('Custom error message');
    });

    it('should create error result with default message', () => {
      const result = createTransitionError(CameraTransitionError.CAMERA_NOT_READY);
      
      expect(result.success).toBe(false);
      expect(result.error).toBe(CameraTransitionError.CAMERA_NOT_READY);
    });
  });

  describe('createTransitionSuccess', () => {
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

  describe('edge cases', () => {
    it('should handle invalid coordinates gracefully', () => {
      const invalidCoord1: [number, number] = [NaN, 37.7749];
      const validCoord2: [number, number] = [-122.0822, 37.4220];
      
      const distance = calculateDistance(invalidCoord1, validCoord2);
      expect(isNaN(distance)).toBe(true);
    });

    it('should handle extreme coordinate values', () => {
      const coord1: [number, number] = [-180, -90]; // South Pole, Date Line
      const coord2: [number, number] = [180, 90];   // North Pole, Date Line
      
      const distance = calculateDistance(coord1, coord2);
      expect(distance).toBeGreaterThan(0);
      expect(isFinite(distance)).toBe(true);
    });

    it('should handle identical coordinates in bounds calculation', () => {
      const coord: [number, number] = [-122.4194, 37.7749];
      
      const result = calculateRouteBounds(coord, coord);
      
      expect(result.centerCoordinate).toEqual(coord);
      expect(result.zoom).toBeGreaterThan(14); // Should be high zoom for identical coordinates
    });
  });
});