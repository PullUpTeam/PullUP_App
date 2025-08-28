import { NavigationPhase } from '@/hooks/navigation/types';

/**
 * Navigation Phase Transition Utilities
 * 
 * This module provides utilities for managing navigation phase transitions,
 * including validation, action definitions, and execution framework.
 * 
 * Requirements addressed: 1.1, 1.4, 5.1, 5.4
 */

// Transition action types
export type TransitionActionType = 
  | 'CLEAR_ROUTE' 
  | 'CALCULATE_ROUTE' 
  | 'UPDATE_GEOFENCES' 
  | 'UPDATE_CAMERA' 
  | 'RESTART_NAVIGATION'
  | 'CLEAR_VOICE_GUIDANCE'
  | 'ANNOUNCE_INSTRUCTION';

// Transition action interface
export interface TransitionAction {
  type: TransitionActionType;
  payload?: any;
  priority?: number; // Lower numbers execute first
}

// Phase transition configuration
export interface PhaseTransitionConfig {
  from: NavigationPhase;
  to: NavigationPhase;
  actions: TransitionAction[];
  validation?: (context: TransitionContext) => boolean;
  rollback?: TransitionAction[];
}

// Context provided during transitions
export interface TransitionContext {
  currentPhase: NavigationPhase;
  targetPhase: NavigationPhase;
  driverLocation?: { latitude: number; longitude: number };
  pickupLocation?: { latitude: number; longitude: number };
  destinationLocation?: { latitude: number; longitude: number };
  hasActiveRoute?: boolean;
  isNavigationActive?: boolean;
}

// Transition result
export interface TransitionResult {
  success: boolean;
  fromPhase: NavigationPhase;
  toPhase: NavigationPhase;
  executedActions: TransitionAction[];
  error?: string;
  rollbackRequired?: boolean;
}

// Valid phase transitions map
const VALID_TRANSITIONS: Record<NavigationPhase, NavigationPhase[]> = {
  'to-pickup': ['at-pickup', 'completed'], // Can go to at-pickup or directly to completed if cancelled
  'at-pickup': ['picking-up', 'completed'], // Can start picking up or complete if cancelled
  'picking-up': ['to-destination', 'completed'], // Can transition to destination or complete
  'to-destination': ['at-destination', 'completed'], // Can arrive at destination or complete
  'at-destination': ['completed'], // Can only complete from here
  'completed': [], // Terminal state - no transitions allowed
};

// Predefined transition configurations
const TRANSITION_CONFIGURATIONS: PhaseTransitionConfig[] = [
  // Transition from to-pickup to at-pickup
  {
    from: 'to-pickup',
    to: 'at-pickup',
    actions: [
      { type: 'UPDATE_CAMERA', payload: { mode: 'center_on_driver' }, priority: 1 },
      { type: 'CLEAR_VOICE_GUIDANCE', priority: 2 },
      { type: 'ANNOUNCE_INSTRUCTION', payload: { message: 'You have arrived at the pickup location' }, priority: 3 },
    ],
    validation: (context) => !!context.driverLocation && !!context.pickupLocation,
  },
  
  // Transition from at-pickup to picking-up
  {
    from: 'at-pickup',
    to: 'picking-up',
    actions: [
      { type: 'UPDATE_GEOFENCES', payload: { hidePickup: false, showDestination: false }, priority: 1 },
      { type: 'ANNOUNCE_INSTRUCTION', payload: { message: 'Passenger is getting in the vehicle' }, priority: 2 },
    ],
  },
  
  // Critical transition: picking-up to to-destination
  {
    from: 'picking-up',
    to: 'to-destination',
    actions: [
      { type: 'CLEAR_ROUTE', priority: 1 },
      { type: 'CLEAR_VOICE_GUIDANCE', priority: 2 },
      { type: 'UPDATE_GEOFENCES', payload: { hidePickup: true, showDestination: true }, priority: 3 },
      { type: 'CALCULATE_ROUTE', payload: { type: 'pickup_to_destination' }, priority: 4 },
      { type: 'UPDATE_CAMERA', payload: { mode: 'show_full_route' }, priority: 5 },
      { type: 'RESTART_NAVIGATION', priority: 6 },
      { type: 'ANNOUNCE_INSTRUCTION', payload: { message: 'Navigating to destination' }, priority: 7 },
    ],
    validation: (context) => !!context.driverLocation && !!context.destinationLocation,
    rollback: [
      { type: 'UPDATE_GEOFENCES', payload: { hidePickup: false, showDestination: false } },
      { type: 'ANNOUNCE_INSTRUCTION', payload: { message: 'Navigation transition failed, please try again' } },
    ],
  },
  
  // Transition from to-destination to at-destination
  {
    from: 'to-destination',
    to: 'at-destination',
    actions: [
      { type: 'UPDATE_CAMERA', payload: { mode: 'center_on_driver' }, priority: 1 },
      { type: 'CLEAR_VOICE_GUIDANCE', priority: 2 },
      { type: 'ANNOUNCE_INSTRUCTION', payload: { message: 'You have arrived at the destination' }, priority: 3 },
    ],
    validation: (context) => !!context.driverLocation && !!context.destinationLocation,
  },
  
  // Transition from at-destination to completed
  {
    from: 'at-destination',
    to: 'completed',
    actions: [
      { type: 'CLEAR_ROUTE', priority: 1 },
      { type: 'CLEAR_VOICE_GUIDANCE', priority: 2 },
      { type: 'UPDATE_GEOFENCES', payload: { hidePickup: true, showDestination: false }, priority: 3 },
      { type: 'UPDATE_CAMERA', payload: { mode: 'manual' }, priority: 4 },
      { type: 'ANNOUNCE_INSTRUCTION', payload: { message: 'Trip completed successfully' }, priority: 5 },
    ],
  },
];

