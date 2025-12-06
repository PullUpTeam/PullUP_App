import { useMemo } from 'react';
import { useLocalSearchParams } from 'expo-router';
import { RideNavigationData } from './types';

/**
 * Hook to parse and stabilize navigation parameters from URL.
 * Prevents infinite re-renders caused by unstable params object reference.
 */
export function useNavigationParams(): {
    rideData: RideNavigationData | null;
    isValid: boolean;
    error: string | null;
} {
    const rawParams = useLocalSearchParams();

    return useMemo(() => {
        // Stabilize params - convert to string values
        const params: Record<string, string> = {};
        Object.entries(rawParams).forEach(([key, value]) => {
            if (typeof value === 'string') {
                params[key] = value;
            } else if (Array.isArray(value)) {
                params[key] = value[0] || '';
            } else {
                params[key] = String(value || '');
            }
        });

        // Validate required fields
        const requiredFields = [
            'rideId', 'pickupLat', 'pickupLng', 'destLat', 'destLng',
            'pickupAddress', 'destAddress', 'passengerName', 'estimatedPrice'
        ] as const;

        for (const field of requiredFields) {
            if (!(field in params) || !params[field]) {
                return {
                    rideData: null,
                    isValid: false,
                    error: `Missing required field: ${field}`
                };
            }
        }

        // Parse numeric values
        const pickupLat = parseFloat(params.pickupLat);
        const pickupLng = parseFloat(params.pickupLng);
        const destLat = parseFloat(params.destLat);
        const destLng = parseFloat(params.destLng);

        // Validate parsed values
        if (isNaN(pickupLat) || isNaN(pickupLng) || isNaN(destLat) || isNaN(destLng)) {
            return {
                rideData: null,
                isValid: false,
                error: 'Invalid coordinate values'
            };
        }

        return {
            rideData: {
                id: params.rideId,
                pickupLat,
                pickupLng,
                pickupAddress: params.pickupAddress,
                destLat,
                destLng,
                destAddress: params.destAddress,
                passengerName: params.passengerName,
                estimatedPrice: params.estimatedPrice,
            },
            isValid: true,
            error: null
        };
    }, [
        rawParams.rideId,
        rawParams.pickupLat,
        rawParams.pickupLng,
        rawParams.destLat,
        rawParams.destLng,
        rawParams.pickupAddress,
        rawParams.destAddress,
        rawParams.passengerName,
        rawParams.estimatedPrice
    ]);
}
