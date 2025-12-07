// hooks/navigation/useSmoothedHeading.ts
// Smoothes GPS heading to reduce jitter and provide natural camera rotation
import { useRef, useCallback } from 'react';

interface HeadingBuffer {
    heading: number;
    timestamp: number;
    weight: number;
}

interface SmoothedHeadingReturn {
    smoothedHeading: number;
    addHeading: (heading: number) => number;
    reset: () => void;
}

interface UseSmoothedHeadingOptions {
    // Number of samples to keep in buffer for averaging
    bufferSize?: number;
    // Minimum heading change (degrees) to trigger an update
    minDelta?: number;
    // Maximum age of samples in ms before they're discarded
    maxSampleAge?: number;
    // Weight decay factor for older samples (0-1, higher = more weight on recent)
    decayFactor?: number;
}

/**
 * Normalizes an angle to be between 0 and 360
 */
const normalizeAngle = (angle: number): number => {
    while (angle < 0) angle += 360;
    while (angle >= 360) angle -= 360;
    return angle;
};

/**
 * Calculates the shortest angular distance between two angles
 */
const angularDistance = (from: number, to: number): number => {
    const diff = normalizeAngle(to - from);
    return diff > 180 ? diff - 360 : diff;
};

/**
 * Hook for smoothing GPS heading data to reduce jitter and provide
 * more natural camera rotation during navigation.
 *
 * Uses a weighted moving average with time-based decay to prioritize
 * recent readings while still smoothing out GPS noise.
 */
export const useSmoothedHeading = (options: UseSmoothedHeadingOptions = {}): SmoothedHeadingReturn => {
    const {
        bufferSize = 5,
        minDelta = 3,
        maxSampleAge = 2000,
        decayFactor = 0.7
    } = options;

    const buffer = useRef<HeadingBuffer[]>([]);
    const lastSmoothedHeading = useRef<number>(0);
    const lastOutputHeading = useRef<number>(0);

    /**
     * Cleans old samples from the buffer
     */
    const cleanBuffer = useCallback(() => {
        const now = Date.now();
        buffer.current = buffer.current.filter(
            sample => now - sample.timestamp < maxSampleAge
        );
    }, [maxSampleAge]);

    /**
     * Calculates weighted average of headings in buffer
     */
    const calculateWeightedAverage = useCallback((): number => {
        if (buffer.current.length === 0) {
            return lastSmoothedHeading.current;
        }

        const now = Date.now();
        let totalWeight = 0;
        let weightedSinSum = 0;
        let weightedCosSum = 0;

        // Calculate weights based on age and apply decay
        buffer.current.forEach((sample, index) => {
            const age = now - sample.timestamp;
            const ageWeight = Math.max(0, 1 - age / maxSampleAge);
            const positionWeight = Math.pow(decayFactor, buffer.current.length - 1 - index);
            const weight = ageWeight * positionWeight;

            // Convert to radians for circular mean calculation
            const radians = (sample.heading * Math.PI) / 180;
            weightedSinSum += Math.sin(radians) * weight;
            weightedCosSum += Math.cos(radians) * weight;
            totalWeight += weight;
        });

        if (totalWeight === 0) {
            return lastSmoothedHeading.current;
        }

        // Calculate circular mean
        const avgRadians = Math.atan2(
            weightedSinSum / totalWeight,
            weightedCosSum / totalWeight
        );

        return normalizeAngle((avgRadians * 180) / Math.PI);
    }, [maxSampleAge, decayFactor]);

    /**
     * Adds a new heading sample and returns the smoothed heading
     */
    const addHeading = useCallback((heading: number): number => {
        const normalizedHeading = normalizeAngle(heading);
        const now = Date.now();

        // Clean old samples
        cleanBuffer();

        // Add new sample to buffer
        buffer.current.push({
            heading: normalizedHeading,
            timestamp: now,
            weight: 1
        });

        // Limit buffer size
        if (buffer.current.length > bufferSize) {
            buffer.current = buffer.current.slice(-bufferSize);
        }

        // Calculate smoothed heading
        const smoothed = calculateWeightedAverage();
        lastSmoothedHeading.current = smoothed;

        // Only update output if change is significant enough
        const delta = Math.abs(angularDistance(lastOutputHeading.current, smoothed));
        if (delta >= minDelta) {
            lastOutputHeading.current = smoothed;
        }

        return lastOutputHeading.current;
    }, [bufferSize, minDelta, cleanBuffer, calculateWeightedAverage]);

    /**
     * Resets the heading buffer
     */
    const reset = useCallback(() => {
        buffer.current = [];
        lastSmoothedHeading.current = 0;
        lastOutputHeading.current = 0;
    }, []);

    return {
        smoothedHeading: lastOutputHeading.current,
        addHeading,
        reset
    };
};

export default useSmoothedHeading;
