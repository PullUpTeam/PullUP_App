// hooks/useOSRMNavigation.ts - Fixed with enabled prop support
import { useState, useEffect, useRef, useCallback } from 'react';
import {
    OSRMNavigationService,
    NavigationCoordinates,
    NavigationRoute,
    NavigationProgress,
    NavigationInstruction
} from '@/hooks/OSRMNavigationService';
import * as Location from 'expo-location';

interface UseOSRMNavigationProps {
    origin: NavigationCoordinates;
    destination: NavigationCoordinates;
    enabled?: boolean; // Add this optional prop to control when navigation can start
    onDestinationReached?: (data: { location: Location.LocationObject }) => void;
    onNavigationError?: (error: Error) => void;
    onNewInstruction?: (instruction: NavigationInstruction) => void;
}

interface MapboxCameraConfig {
    centerCoordinate: [number, number];
    zoomLevel: number;
    pitch: number;
    heading: number;
    animationDuration?: number;
}

export interface UseOSRMNavigationReturn {
    // State
    isNavigating: boolean;
    isLoading: boolean;
    route: NavigationRoute | null;
    currentPosition: Location.LocationObjectCoords | null;
    currentHeading: number;
    progress: NavigationProgress | null;
    currentInstruction: NavigationInstruction | null;
    nextInstruction: NavigationInstruction | null;
    error: Error | null;
    retryCount: number;
    isTransitioning: boolean;

    // Actions
    startNavigation: () => Promise<void>;
    stopNavigation: () => void;
    retryNavigation: () => Promise<void>;
    
    // Phase transition methods
    clearRoute: () => void;
    restartNavigation: (newOrigin: NavigationCoordinates, newDestination: NavigationCoordinates) => Promise<void>;
    calculateRouteOnly: (origin: NavigationCoordinates, destination: NavigationCoordinates) => Promise<NavigationRoute>;

    // Utilities for Mapbox
    getMapboxCameraConfig: () => MapboxCameraConfig | null;
    getRouteGeoJSON: () => GeoJSON.Feature | null;
    formatDistance: (meters: number) => string;
    formatDuration: (seconds: number) => string;
    getManeuverIcon: (type: string, modifier?: string) => string;

    // Raw navigation service (for advanced usage)
    navigationService: OSRMNavigationService;
}