/**
 * Validates if a phase transition is allowed
 */
export function isValidTransition(from: NavigationPhase, to: NavigationPhase): boolean {
  const allowedTransitions = VALID_TRANSITIONS[from];
  return allowedTransitions.includes(to);
}

/**
 * Gets the transition configuration for a specific phase change
 */
export function getTransitionConfig(from: NavigationPhase, to: NavigationPhase): PhaseTransitionConfig | null {
  return TRANSITION_CONFIGURATIONS.find(config => 
    config.from === from && config.to === to
  ) || null;
}

/**
 * Validates transition context before executing
 */
export function validateTransitionContext(
  config: PhaseTransitionConfig, 
  context: TransitionContext
): { valid: boolean; error?: string } {
  // Basic context validation first
  if (context.currentPhase !== config.from) {
    return { 
      valid: false, 
      error: `Current phase ${context.currentPhase} does not match expected ${config.from}` 
    };
  }

  if (context.targetPhase !== config.to) {
    return { 
      valid: false, 
      error: `Target phase ${context.targetPhase} does not match expected ${config.to}` 
    };
  }

  // Check if custom validation exists and run it
  if (config.validation) {
    try {
      const isValid = config.validation(context);
      if (!isValid) {
        return { 
          valid: false, 
          error: `Custom validation failed for transition ${config.from} -> ${config.to}` 
        };
      }
    } catch (error) {
      return { 
        valid: false, 
        error: `Validation error: ${error instanceof Error ? error.message : 'Unknown error'}` 
      };
    }
  }

  return { valid: true };
}

/**
 * Sorts transition actions by priority
 */
export function sortActionsByPriority(actions: TransitionAction[]): TransitionAction[] {
  return [...actions].sort((a, b) => (a.priority || 999) - (b.priority || 999));
}

/**
 * Creates a transition context from provided parameters
 */
export function createTransitionContext(
  currentPhase: NavigationPhase,
  targetPhase: NavigationPhase,
  options: {
    driverLocation?: { latitude: number; longitude: number };
    pickupLocation?: { latitude: number; longitude: number };
    destinationLocation?: { latitude: number; longitude: number };
    hasActiveRoute?: boolean;
    isNavigationActive?: boolean;
  } = {}
): TransitionContext {
  return {
    currentPhase,
    targetPhase,
    ...options,
  };
}

/**
 * Gets all valid next phases for a given current phase
 */
export function getValidNextPhases(currentPhase: NavigationPhase): NavigationPhase[] {
  return VALID_TRANSITIONS[currentPhase] || [];
}

/**
 * Checks if a phase is a terminal state (no further transitions possible)
 */
export function isTerminalPhase(phase: NavigationPhase): boolean {
  return VALID_TRANSITIONS[phase].length === 0;
}

/**
 * Gets a human-readable description of a transition
 */
export function getTransitionDescription(from: NavigationPhase, to: NavigationPhase): string {
  const descriptions: Record<string, string> = {
    'to-pickup->at-pickup': 'Driver has arrived at pickup location',
    'at-pickup->picking-up': 'Passenger is getting into the vehicle',
    'picking-up->to-destination': 'Starting navigation to destination',
    'to-destination->at-destination': 'Driver has arrived at destination',
    'at-destination->completed': 'Trip has been completed',
  };

  const key = `${from}->${to}`;
  return descriptions[key] || `Transitioning from ${from} to ${to}`;
}

/**
 * Creates a rollback action set for emergency recovery
 */
export function createEmergencyRollback(
  fromPhase: NavigationPhase, 
  toPhase: NavigationPhase
): TransitionAction[] {
  return [
    { type: 'CLEAR_VOICE_GUIDANCE', priority: 1 },
    { type: 'ANNOUNCE_INSTRUCTION', payload: { 
      message: `Navigation transition failed. Please manually handle the ${fromPhase} to ${toPhase} transition.` 
    }, priority: 2 },
  ];
}

/**
 * Utility to check if transition requires route recalculation
 */
export function requiresRouteRecalculation(from: NavigationPhase, to: NavigationPhase): boolean {
  // Only the pickup to destination transition requires route recalculation
  return from === 'picking-up' && to === 'to-destination';
}

/**
 * Utility to check if transition requires geofence updates
 */
export function requiresGeofenceUpdate(from: NavigationPhase, to: NavigationPhase): boolean {
  const transitionsRequiringGeofenceUpdate = [
    'picking-up->to-destination',
    'at-destination->completed',
  ];
  
  return transitionsRequiringGeofenceUpdate.includes(`${from}->${to}`);
}

/**
 * Gets the expected duration for a transition in milliseconds
 */
export function getTransitionDuration(from: NavigationPhase, to: NavigationPhase): number {
  const durations: Record<string, number> = {
    'to-pickup->at-pickup': 1000, // 1 second - simple state change
    'at-pickup->picking-up': 2000, // 2 seconds - passenger boarding
    'picking-up->to-destination': 8000, // 8 seconds - route calculation and setup
    'to-destination->at-destination': 1000, // 1 second - simple state change
    'at-destination->completed': 3000, // 3 seconds - cleanup and completion
  };

  const key = `${from}->${to}`;
  return durations[key] || 5000; // Default 5 seconds
}