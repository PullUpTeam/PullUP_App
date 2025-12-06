/**
 * Navigation Phase Transition Utilities
 * 
 * This module provides comprehensive utilities for managing navigation phase transitions
 * in the driver navigation system. It includes validation, action definitions, and
 * execution framework for smooth phase transitions.
 * 
 * Requirements addressed: 1.1, 1.4, 5.1, 5.4
 */

// Re-export all utilities from the main modules
export * from '../navigationPhaseTransitions';
export * from '../navigationTransitionExecutor';

// Export commonly used types for convenience
export type {
  NavigationPhase,
} from '@/hooks/navigation/types';

// Export utility functions for common use cases
export {
  isValidTransition,
  getTransitionConfig,
  validateTransitionContext,
  createTransitionContext,
  getValidNextPhases,
  isTerminalPhase,
  requiresRouteRecalculation,
  requiresGeofenceUpdate,
} from '../navigationPhaseTransitions';

export {
  NavigationTransitionExecutor,
  createDefaultTransitionExecutor,
  createMockActionExecutor,
} from '../navigationTransitionExecutor';