export const useOSRMNavigation = ({
                                      origin,
                                      destination,
                                      enabled = true, // Default to true for backward compatibility
                                      onDestinationReached,
                                      onNavigationError,
                                      onNewInstruction,
                                  }: UseOSRMNavigationProps): UseOSRMNavigationReturn => {
    // Navigation service instance
    const navigationService = useRef(new OSRMNavigationService()).current;

    // State with proper typing
    const [isNavigating, setIsNavigating] = useState<boolean>(false);
    const [isLoading, setIsLoading] = useState<boolean>(false);
    const [route, setRoute] = useState<NavigationRoute | null>(null);
    const [currentPosition, setCurrentPosition] = useState<Location.LocationObjectCoords | null>(null);
    const [currentHeading, setCurrentHeading] = useState<number>(0);
    const [progress, setProgress] = useState<NavigationProgress | null>(null);
    const [currentInstruction, setCurrentInstruction] = useState<NavigationInstruction | null>(null);
    const [nextInstruction, setNextInstruction] = useState<NavigationInstruction | null>(null);
    const [error, setError] = useState<Error | null>(null);
    const [retryCount, setRetryCount] = useState<number>(0);
    const [isTransitioning, setIsTransitioning] = useState<boolean>(false);

    // Prevent multiple simultaneous navigation attempts
    const isStartingRef = useRef<boolean>(false);
    const transitionTimeoutRef = useRef<NodeJS.Timeout | null>(null);

    // Set up navigation service listeners
    useEffect(() => {
        const handleNavigationStarted = ({ route: routeData, instructions }: { route: NavigationRoute; instructions: NavigationInstruction[] }) => {
            console.log('📍 Navigation started successfully');
            setRoute(routeData);
            setIsNavigating(true);
            setIsLoading(false);
            setError(null);
            setRetryCount(0);
            setCurrentInstruction(instructions[0] || null);
            setNextInstruction(instructions[1] || null);
            isStartingRef.current = false;
        };

        const handleProgressUpdate = (progressData: NavigationProgress) => {
            setProgress(progressData);
            setCurrentPosition(progressData.location);
            setCurrentHeading(progressData.heading);
            setCurrentInstruction(progressData.currentInstruction || null);
            setNextInstruction(progressData.nextInstruction || null);
        };

        const handleNewInstruction = (instruction: NavigationInstruction) => {
            console.log('🗣️ New instruction:', instruction.voiceInstruction);
            onNewInstruction?.(instruction);
        };

        const handleDestinationReached = (data: { location: Location.LocationObject }) => {
            console.log('🎯 Destination reached');
            setIsNavigating(false);
            isStartingRef.current = false;
            onDestinationReached?.(data);
        };

        const handleNavigationError = (error: Error) => {
            console.error('❌ Navigation error:', error);
            setError(error);
            setIsLoading(false);
            setIsNavigating(false);
            isStartingRef.current = false;
            setRetryCount(prev => prev + 1);
            onNavigationError?.(error);
        };

        const handleNavigationStopped = () => {
            console.log('🛑 Navigation stopped');
            setIsNavigating(false);
            setIsLoading(false);
            setRoute(null);
            setCurrentPosition(null);
            setCurrentHeading(0);
            setProgress(null);
            setCurrentInstruction(null);
            setNextInstruction(null);
            isStartingRef.current = false;
        };

        // Register listeners
        navigationService.on('navigationStarted', handleNavigationStarted);
        navigationService.on('progressUpdate', handleProgressUpdate);
        navigationService.on('newInstruction', handleNewInstruction);
        navigationService.on('destinationReached', handleDestinationReached);
        navigationService.on('navigationError', handleNavigationError);
        navigationService.on('navigationStopped', handleNavigationStopped);

        // Cleanup listeners on unmount
        return () => {
            navigationService.off('navigationStarted', handleNavigationStarted);
            navigationService.off('progressUpdate', handleProgressUpdate);
            navigationService.off('newInstruction', handleNewInstruction);
            navigationService.off('destinationReached', handleDestinationReached);
            navigationService.off('navigationError', handleNavigationError);
            navigationService.off('navigationStopped', handleNavigationStopped);

            // Clear any pending transition timeouts
            if (transitionTimeoutRef.current) {
                clearTimeout(transitionTimeoutRef.current);
                transitionTimeoutRef.current = null;
            }

            // Stop navigation
            navigationService.stopNavigation();
            isStartingRef.current = false;
            setIsTransitioning(false);
        };
    }, [onDestinationReached, onNavigationError, onNewInstruction]);

    // Start navigation with retry logic (enhanced for phase transitions)
    const startNavigation = useCallback(async (): Promise<void> => {
        // Check if navigation is enabled
        if (!enabled) {
            console.log('Navigation is disabled');
            return;
        }

        if (!origin || !destination) {
            const error = new Error('Origin and destination are required');
            setError(error);
            return;
        }

        if (isStartingRef.current || isLoading) {
            console.log('Navigation already starting, skipping...');
            return;
        }

        isStartingRef.current = true;
        setIsLoading(true);
        setError(null);

        console.log('🚀 Starting navigation from', origin, 'to', destination);

        try {
            await navigationService.startNavigation(origin, destination);
        } catch (err) {
            const error = err instanceof Error ? err : new Error('Failed to start navigation');
            
            // Enhanced error handling for phase transitions
            if (error.message.includes('network') || error.message.includes('timeout')) {
                console.warn('⚠️ Network error during navigation start, will retry automatically');
            } else if (error.message.includes('GPS') || error.message.includes('location')) {
                console.warn('⚠️ GPS error during navigation start, check location permissions');
            } else {
                console.error('❌ Unexpected error during navigation start:', error);
            }
            
            setError(error);
            setIsLoading(false);
            isStartingRef.current = false;
            setIsTransitioning(false);
        }
    }, [origin, destination, navigationService, isLoading, enabled]);

    // Retry navigation with exponential backoff (enhanced for phase transitions)
    const retryNavigation = useCallback(async (): Promise<void> => {
        if (retryCount >= 3) {
            const maxRetryError = new Error('Maximum retry attempts reached. Please check your internet connection and GPS signal.');
            setError(maxRetryError);
            setIsTransitioning(false);
            return;
        }

        console.log(`🔄 Retrying navigation (attempt ${retryCount + 1})`);

        // Clear any existing errors
        setError(null);

        // Exponential backoff delay with jitter for phase transitions
        const baseDelay = Math.min(1000 * Math.pow(2, retryCount), 10000);
        const jitter = Math.random() * 1000; // Add up to 1 second of jitter
        const delay = baseDelay + jitter;
        
        await new Promise(resolve => {
            transitionTimeoutRef.current = setTimeout(resolve, delay);
        });

        try {
            await startNavigation();
        } catch (err) {
            console.error(`❌ Retry attempt ${retryCount + 1} failed:`, err);
            // Error will be handled by the startNavigation method
        }
    }, [retryCount, startNavigation]);

    // Stop navigation
    const stopNavigation = useCallback((): void => {
        console.log('🛑 Stopping navigation manually');
        isStartingRef.current = false;
        setIsTransitioning(false);
        
        // Clear any pending transition timeouts
        if (transitionTimeoutRef.current) {
            clearTimeout(transitionTimeoutRef.current);
            transitionTimeoutRef.current = null;
        }
        
        navigationService.stopNavigation();
    }, [navigationService]);

    // Clear route and reset navigation state (for phase transitions)
    const clearRoute = useCallback((): void => {
        console.log('🧹 Clearing route for phase transition');
        
        // Stop current navigation
        navigationService.stopNavigation();
        
        // Reset state
        setRoute(null);
        setCurrentPosition(null);
        setCurrentHeading(0);
        setProgress(null);
        setCurrentInstruction(null);
        setNextInstruction(null);
        setError(null);
        setIsNavigating(false);
        setIsLoading(false);
        isStartingRef.current = false;
        
        // Clear any pending transition timeouts
        if (transitionTimeoutRef.current) {
            clearTimeout(transitionTimeoutRef.current);
            transitionTimeoutRef.current = null;
        }
    }, [navigationService]);

    // Calculate route without starting navigation (for phase transitions)
    const calculateRouteOnly = useCallback(async (
        routeOrigin: NavigationCoordinates, 
        routeDestination: NavigationCoordinates
    ): Promise<NavigationRoute> => {
        console.log('📍 Calculating route for phase transition from', routeOrigin, 'to', routeDestination);
        
        if (!routeOrigin || !routeDestination) {
            throw new Error('Origin and destination are required for route calculation');
        }

        setIsLoading(true);
        setError(null);

        try {
            const calculatedRoute = await navigationService.calculateRoute(routeOrigin, routeDestination);
            console.log('✅ Route calculated successfully for phase transition');
            return calculatedRoute;
        } catch (err) {
            const error = err instanceof Error ? err : new Error('Failed to calculate route for phase transition');
            console.error('❌ Route calculation failed during phase transition:', error);
            setError(error);
            throw error;
        } finally {
            setIsLoading(false);
        }
    }, [navigationService]);

    // Restart navigation with new coordinates (for phase transitions)
    const restartNavigation = useCallback(async (
        newOrigin: NavigationCoordinates, 
        newDestination: NavigationCoordinates
    ): Promise<void> => {
        console.log('🔄 Restarting navigation for phase transition');
        
        if (!enabled) {
            console.log('Navigation is disabled, cannot restart');
            return;
        }

        if (!newOrigin || !newDestination) {
            const error = new Error('Origin and destination are required for navigation restart');
            setError(error);
            throw error;
        }

        if (isStartingRef.current || isTransitioning) {
            console.log('Navigation restart already in progress, skipping...');
            return;
        }

        setIsTransitioning(true);
        
        try {
            // Clear current navigation state
            clearRoute();
            
            // Add a small delay to ensure cleanup is complete
            await new Promise(resolve => {
                transitionTimeoutRef.current = setTimeout(resolve, 100);
            });
            
            // Start navigation with new coordinates
            isStartingRef.current = true;
            setIsLoading(true);
            setError(null);
            
            console.log('🚀 Starting navigation with new route from', newOrigin, 'to', newDestination);
            
            // Add timeout to prevent hanging
            const navigationPromise = navigationService.startNavigation(newOrigin, newDestination);
            const timeoutPromise = new Promise<never>((_, reject) => {
                setTimeout(() => {
                    console.log('⏰ Navigation service timeout reached');
                    reject(new Error('Navigation service timeout'));
                }, 10000); // 10 second timeout
            });
            
            await Promise.race([navigationPromise, timeoutPromise]);
            
        } catch (err) {
            const error = err instanceof Error ? err : new Error('Failed to restart navigation during phase transition');
            console.error('❌ Navigation restart failed:', error);
            setError(error);
            setIsLoading(false);
            isStartingRef.current = false;
            throw error;
        } finally {
            console.log('🧹 Cleaning up navigation restart state');
            setIsTransitioning(false);
            isStartingRef.current = false;
            if (transitionTimeoutRef.current) {
                clearTimeout(transitionTimeoutRef.current);
                transitionTimeoutRef.current = null;
            }
        }
    }, [enabled, navigationService, clearRoute]);

    // Mapbox-specific camera configuration
    const getMapboxCameraConfig = useCallback((): MapboxCameraConfig | null => {
        if (!currentPosition) return null;

        return {
            centerCoordinate: [currentPosition.longitude, currentPosition.latitude],
            zoomLevel: 18, // Close zoom for navigation
            pitch: 60, // 3D perspective
            heading: currentHeading, // Rotate based on driver direction
            animationDuration: 1000,
        };
    }, [currentPosition, currentHeading]);

    // Convert route to GeoJSON for Mapbox
    const getRouteGeoJSON = useCallback((): GeoJSON.Feature | null => {
        if (!route) return null;

        return {
            type: 'Feature',
            properties: {},
            geometry: {
                type: 'LineString',
                coordinates: route.coordinates.map(coord => [coord.longitude, coord.latitude])
            }
        };
    }, [route]);

    // Utility functions
    const formatDistance = useCallback((meters: number): string => {
        if (meters >= 1000) {
            return `${(meters / 1000).toFixed(1)} km`;
        }
        return `${Math.round(meters)} m`;
    }, []);

    const formatDuration = useCallback((seconds: number): string => {
        const hours = Math.floor(seconds / 3600);
        const minutes = Math.floor((seconds % 3600) / 60);

        if (hours > 0) {
            return `${hours}h ${minutes}m`;
        }
        return `${minutes}m`;
    }, []);

    const getManeuverIcon = useCallback((type: string, modifier?: string): string => {
        const getIconForType = (maneuverType: string, maneuverModifier?: string): string => {
            switch (maneuverType) {
                case 'turn':
                    switch (maneuverModifier) {
                        case 'left': return 'arrow-back';
                        case 'right': return 'arrow-forward';
                        case 'slight left': return 'trending-up';
                        case 'slight right': return 'trending-up';
                        case 'sharp left': return 'arrow-back';
                        case 'sharp right': return 'arrow-forward';
                        default: return 'arrow-forward';
                    }
                case 'depart': return 'play';
                case 'arrive': return 'flag';
                case 'roundabout': return 'refresh';
                case 'exit roundabout': return 'exit-outline';
                case 'merge': return 'git-merge-outline';
                case 'ramp': return 'trending-up';
                case 'continue': return 'arrow-up';
                case 'new name': return 'arrow-up';
                default: return 'arrow-up';
            }
        };

        return getIconForType(type, modifier);
    }, []);

    return {
        // State
        isNavigating,
        isLoading,
        route,
        currentPosition,
        currentHeading,
        progress,
        currentInstruction,
        nextInstruction,
        error,
        retryCount,
        isTransitioning,

        // Actions
        startNavigation,
        stopNavigation,
        retryNavigation,
        
        // Phase transition methods
        clearRoute,
        restartNavigation,
        calculateRouteOnly,

        // Utilities
        getMapboxCameraConfig,
        getRouteGeoJSON,
        formatDistance,
        formatDuration,
        getManeuverIcon,

        // Raw navigation service (for advanced usage)
        navigationService,
    };
};