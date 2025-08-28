// hooks/navigation/useCameraTransitionManager.ts - Hook for managing camera transitions during navigation
import { useCallback, useRef, useState } from 'react';
import { NavigationPhase } from './types';
import {
  CameraTransitionConfig,
  CameraTransitionResult,
  CameraTransitionManager,
  RouteOverviewConfig,
  calculateRouteBounds,
  validateCameraConfig,
  createPhaseTransitionConfig,
  CameraTransitionError,
  createTransitionError,
  createTransitionSuccess
} from '@/utils/cameraTransitionUtils';

export interface NavigationMapboxMapRef {
  centerOnDriver: () => void;
  recenterWithBearing: (bearing?: number) => void;
  flyTo: (coordinates: [number, number], zoom?: number, bearing?: number) => void;
  resetView: () => void;
  clearMapElements: (elementTypes?: ('geofences' | 'route' | 'markers')[]) => void;
  updateGeofenceVisibility: (geofenceId: string, visible: boolean) => void;
}

export interface CameraTransitionState {
  isTransitioning: boolean;
  currentTransition: string | null;
  lastTransitionTime: number;
  transitionQueue: CameraTransitionConfig[];
}

export interface UseCameraTransitionManagerProps {
  mapRef: React.RefObject<NavigationMapboxMapRef>;
  isMapReady: boolean;
  onTransitionStart?: (config: CameraTransitionConfig) => void;
  onTransitionComplete?: (result: CameraTransitionResult) => void;
  onTransitionError?: (error: string, config: CameraTransitionConfig) => void;
}

