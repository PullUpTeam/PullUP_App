// hooks/useTripState.ts - Updated to use shared types
import { useState, useCallback } from 'react';
import { useLocalSearchParams } from 'expo-router';
import { TripParams, TripStatus } from '@/hooks/trip';

// Helper function to safely extract string from route params
const extractStringParam = (param: string | string[] | undefined): string => {
    if (Array.isArray(param)) return param[0] || '';
    return param || '';
};

export const useTripState = () => {
    const params = useLocalSearchParams();

    // Safely convert params to TripParams with proper type handling
    const tripParams: TripParams = {
        price: extractStringParam(params.price),
        pickupAddress: extractStringParam(params.pickupAddress),
        destinationAddress: extractStringParam(params.destinationAddress),
        driverName: extractStringParam(params.driverName),
        driverVehicle: extractStringParam(params.driverVehicle),
        rideId: extractStringParam(params.rideId),
    };

    // Trip state with proper typing - simplified to only track pickup coordinates
    const [userPickupCoords, setUserPickupCoords] = useState<[number, number] | null>(null);

    // Reset trip state
    const resetTripState = useCallback(() => {
        setUserPickupCoords(null);
    }, []);

    return {
        tripParams,
        userPickupCoords,
        setUserPickupCoords,
        resetTripState,
    };
};