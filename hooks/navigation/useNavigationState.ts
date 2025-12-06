// hooks/navigation/useNavigationState.ts
// Consolidated navigation state management using reducer pattern
import { useReducer, useCallback, useMemo } from 'react';
import { NavigationPhase } from './types';

// State interface
interface NavigationState {
    phase: NavigationPhase;
    isPhaseTransitioning: boolean;
    isRouteTransitioning: boolean;
    isMuted: boolean;
    isInPickupGeofence: boolean;
    isInDestinationGeofence: boolean;
    enableOnchainAttestations: boolean;
    error: string | null;
}

// Action types
type NavigationAction =
    | { type: 'SET_PHASE'; payload: NavigationPhase }
    | { type: 'START_PHASE_TRANSITION' }
    | { type: 'END_PHASE_TRANSITION' }
    | { type: 'START_ROUTE_TRANSITION' }
    | { type: 'END_ROUTE_TRANSITION' }
    | { type: 'TOGGLE_MUTE' }
    | { type: 'SET_MUTED'; payload: boolean }
    | { type: 'ENTER_PICKUP_GEOFENCE' }
    | { type: 'EXIT_PICKUP_GEOFENCE' }
    | { type: 'ENTER_DESTINATION_GEOFENCE' }
    | { type: 'EXIT_DESTINATION_GEOFENCE' }
    | { type: 'TOGGLE_ONCHAIN_ATTESTATIONS' }
    | { type: 'SET_ONCHAIN_ATTESTATIONS'; payload: boolean }
    | { type: 'SET_ERROR'; payload: string | null }
    | { type: 'RESET' };

// Initial state factory
const createInitialState = (initialPhase: NavigationPhase = 'to-pickup'): NavigationState => ({
    phase: initialPhase,
    isPhaseTransitioning: false,
    isRouteTransitioning: false,
    isMuted: false,
    isInPickupGeofence: false,
    isInDestinationGeofence: false,
    enableOnchainAttestations: false,
    error: null,
});

// Valid phase transitions
const VALID_TRANSITIONS: Record<NavigationPhase, NavigationPhase[]> = {
    'to-pickup': ['at-pickup'],
    'at-pickup': ['to-destination', 'picking-up'],
    'picking-up': ['to-destination'],
    'to-destination': ['at-destination'],
    'at-destination': ['completed'],
    'completed': [],
};

function isValidTransition(from: NavigationPhase, to: NavigationPhase): boolean {
    return VALID_TRANSITIONS[from]?.includes(to) ?? false;
}

// Reducer function
function navigationReducer(state: NavigationState, action: NavigationAction): NavigationState {
    switch (action.type) {
        case 'SET_PHASE':
            return {
                ...state,
                phase: action.payload,
                isPhaseTransitioning: false,
                error: null,
            };

        case 'START_PHASE_TRANSITION':
            return { ...state, isPhaseTransitioning: true };

        case 'END_PHASE_TRANSITION':
            return { ...state, isPhaseTransitioning: false };

        case 'START_ROUTE_TRANSITION':
            return { ...state, isRouteTransitioning: true };

        case 'END_ROUTE_TRANSITION':
            return { ...state, isRouteTransitioning: false };

        case 'TOGGLE_MUTE':
            return { ...state, isMuted: !state.isMuted };

        case 'SET_MUTED':
            return { ...state, isMuted: action.payload };

        case 'ENTER_PICKUP_GEOFENCE':
            return { ...state, isInPickupGeofence: true };

        case 'EXIT_PICKUP_GEOFENCE':
            return { ...state, isInPickupGeofence: false };

        case 'ENTER_DESTINATION_GEOFENCE':
            return { ...state, isInDestinationGeofence: true };

        case 'EXIT_DESTINATION_GEOFENCE':
            return { ...state, isInDestinationGeofence: false };

        case 'TOGGLE_ONCHAIN_ATTESTATIONS':
            return { ...state, enableOnchainAttestations: !state.enableOnchainAttestations };

        case 'SET_ONCHAIN_ATTESTATIONS':
            return { ...state, enableOnchainAttestations: action.payload };

        case 'SET_ERROR':
            return { ...state, error: action.payload };

        case 'RESET':
            return createInitialState();

        default:
            return state;
    }
}