export const useCameraTransitionManager = ({
  mapRef,
  isMapReady,
  onTransitionStart,
  onTransitionComplete,
  onTransitionError
}: UseCameraTransitionManagerProps): CameraTransitionManager & CameraTransitionState => {
  const [isTransitioning, setIsTransitioning] = useState(false);
  const [currentTransition, setCurrentTransition] = useState<string | null>(null);
  const [lastTransitionTime, setLastTransitionTime] = useState(0);
  const [transitionQueue, setTransitionQueue] = useState<CameraTransitionConfig[]>([]);
  
  const transitionTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const isProcessingQueue = useRef(false);

  /**
   * Process queued camera transitions
   */
  const processTransitionQueue = useCallback(async () => {
    if (isProcessingQueue.current || transitionQueue.length === 0 || !isMapReady) {
      return;
    }

    isProcessingQueue.current = true;
    
    while (transitionQueue.length > 0) {
      const config = transitionQueue[0];
      setTransitionQueue(prev => prev.slice(1));
      
      try {
        await executeTransition(config);
        // Small delay between transitions
        await new Promise(resolve => setTimeout(resolve, 100));
      } catch (error) {
        console.warn('Queue transition failed:', error);
      }
    }
    
    isProcessingQueue.current = false;
  }, [transitionQueue, isMapReady]);

  /**
   * Execute a single camera transition
   */
  const executeTransition = useCallback(async (config: CameraTransitionConfig): Promise<CameraTransitionResult> => {
    if (!isMapReady || !mapRef.current) {
      return createTransitionError(CameraTransitionError.CAMERA_NOT_READY, 'Map or camera not ready');
    }

    if (!validateCameraConfig(config)) {
      return createTransitionError(CameraTransitionError.INVALID_CONFIG, 'Invalid camera configuration');
    }

    const startTime = Date.now();
    setIsTransitioning(true);
    setCurrentTransition(config.type);
    setLastTransitionTime(startTime);

    // Clear any existing timeout
    if (transitionTimeoutRef.current) {
      clearTimeout(transitionTimeoutRef.current);
    }

    try {
      onTransitionStart?.(config);

      // Set timeout for transition
      const timeoutPromise = new Promise<never>((_, reject) => {
        transitionTimeoutRef.current = setTimeout(() => {
          reject(new Error('Camera transition timeout'));
        }, (config.duration || 2000) + 1000); // Add 1s buffer
      });

      // Execute the appropriate transition
      const transitionPromise = executeTransitionByType(config);

      // Race between transition and timeout
      await Promise.race([transitionPromise, timeoutPromise]);

      const duration = Date.now() - startTime;
      const result = createTransitionSuccess(duration);
      
      onTransitionComplete?.(result);
      return result;

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown transition error';
      const result = createTransitionError(CameraTransitionError.ANIMATION_FAILED, errorMessage);
      
      onTransitionError?.(errorMessage, config);
      return result;

    } finally {
      setIsTransitioning(false);
      setCurrentTransition(null);
      
      if (transitionTimeoutRef.current) {
        clearTimeout(transitionTimeoutRef.current);
        transitionTimeoutRef.current = null;
      }
    }
  }, [isMapReady, mapRef, onTransitionStart, onTransitionComplete, onTransitionError]);

  /**
   * Execute transition based on type
   */
  const executeTransitionByType = useCallback(async (config: CameraTransitionConfig): Promise<void> => {
    if (!mapRef.current) {
      throw new Error('Map reference not available');
    }

    switch (config.type) {
      case 'SHOW_FULL_ROUTE':
      case 'ROUTE_OVERVIEW':
        if (!config.coordinates || config.coordinates.length < 2) {
          throw new Error('Route coordinates required for route overview');
        }
        
        const routeBounds = calculateRouteBounds(
          config.coordinates[0],
          config.coordinates[config.coordinates.length - 1],
          config.padding
        );
        
        mapRef.current.flyTo(
          routeBounds.centerCoordinate,
          config.zoom || routeBounds.zoom,
          config.bearing || 0
        );
        break;

      case 'CENTER_ON_DRIVER':
        if (!config.centerCoordinate) {
          throw new Error('Center coordinate required for driver centering');
        }
        
        mapRef.current.flyTo(
          config.centerCoordinate,
          config.zoom || 18,
          config.bearing || 0
        );
        break;

      case 'FOLLOW_NAVIGATION':
        if (!config.centerCoordinate) {
          throw new Error('Center coordinate required for follow navigation');
        }
        
        if (config.bearing !== undefined) {
          mapRef.current.recenterWithBearing(config.bearing);
        } else {
          mapRef.current.centerOnDriver();
        }
        break;

      default:
        throw new Error(`Unsupported transition type: ${config.type}`);
    }

    // Wait for animation duration
    if (config.duration) {
      await new Promise(resolve => setTimeout(resolve, config.duration));
    }
  }, [mapRef]);

  /**
   * Transition to route overview showing pickup and destination
   */
  const transitionToRouteOverview = useCallback(async (config: RouteOverviewConfig): Promise<CameraTransitionResult> => {
    const transitionConfig: CameraTransitionConfig = {
      type: 'ROUTE_OVERVIEW',
      coordinates: [config.pickupCoordinate, config.destinationCoordinate],
      padding: config.padding,
      duration: config.duration || 2000
    };

    return executeTransition(transitionConfig);
  }, [executeTransition]);

  /**
   * Transition to follow mode centered on driver
   */
  const transitionToFollowMode = useCallback(async (
    driverLocation: [number, number],
    bearing?: number
  ): Promise<CameraTransitionResult> => {
    const transitionConfig: CameraTransitionConfig = {
      type: 'FOLLOW_NAVIGATION',
      centerCoordinate: driverLocation,
      bearing,
      zoom: 18,
      pitch: 60,
      duration: 1000
    };

    return executeTransition(transitionConfig);
  }, [executeTransition]);

  /**
   * Transition camera based on navigation phase
   */
  const transitionToPhaseCamera = useCallback(async (
    phase: NavigationPhase,
    config: CameraTransitionConfig
  ): Promise<CameraTransitionResult> => {
    // Merge with phase-specific defaults
    const phaseConfig = createPhaseTransitionConfig(
      phase,
      config.coordinates?.[0],
      config.coordinates?.[1],
      config.centerCoordinate
    );

    const mergedConfig: CameraTransitionConfig = {
      ...phaseConfig,
      ...config
    };

    return executeTransition(mergedConfig);
  }, [executeTransition]);

  /**
   * Handle transition errors with retry logic
   */
  const handleTransitionError = useCallback(async (
    error: Error,
    config: CameraTransitionConfig
  ): Promise<CameraTransitionResult> => {
    console.warn('Camera transition error:', error.message, 'Config:', config);

    // Try a simplified fallback transition
    const fallbackConfig: CameraTransitionConfig = {
      type: 'CENTER_ON_DRIVER',
      centerCoordinate: config.centerCoordinate || [0, 0],
      zoom: 16,
      pitch: 45,
      duration: 1000
    };

    try {
      return await executeTransition(fallbackConfig);
    } catch (fallbackError) {
      return createTransitionError(
        CameraTransitionError.ANIMATION_FAILED,
        `Original error: ${error.message}, Fallback error: ${fallbackError instanceof Error ? fallbackError.message : 'Unknown'}`
      );
    }
  }, [executeTransition]);

  /**
   * Queue a camera transition for later execution
   */
  const queueTransition = useCallback((config: CameraTransitionConfig) => {
    setTransitionQueue(prev => [...prev, config]);
    
    // Process queue if not already processing
    if (!isProcessingQueue.current) {
      setTimeout(processTransitionQueue, 0);
    }
  }, [processTransitionQueue]);

  /**
   * Clear transition queue
   */
  const clearTransitionQueue = useCallback(() => {
    setTransitionQueue([]);
    isProcessingQueue.current = false;
  }, []);

  return {
    // State
    isTransitioning,
    currentTransition,
    lastTransitionTime,
    transitionQueue,
    
    // Methods
    transitionToRouteOverview,
    transitionToFollowMode,
    transitionToPhaseCamera,
    handleTransitionError,
    
    // Additional utilities
    queueTransition,
    clearTransitionQueue
  };
};