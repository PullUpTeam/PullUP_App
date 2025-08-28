import { NavigationPhase } from '@/hooks/navigation/types';
import {
  isValidTransition,
  getTransitionConfig,
  validateTransitionContext,
  createTransitionContext,
  getTransitionDescription,
  getValidNextPhases,
  isTerminalPhase,
  requiresRouteRecalculation,
  requiresGeofenceUpdate,
  getTransitionDuration,
  TransitionContext,
  PhaseTransitionConfig,
} from '@/utils/navigationPhaseTransitions';

// Mock the navigation utilities
jest.mock('@/utils/navigationTransitionExecutor');

describe('useNavigationPhaseManager - Core Logic', () => {
  const mockDriverLocation = { latitude: 40.7128, longitude: -74.0060 };
  const mockPickupLocation = { latitude: 40.7589, longitude: -73.9851 };
  const mockDestinationLocation = { latitude: 40.6892, longitude: -74.0445 };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('Phase Validation', () => {
    it('should validate valid transitions from to-pickup', () => {
      expect(isValidTransition('to-pickup', 'at-pickup')).toBe(true);
      expect(isValidTransition('to-pickup', 'completed')).toBe(true);
      expect(isValidTransition('to-pickup', 'to-destination')).toBe(false);
      expect(isValidTransition('to-pickup', 'picking-up')).toBe(false);
    });

    it('should validate valid transitions from at-pickup', () => {
      expect(isValidTransition('at-pickup', 'picking-up')).toBe(true);
      expect(isValidTransition('at-pickup', 'completed')).toBe(true);
      expect(isValidTransition('at-pickup', 'to-destination')).toBe(false);
      expect(isValidTransition('at-pickup', 'to-pickup')).toBe(false);
    });

    it('should validate valid transitions from picking-up', () => {
      expect(isValidTransition('picking-up', 'to-destination')).toBe(true);
      expect(isValidTransition('picking-up', 'completed')).toBe(true);
      expect(isValidTransition('picking-up', 'at-pickup')).toBe(false);
      expect(isValidTransition('picking-up', 'at-destination')).toBe(false);
    });

    it('should validate valid transitions from to-destination', () => {
      expect(isValidTransition('to-destination', 'at-destination')).toBe(true);
      expect(isValidTransition('to-destination', 'completed')).toBe(true);
      expect(isValidTransition('to-destination', 'picking-up')).toBe(false);
      expect(isValidTransition('to-destination', 'to-pickup')).toBe(false);
    });

    it('should validate valid transitions from at-destination', () => {
      expect(isValidTransition('at-destination', 'completed')).toBe(true);
      expect(isValidTransition('at-destination', 'to-destination')).toBe(false);
      expect(isValidTransition('at-destination', 'picking-up')).toBe(false);
    });

    it('should validate completed as terminal phase', () => {
      expect(isValidTransition('completed', 'to-pickup')).toBe(false);
      expect(isValidTransition('completed', 'at-pickup')).toBe(false);
      expect(isValidTransition('completed', 'picking-up')).toBe(false);
      expect(isValidTransition('completed', 'to-destination')).toBe(false);
      expect(isValidTransition('completed', 'at-destination')).toBe(false);
    });
  });

  describe('Transition Configuration', () => {
    it('should get transition config for to-pickup -> at-pickup', () => {
      const config = getTransitionConfig('to-pickup', 'at-pickup');
      
      expect(config).toBeTruthy();
      expect(config?.from).toBe('to-pickup');
      expect(config?.to).toBe('at-pickup');
      expect(config?.actions).toHaveLength(3);
      expect(config?.actions[0].type).toBe('UPDATE_CAMERA');
      expect(config?.actions[1].type).toBe('CLEAR_VOICE_GUIDANCE');
      expect(config?.actions[2].type).toBe('ANNOUNCE_INSTRUCTION');
    });

    it('should get transition config for picking-up -> to-destination', () => {
      const config = getTransitionConfig('picking-up', 'to-destination');
      
      expect(config).toBeTruthy();
      expect(config?.from).toBe('picking-up');
      expect(config?.to).toBe('to-destination');
      expect(config?.actions).toHaveLength(7);
      
      // Verify critical transition actions are present
      const actionTypes = config?.actions.map(a => a.type) || [];
      expect(actionTypes).toContain('CLEAR_ROUTE');
      expect(actionTypes).toContain('CALCULATE_ROUTE');
      expect(actionTypes).toContain('UPDATE_GEOFENCES');
      expect(actionTypes).toContain('RESTART_NAVIGATION');
    });

    it('should return null for invalid transition config', () => {
      const config = getTransitionConfig('to-pickup', 'to-destination');
      expect(config).toBeNull();
    });
  });

  describe('Context Validation', () => {
    it('should validate context with all required data', () => {
      const config = getTransitionConfig('picking-up', 'to-destination')!;
      const context = createTransitionContext('picking-up', 'to-destination', {
        driverLocation: mockDriverLocation,
        pickupLocation: mockPickupLocation,
        destinationLocation: mockDestinationLocation,
      });

      const validation = validateTransitionContext(config, context);
      expect(validation.valid).toBe(true);
    });

    it('should fail validation with missing driver location', () => {
      const config = getTransitionConfig('picking-up', 'to-destination')!;
      const context = createTransitionContext('picking-up', 'to-destination', {
        pickupLocation: mockPickupLocation,
        destinationLocation: mockDestinationLocation,
      });

      const validation = validateTransitionContext(config, context);
      expect(validation.valid).toBe(false);
      expect(validation.error).toContain('Custom validation failed');
    });

    it('should fail validation with mismatched phases', () => {
      const config = getTransitionConfig('picking-up', 'to-destination')!;
      const context = createTransitionContext('to-pickup', 'to-destination', {
        driverLocation: mockDriverLocation,
        pickupLocation: mockPickupLocation,
        destinationLocation: mockDestinationLocation,
      });

      const validation = validateTransitionContext(config, context);
      expect(validation.valid).toBe(false);
      expect(validation.error).toContain('Current phase to-pickup does not match expected picking-up');
    });
  });

  describe('Phase Utilities', () => {
    it('should return valid next phases for each phase', () => {
      expect(getValidNextPhases('to-pickup')).toEqual(['at-pickup', 'completed']);
      expect(getValidNextPhases('at-pickup')).toEqual(['picking-up', 'completed']);
      expect(getValidNextPhases('picking-up')).toEqual(['to-destination', 'completed']);
      expect(getValidNextPhases('to-destination')).toEqual(['at-destination', 'completed']);
      expect(getValidNextPhases('at-destination')).toEqual(['completed']);
      expect(getValidNextPhases('completed')).toEqual([]);
    });

    it('should identify terminal phases', () => {
      expect(isTerminalPhase('completed')).toBe(true);
      expect(isTerminalPhase('to-pickup')).toBe(false);
      expect(isTerminalPhase('at-pickup')).toBe(false);
      expect(isTerminalPhase('picking-up')).toBe(false);
      expect(isTerminalPhase('to-destination')).toBe(false);
      expect(isTerminalPhase('at-destination')).toBe(false);
    });

    it('should provide transition descriptions', () => {
      expect(getTransitionDescription('to-pickup', 'at-pickup')).toBe('Driver has arrived at pickup location');
      expect(getTransitionDescription('at-pickup', 'picking-up')).toBe('Passenger is getting into the vehicle');
      expect(getTransitionDescription('picking-up', 'to-destination')).toBe('Starting navigation to destination');
      expect(getTransitionDescription('to-destination', 'at-destination')).toBe('Driver has arrived at destination');
      expect(getTransitionDescription('at-destination', 'completed')).toBe('Trip has been completed');
    });

    it('should identify transitions requiring route recalculation', () => {
      expect(requiresRouteRecalculation('picking-up', 'to-destination')).toBe(true);
      expect(requiresRouteRecalculation('to-pickup', 'at-pickup')).toBe(false);
      expect(requiresRouteRecalculation('at-pickup', 'picking-up')).toBe(false);
      expect(requiresRouteRecalculation('to-destination', 'at-destination')).toBe(false);
      expect(requiresRouteRecalculation('at-destination', 'completed')).toBe(false);
    });

    it('should identify transitions requiring geofence updates', () => {
      expect(requiresGeofenceUpdate('picking-up', 'to-destination')).toBe(true);
      expect(requiresGeofenceUpdate('at-destination', 'completed')).toBe(true);
      expect(requiresGeofenceUpdate('to-pickup', 'at-pickup')).toBe(false);
      expect(requiresGeofenceUpdate('at-pickup', 'picking-up')).toBe(false);
      expect(requiresGeofenceUpdate('to-destination', 'at-destination')).toBe(false);
    });

    it('should provide transition durations', () => {
      expect(getTransitionDuration('to-pickup', 'at-pickup')).toBe(1000);
      expect(getTransitionDuration('at-pickup', 'picking-up')).toBe(2000);
      expect(getTransitionDuration('picking-up', 'to-destination')).toBe(8000);
      expect(getTransitionDuration('to-destination', 'at-destination')).toBe(1000);
      expect(getTransitionDuration('at-destination', 'completed')).toBe(3000);
      
      // Default duration for unknown transitions
      expect(getTransitionDuration('completed', 'to-pickup' as NavigationPhase)).toBe(5000);
    });
  });

  describe('Context Creation', () => {
    it('should create transition context with all parameters', () => {
      const context = createTransitionContext('to-pickup', 'at-pickup', {
        driverLocation: mockDriverLocation,
        pickupLocation: mockPickupLocation,
        destinationLocation: mockDestinationLocation,
        hasActiveRoute: true,
        isNavigationActive: true,
      });

      expect(context.currentPhase).toBe('to-pickup');
      expect(context.targetPhase).toBe('at-pickup');
      expect(context.driverLocation).toEqual(mockDriverLocation);
      expect(context.pickupLocation).toEqual(mockPickupLocation);
      expect(context.destinationLocation).toEqual(mockDestinationLocation);
      expect(context.hasActiveRoute).toBe(true);
      expect(context.isNavigationActive).toBe(true);
    });

    it('should create transition context with minimal parameters', () => {
      const context = createTransitionContext('to-pickup', 'at-pickup');

      expect(context.currentPhase).toBe('to-pickup');
      expect(context.targetPhase).toBe('at-pickup');
      expect(context.driverLocation).toBeUndefined();
      expect(context.pickupLocation).toBeUndefined();
      expect(context.destinationLocation).toBeUndefined();
      expect(context.hasActiveRoute).toBeUndefined();
      expect(context.isNavigationActive).toBeUndefined();
    });
  });

  describe('Action Priority Sorting', () => {
    it('should sort actions by priority in transition configs', () => {
      const config = getTransitionConfig('picking-up', 'to-destination')!;
      
      // Actions should be sorted by priority (lower numbers first)
      const priorities = config.actions.map(a => a.priority || 999);
      const sortedPriorities = [...priorities].sort((a, b) => a - b);
      
      expect(priorities).toEqual(sortedPriorities);
      
      // Verify specific action order for critical transition
      expect(config.actions[0].type).toBe('CLEAR_ROUTE'); // priority 1
      expect(config.actions[1].type).toBe('CLEAR_VOICE_GUIDANCE'); // priority 2
      expect(config.actions[2].type).toBe('UPDATE_GEOFENCES'); // priority 3
      expect(config.actions[3].type).toBe('CALCULATE_ROUTE'); // priority 4
      expect(config.actions[4].type).toBe('UPDATE_CAMERA'); // priority 5
      expect(config.actions[5].type).toBe('RESTART_NAVIGATION'); // priority 6
      expect(config.actions[6].type).toBe('ANNOUNCE_INSTRUCTION'); // priority 7
    });
  });

  describe('Rollback Configuration', () => {
    it('should have rollback actions for critical transitions', () => {
      const config = getTransitionConfig('picking-up', 'to-destination')!;
      
      expect(config.rollback).toBeTruthy();
      expect(config.rollback).toHaveLength(2);
      expect(config.rollback![0].type).toBe('UPDATE_GEOFENCES');
      expect(config.rollback![1].type).toBe('ANNOUNCE_INSTRUCTION');
    });

    it('should not have rollback actions for simple transitions', () => {
      const config = getTransitionConfig('to-pickup', 'at-pickup')!;
      expect(config.rollback).toBeUndefined();
    });
  });
});