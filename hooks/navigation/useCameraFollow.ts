// hooks/navigation/useCameraFollow.ts
// Manages real-time camera following with adaptive zoom based on speed
import { useRef, useCallback, useState } from 'react';
import { DriverLocationData } from './useLocationTracking';

export interface CameraState {
    centerCoordinate: [number, number];
    heading: number;
    zoom: number;
    pitch: number;
    isFollowing: boolean;
}

export interface CameraFollowConfig {
    // Base zoom level for slow speeds
    baseZoom: number;
    // Minimum zoom when moving fast
    minZoom: number;
    // Base pitch angle
    basePitch: number;
    // Speed threshold (m/s) to start zooming out
    speedThresholdLow: number;
    // Speed threshold (m/s) for max zoom out
    speedThresholdHigh: number;
    // Animation duration in ms
    animationDuration: number;
    // Whether to rotate map with heading
    rotateWithHeading: boolean;
    // Look-ahead distance factor (0-1, higher = more look-ahead)
    lookAheadFactor: number;
}

const DEFAULT_CONFIG: CameraFollowConfig = {
    baseZoom: 18,
    minZoom: 15,
    basePitch: 60,
    speedThresholdLow: 5,   // ~18 km/h
    speedThresholdHigh: 25, // ~90 km/h
    animationDuration: 500,
    rotateWithHeading: true,
    lookAheadFactor: 0.15
};

interface UseCameraFollowReturn {
    cameraState: CameraState;
    updateCamera: (location: DriverLocationData) => CameraState;
    setFollowing: (following: boolean) => void;
    resetCamera: () => void;
    config: CameraFollowConfig;
    updateConfig: (newConfig: Partial<CameraFollowConfig>) => void;
}

/**
 * Hook for managing adaptive camera following during navigation.
 *
 * Features:
 * - Adaptive zoom based on vehicle speed
 * - Smooth heading rotation
 * - Look-ahead offset for better visibility
 * - Manual override detection
 */
export const useCameraFollow = (
    initialConfig: Partial<CameraFollowConfig> = {}
): UseCameraFollowReturn => {
    const config = useRef<CameraFollowConfig>({
        ...DEFAULT_CONFIG,
        ...initialConfig
    });

    const [cameraState, setCameraState] = useState<CameraState>({
        centerCoordinate: [0, 0],
        heading: 0,
        zoom: config.current.baseZoom,
        pitch: config.current.basePitch,
        isFollowing: true
    });

    const lastUpdateTime = useRef<number>(0);

    /**
     * Calculate adaptive zoom based on current speed
     */
    const calculateAdaptiveZoom = useCallback((speed: number): number => {
        const { baseZoom, minZoom, speedThresholdLow, speedThresholdHigh } = config.current;

        if (speed <= speedThresholdLow) {
            return baseZoom;
        }

        if (speed >= speedThresholdHigh) {
            return minZoom;
        }

        // Linear interpolation between thresholds
        const speedRange = speedThresholdHigh - speedThresholdLow;
        const zoomRange = baseZoom - minZoom;
        const speedRatio = (speed - speedThresholdLow) / speedRange;

        return baseZoom - (zoomRange * speedRatio);
    }, []);

    /**
     * Calculate look-ahead offset to show more of the road ahead
     */
    const calculateLookAhead = useCallback((
        lat: number,
        lng: number,
        heading: number,
        speed: number
    ): [number, number] => {
        const { lookAheadFactor } = config.current;

        // No look-ahead when stationary or very slow
        if (speed < 2) {
            return [lng, lat];
        }

        // Calculate offset based on heading and speed
        // More offset at higher speeds
        const offsetDistance = lookAheadFactor * Math.min(speed / 10, 1);

        // Convert heading to radians (heading is from north, we need standard math angles)
        const headingRad = ((90 - heading) * Math.PI) / 180;

        // Approximate degrees per meter at this latitude
        const metersPerDegreeLat = 111320;
        const metersPerDegreeLng = 111320 * Math.cos((lat * Math.PI) / 180);

        // Offset in degrees (roughly 50-100 meters ahead at high speed)
        const offsetMeters = offsetDistance * 80;
        const latOffset = (offsetMeters * Math.sin(headingRad)) / metersPerDegreeLat;
        const lngOffset = (offsetMeters * Math.cos(headingRad)) / metersPerDegreeLng;

        return [lng + lngOffset, lat + latOffset];
    }, []);

    /**
     * Update camera state based on new location data
     */
    const updateCamera = useCallback((location: DriverLocationData): CameraState => {
        if (!cameraState.isFollowing) {
            return cameraState;
        }

        const now = Date.now();
        const { animationDuration, rotateWithHeading, basePitch } = config.current;

        // Calculate adaptive zoom
        const adaptiveZoom = calculateAdaptiveZoom(location.speed);

        // Calculate look-ahead position
        const [centerLng, centerLat] = calculateLookAhead(
            location.latitude,
            location.longitude,
            location.heading,
            location.speed
        );

        const newState: CameraState = {
            centerCoordinate: [centerLng, centerLat],
            heading: rotateWithHeading ? location.heading : 0,
            zoom: adaptiveZoom,
            pitch: basePitch,
            isFollowing: true
        };

        setCameraState(newState);
        lastUpdateTime.current = now;

        return newState;
    }, [cameraState.isFollowing, calculateAdaptiveZoom, calculateLookAhead]);

    /**
     * Enable/disable camera following
     */
    const setFollowing = useCallback((following: boolean) => {
        setCameraState(prev => ({
            ...prev,
            isFollowing: following
        }));
    }, []);

    /**
     * Reset camera to default state
     */
    const resetCamera = useCallback(() => {
        setCameraState({
            centerCoordinate: [0, 0],
            heading: 0,
            zoom: config.current.baseZoom,
            pitch: config.current.basePitch,
            isFollowing: true
        });
    }, []);

    /**
     * Update configuration
     */
    const updateConfig = useCallback((newConfig: Partial<CameraFollowConfig>) => {
        config.current = {
            ...config.current,
            ...newConfig
        };
    }, []);

    return {
        cameraState,
        updateCamera,
        setFollowing,
        resetCamera,
        config: config.current,
        updateConfig
    };
};

export default useCameraFollow;
