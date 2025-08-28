// hooks/useNavigationState.ts
import { useState, useCallback } from 'react';
import { NavigationPhase } from '@/hooks/navigation/types';

interface NavigationStateReturn {
    navigationPhase: NavigationPhase;
    isPhaseTransitioning: boolean;
    phaseTransitionError: string | null;
    transitionProgress: number;
    transitionToPhase: (newPhase: NavigationPhase) => Promise<{
        success: boolean;
        fromPhase: NavigationPhase;
        toPhase: NavigationPhase;
        error?: string;
    }>;
    clearPhaseError: () => void;
    cleanupPhaseManager: () => void;
}

export const useNavigationState = (initialPhase: NavigationPhase = 'to-pickup'): NavigationStateReturn => {
    const [navigationPhase, setNavigationPhase] = useState<NavigationPhase>(initialPhase);
    const [isPhaseTransitioning, setIsPhaseTransitioning] = useState(false);
    const [phaseTransitionError, setPhaseTransitionError] = useState<string | null>(null);
    const [transitionProgress, setTransitionProgress] = useState(0);

    const transitionToPhase = useCallback(async (newPhase: NavigationPhase) => {
        console.log(`🔄 Transitioning from ${navigationPhase} to ${newPhase}`);
        setIsPhaseTransitioning(true);
        setPhaseTransitionError(null);

        try {
            // Add a small delay to simulate transition
            await new Promise(resolve => setTimeout(resolve, 100));
            setNavigationPhase(newPhase);
            setIsPhaseTransitioning(false);
            return { success: true, fromPhase: navigationPhase, toPhase: newPhase };
        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : 'Unknown error';
            setPhaseTransitionError(errorMessage);
            setIsPhaseTransitioning(false);
            return { success: false, error: errorMessage, fromPhase: navigationPhase, toPhase: newPhase };
        }
    }, [navigationPhase]);

    const clearPhaseError = useCallback(() => {
        setPhaseTransitionError(null);
    }, []);

    const cleanupPhaseManager = useCallback(() => {
        console.log('🧹 Cleaning up phase manager');
    }, []);

    return {
        navigationPhase,
        isPhaseTransitioning,
        phaseTransitionError,
        transitionProgress,
        transitionToPhase,
        clearPhaseError,
        cleanupPhaseManager
    };
};