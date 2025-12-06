// hooks/ride/useCreateRide.ts
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useAuthContext } from '@/context/AuthContext';

// Types for the ride data
interface Coordinates {
    latitude: number;
    longitude: number;
}

interface CreateRideParams {
    originCoordinates: Coordinates;
    destinationCoordinates: Coordinates;
    originAddress: string;
    destinationAddress: string;
    rideType: string; // e.g., 'standard', 'premium', 'shared'
    estimatedPrice?: string;
    customPrice?: string;
    scheduledTime?: string; // ISO string for scheduled rides
    notes?: string;
}

interface CreateRideResponse {
    success: boolean;
    ride: {
        id: string;
        userId: string;
        userEmail: string;
        walletAddress: string;
        originCoordinates: Coordinates;
        destinationCoordinates: Coordinates;
        originAddress: string;
        destinationAddress: string;
        estimatedPrice?: string;
        customPrice?: string;
        status: 'pending' | 'accepted' | 'driver_assigned' | 'approaching_pickup' | 'driver_arrived' | 'in_progress' | 'completed' | 'cancelled';
        createdAt: string;
        updatedAt: string;
    };
}

// Mock API function - replace with your actual API call
const createRideAPI = async (rideData: CreateRideParams & { userId: string; userEmail: string; walletAddress: string }): Promise<CreateRideResponse> => {
    // Replace this with your actual API endpoint
    const BACKEND_URL = process.env.EXPO_PUBLIC_BACKEND_URL;

    const response = await fetch(`${BACKEND_URL}/api/rides/create`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
        },
        body: JSON.stringify(rideData),
    });

    if (!response.ok) {
        const errorText = await response.text();
        console.error('API Response:', response.status, errorText);
        throw new Error(`API Error: ${response.status} - ${response.statusText}`);
    }

    const data = await response.json();

    if (data.error) {
        throw new Error(data.error);
    }

    return data;
};

interface UseCreateRideOptions {
    onSuccess?: (data: CreateRideResponse) => void;
    onError?: (error: Error) => void;
}

export const useCreateRide = (options: UseCreateRideOptions = {}) => {
    const queryClient = useQueryClient();
    const { backendUser, dynamicUser } = useAuthContext();

    return useMutation<CreateRideResponse, Error, CreateRideParams>({
        mutationFn: async (rideData: CreateRideParams) => {
            // Ensure user is authenticated
            if (!backendUser?.id && !dynamicUser?.email) {
                throw new Error('User must be authenticated to create a ride');
            }

            // Get wallet address from auth context
            const walletAddress = dynamicUser?.walletAddress || backendUser?.walletAddress || '';

            if (!walletAddress) {
                console.warn('⚠️ No wallet address found in auth context');
            }

            // Clean up coordinates to only include latitude/longitude
            const cleanOriginCoordinates = {
                latitude: rideData.originCoordinates.latitude,
                longitude: rideData.originCoordinates.longitude,
            };

            const cleanDestinationCoordinates = {
                latitude: rideData.destinationCoordinates.latitude,
                longitude: rideData.destinationCoordinates.longitude,
            };

            // Add user identification to the ride data
            const rideDataWithUser = {
                ...rideData,
                originCoordinates: cleanOriginCoordinates,
                destinationCoordinates: cleanDestinationCoordinates,
                userId: backendUser?.id || dynamicUser?.email || '',
                userEmail: dynamicUser?.email || backendUser?.email || '',
                walletAddress, // ✅ Now including walletAddress
            };

            console.log('📤 Sending ride data:', rideDataWithUser);

            return createRideAPI(rideDataWithUser);
        },
        onSuccess: (data, variables) => {
            console.log('✅ Ride created successfully:', data.ride.id);

            // Invalidate ride-related queries
            queryClient.invalidateQueries({ queryKey: ['rides'] });
            queryClient.invalidateQueries({ queryKey: ['user', 'rides'] });

            // Call custom onSuccess if provided
            options.onSuccess?.(data);
        },
        onError: (error, variables) => {
            console.error('❌ Failed to create ride:', error);
            console.error('📤 Variables that failed:', variables);

            // Call custom onError if provided
            options.onError?.(error);
        },
        // Optional: Add retry logic
        retry: (failureCount, error) => {
            // Don't retry validation errors (4xx)
            if (error.message.includes('400')) {
                return false;
            }
            // Retry up to 2 times for network errors
            if (failureCount < 2 && error.message.includes('network')) {
                return true;
            }
            return false;
        },
    });
};

// Query keys for ride-related queries
export const rideQueryKeys = {
    all: ['rides'] as const,
    user: (userId: string) => [...rideQueryKeys.all, 'user', userId] as const,
    ride: (rideId: string) => [...rideQueryKeys.all, 'ride', rideId] as const,
    status: (status: string) => [...rideQueryKeys.all, 'status', status] as const,
};