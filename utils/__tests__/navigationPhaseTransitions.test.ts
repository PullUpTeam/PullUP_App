import {
  isValidTransition,
  getTransitionConfig,
  validateTransitionContext,
  createTransitionContext,
  getValidNextPhases,
  isTerminalPhase,
  getTransitionDescription,
  requiresRouteRecalculation,
  requiresGeofenceUpdate,
  sortActionsByPriority,
  TransitionAction,
  PhaseTransitionConfig,
} from '../navigationPhaseTransitions';
import { NavigationPhase } from '@/hooks/navigation/types';

describe('navigationPhaseTransitions', () => {
  describe('isValidTransition', () => {
    it('should allow valid transitions', () => {
      expect(isValidTransition('to-pickup', 'at-pickup')).toBe(true);
      expect(isValidTransition('at-pickup', 'picking-up')).toBe(true);
      expect(isValidTransition('picking-up', 'to-destination')).toBe(true);
      expect(isValidTransition('to-destination', 'at-destination')).toBe(true);
      expect(isValidTransition('at-destination', 'completed')).toBe(true);
    });

    it('should reject invalid transitions', () => {
      expect(isValidTransition('to-pickup', 'to-destination')).toBe(false);
      expect(isValidTransition('completed', 'to-pickup')).toBe(false);
      expect(isValidTransition('at-pickup', 'at-destination')).toBe(false);
    });

    it('should allow emergency completion from any phase', () => {
      expect(isValidTransition('to-pickup', 'completed')).toBe(true);
      expect(isValidTransition('at-pickup', 'completed')).toBe(true);
      expect(isValidTransition('picking-up', 'completed')).toBe(true);
      expect(isValidTransition('to-destination', 'completed')).toBe(true);
    });
  });

  describe('getTransitionConfig', () => {
    it('should return config for valid transitions', () => {
      const config = getTransitionConfig('picking-up', 'to-destination');
      expect(config).toBeTruthy();
      expect(config?.from).toBe('picking-up');
      expect(config?.to).toBe('to-destination');
      expect(config?.actions).toBeDefined();
      expect(config?.actions.length).toBeGreaterThan(0);
    });

    it('should return null for invalid transitions', () => {
      const config = getTransitionConfig('to-pickup', 'to-destination');
      expect(config).toBeNull();
    });

    it('should include rollback actions for critical transitions', () => {
      const config = getTransitionConfig('picking-up', 'to-destination');
      expect(config?.rollback).toBeDefined();
      expect(config?.rollback?.length).toBeGreaterThan(0);
    });
  });

  describe('validateTransitionContext', () => {
    const mockConfig: PhaseTransitionConfig = {
      from: 'to-pickup',
      to: 'at-pickup',
      actions: [],
      validation: (context) => !!context.driverLocation && !!context.pickupLocation,
    };

    it('should validate correct context', () => {
      const context = createTransitionContext('to-pickup', 'at-pickup', {
        driverLocation: { latitude: 40.7128, longitude: -74.0060 },
        pickupLocation: { latitude: 40.7589, longitude: -73.9851 },
      });

      const result = validateTransitionContext(mockConfig, context);
      expect(result.valid).toBe(true);
      expect(result.error).toBeUndefined();
    });

    it('should reject context with mismatched phases', () => {
      const context = createTransitionContext('at-pickup', 'at-pickup');
      const result = validateTransitionContext(mockConfig, context);
      expect(result.valid).toBe(false);
      expect(result.error).toContain('Current phase');
    });

    it('should reject context failing custom validation', () => {
      const context = createTransitionContext('to-pickup', 'at-pickup', {
        driverLocation: { latitude: 40.7128, longitude: -74.0060 },
        // Missing pickupLocation
      });

      const result = validateTransitionContext(mockConfig, context);
      expect(result.valid).toBe(false);
      expect(result.error).toContain('Custom validation failed');
    });
  });

  describe('getValidNextPhases', () => {
    it('should return correct next phases', () => {
      expect(getValidNextPhases('to-pickup')).toEqual(['at-pickup', 'completed']);
      expect(getValidNextPhases('at-pickup')).toEqual(['picking-up', 'completed']);
      expect(getValidNextPhases('picking-up')).toEqual(['to-destination', 'completed']);
      expect(getValidNextPhases('completed')).toEqual([]);
    });
  });

  describe('isTerminalPhase', () => {
    it('should identify terminal phases', () => {
      expect(isTerminalPhase('completed')).toBe(true);
      expect(isTerminalPhase('to-pickup')).toBe(false);
      expect(isTerminalPhase('at-pickup')).toBe(false);
    });
  });

  describe('getTransitionDescription', () => {
    it('should return meaningful descriptions', () => {
      const description = getTransitionDescription('picking-up', 'to-destination');
      expect(description).toBe('Starting navigation to destination');
      
      const fallbackDescription = getTransitionDescription('to-pickup' as NavigationPhase, 'invalid' as NavigationPhase);
      expect(fallbackDescription).toContain('Transitioning from');
    });
  });

  describe('requiresRouteRecalculation', () => {
    it('should identify transitions requiring route recalculation', () => {
      expect(requiresRouteRecalculation('picking-up', 'to-destination')).toBe(true);
      expect(requiresRouteRecalculation('to-pickup', 'at-pickup')).toBe(false);
      expect(requiresRouteRecalculation('at-pickup', 'picking-up')).toBe(false);
    });
  });

  describe('requiresGeofenceUpdate', () => {
    it('should identify transitions requiring geofence updates', () => {
      expect(requiresGeofenceUpdate('picking-up', 'to-destination')).toBe(true);
      expect(requiresGeofenceUpdate('at-destination', 'completed')).toBe(true);
      expect(requiresGeofenceUpdate('to-pickup', 'at-pickup')).toBe(false);
    });
  });

  describe('sortActionsByPriority', () => {
    it('should sort actions by priority', () => {
      const actions: TransitionAction[] = [
        { type: 'ANNOUNCE_INSTRUCTION', priority: 3 },
        { type: 'CLEAR_ROUTE', priority: 1 },
        { type: 'UPDATE_CAMERA', priority: 2 },
        { type: 'RESTART_NAVIGATION' }, // No priority - should be last
      ];

      const sorted = sortActionsByPriority(actions);
      expect(sorted[0].type).toBe('CLEAR_ROUTE');
      expect(sorted[1].type).toBe('UPDATE_CAMERA');
      expect(sorted[2].type).toBe('ANNOUNCE_INSTRUCTION');
      expect(sorted[3].type).toBe('RESTART_NAVIGATION');
    });

    it('should not mutate original array', () => {
      const actions: TransitionAction[] = [
        { type: 'ANNOUNCE_INSTRUCTION', priority: 3 },
        { type: 'CLEAR_ROUTE', priority: 1 },
      ];

      const original = [...actions];
      sortActionsByPriority(actions);
      expect(actions).toEqual(original);
    });
  });

  describe('createTransitionContext', () => {
    it('should create context with all provided options', () => {
      const context = createTransitionContext('to-pickup', 'at-pickup', {
        driverLocation: { latitude: 40.7128, longitude: -74.0060 },
        pickupLocation: { latitude: 40.7589, longitude: -73.9851 },
        hasActiveRoute: true,
        isNavigationActive: false,
      });

      expect(context.currentPhase).toBe('to-pickup');
      expect(context.targetPhase).toBe('at-pickup');
      expect(context.driverLocation).toEqual({ latitude: 40.7128, longitude: -74.0060 });
      expect(context.pickupLocation).toEqual({ latitude: 40.7589, longitude: -73.9851 });
      expect(context.hasActiveRoute).toBe(true);
      expect(context.isNavigationActive).toBe(false);
    });

    it('should create minimal context with just phases', () => {
      const context = createTransitionContext('to-pickup', 'at-pickup');
      expect(context.currentPhase).toBe('to-pickup');
      expect(context.targetPhase).toBe('at-pickup');
      expect(context.driverLocation).toBeUndefined();
    });
  });
});