// Hook return type (backwards compatible with old interface)
interface NavigationStateReturn {
    // State object
    state: NavigationState;
    // Legacy fields (for backwards compatibility)
    navigationPhase: NavigationPhase;
    isPhaseTransitioning: boolean;
    phaseTransitionError: string | null;
    transitionProgress: number;
    // Phase management
    transitionToPhase: (newPhase: NavigationPhase) => Promise<{
        success: boolean;
        fromPhase: NavigationPhase;
        toPhase: NavigationPhase;
        error?: string;
    }>;
    clearPhaseError: () => void;
    cleanupPhaseManager: () => void;
    // New consolidated state
    isRouteTransitioning: boolean;
    isMuted: boolean;
    isInPickupGeofence: boolean;
    isInDestinationGeofence: boolean;
    enableOnchainAttestations: boolean;
    // Actions
    toggleMute: () => void;
    setMuted: (muted: boolean) => void;
    enterPickupGeofence: () => void;
    exitPickupGeofence: () => void;
    enterDestinationGeofence: () => void;
    exitDestinationGeofence: () => void;
    toggleOnchainAttestations: () => void;
    setOnchainAttestations: (enabled: boolean) => void;
    startRouteTransition: () => void;
    endRouteTransition: () => void;
    setError: (error: string | null) => void;
    reset: () => void;
}

/**
 * Hook for managing navigation state using a reducer pattern.
 * Consolidates multiple useState calls into a single, predictable state object.
 * Maintains backwards compatibility with the old interface.
 */
export const useNavigationState = (initialPhase: NavigationPhase = 'to-pickup'): NavigationStateReturn => {
    const [state, dispatch] = useReducer(
        navigationReducer,
        initialPhase,
        createInitialState
    );

    // Phase transition with validation
    const transitionToPhase = useCallback(async (newPhase: NavigationPhase) => {
        const currentPhase = state.phase;

        // Check if transition is valid
        if (!isValidTransition(currentPhase, newPhase)) {
            const error = `Invalid phase transition: ${currentPhase} -> ${newPhase}`;
            console.warn(`⚠️ ${error}`);
            dispatch({ type: 'SET_ERROR', payload: error });
            return { success: false, error, fromPhase: currentPhase, toPhase: newPhase };
        }

        console.log(`🔄 Transitioning from ${currentPhase} to ${newPhase}`);
        dispatch({ type: 'START_PHASE_TRANSITION' });

        try {
            // Small delay for UI feedback
            await new Promise(resolve => setTimeout(resolve, 100));
            dispatch({ type: 'SET_PHASE', payload: newPhase });
            return { success: true, fromPhase: currentPhase, toPhase: newPhase };
        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : 'Unknown error';
            dispatch({ type: 'SET_ERROR', payload: errorMessage });
            dispatch({ type: 'END_PHASE_TRANSITION' });
            return { success: false, error: errorMessage, fromPhase: currentPhase, toPhase: newPhase };
        }
    }, [state.phase]);

    // Legacy methods
    const clearPhaseError = useCallback(() => {
        dispatch({ type: 'SET_ERROR', payload: null });
    }, []);

    const cleanupPhaseManager = useCallback(() => {
        console.log('🧹 Cleaning up phase manager');
        dispatch({ type: 'RESET' });
    }, []);

    // Memoized action creators
    const actions = useMemo(() => ({
        toggleMute: () => dispatch({ type: 'TOGGLE_MUTE' }),
        setMuted: (muted: boolean) => dispatch({ type: 'SET_MUTED', payload: muted }),
        enterPickupGeofence: () => dispatch({ type: 'ENTER_PICKUP_GEOFENCE' }),
        exitPickupGeofence: () => dispatch({ type: 'EXIT_PICKUP_GEOFENCE' }),
        enterDestinationGeofence: () => dispatch({ type: 'ENTER_DESTINATION_GEOFENCE' }),
        exitDestinationGeofence: () => dispatch({ type: 'EXIT_DESTINATION_GEOFENCE' }),
        toggleOnchainAttestations: () => dispatch({ type: 'TOGGLE_ONCHAIN_ATTESTATIONS' }),
        setOnchainAttestations: (enabled: boolean) => dispatch({ type: 'SET_ONCHAIN_ATTESTATIONS', payload: enabled }),
        startRouteTransition: () => dispatch({ type: 'START_ROUTE_TRANSITION' }),
        endRouteTransition: () => dispatch({ type: 'END_ROUTE_TRANSITION' }),
        setError: (error: string | null) => dispatch({ type: 'SET_ERROR', payload: error }),
        reset: () => dispatch({ type: 'RESET' }),
    }), []);

    return {
        // State object
        state,
        // Legacy fields (for backwards compatibility)
        navigationPhase: state.phase,
        isPhaseTransitioning: state.isPhaseTransitioning,
        phaseTransitionError: state.error,
        transitionProgress: 0, // Deprecated, kept for compatibility
        transitionToPhase,
        clearPhaseError,
        cleanupPhaseManager,
        // New consolidated state
        isRouteTransitioning: state.isRouteTransitioning,
        isMuted: state.isMuted,
        isInPickupGeofence: state.isInPickupGeofence,
        isInDestinationGeofence: state.isInDestinationGeofence,
        enableOnchainAttestations: state.enableOnchainAttestations,
        // Actions
        ...actions,
    };
};

// Export types for consumers
export type { NavigationState, NavigationAction };