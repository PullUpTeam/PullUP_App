// hooks/useAcceptAndAssignRide.ts - TYPE-SAFE VERSION
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { rideAPI, rideQueryKeys, AssignDriverResponse } from '@/api/rideAPI';
import { useAuthContext } from '@/context/AuthContext';

export const useAcceptAndAssignRide = () => {
    const queryClient = useQueryClient();
    const { backendUser, dynamicUser } = useAuthContext();

    return useMutation<AssignDriverResponse, Error, string>({
        mutationFn: async (rideId: string) => {
            // ✅ Get driver ID from backend user (now includes driverId field)
            const getDriverId = (): string | null => {
                // First check if user has a driver ID (from approved driver application)
                if (backendUser?.driverId) {
                    console.log('✅ Found driver ID from backendUser.driverId:', backendUser.driverId);
                    return backendUser.driverId;
                }

                // Fallback: check if user is marked as driver and use user ID
                if (backendUser?.isDriver && backendUser?.id) {
                    console.log('✅ Using user ID as driver ID for approved driver:', backendUser.id);
                    return backendUser.id;
                }

                return null;
            };

            const driverId = getDriverId();

            if (!driverId) {
                // Debug logging to help identify available properties
                console.error('❌ Driver ID not found in auth context');
                console.log('🔍 backendUser:', backendUser);
                console.log('🔍 dynamicUser structure:', Object.keys(dynamicUser || {}));
                console.log('🔍 dynamicUser content:', dynamicUser);

                throw new Error('Driver ID not found. Please ensure you are logged in as a driver.');
            }

            console.log('✅ Using driver ID:', driverId);

            try {
                // Step 1: Accept the ride
                console.log('🚗 Step 1: Accepting ride...', rideId);
                await rideAPI.acceptRide(rideId);

                console.log('✅ Step 1 complete: Ride accepted');

                // Step 2: Assign driver to the ride
                console.log('🚗 Step 2: Assigning driver to ride...', { rideId, driverId });
                const result = await rideAPI.assignDriverToRide(rideId, driverId);

                console.log('✅ Step 2 complete: Driver assigned');
                return result;

            } catch (error) {
                console.error('❌ Error in accept and assign process:', error);
                throw error;
            }
        },
        onSuccess: (data) => {
            console.log('✅ Ride acceptance and driver assignment completed:', data);

            // Invalidate all relevant queries
            queryClient.invalidateQueries({ queryKey: rideQueryKeys.available() });
            queryClient.invalidateQueries({ queryKey: rideQueryKeys.ride(data.ride.id) });
            queryClient.invalidateQueries({ queryKey: rideQueryKeys.assignedDriver(data.ride.id) });
        },
        onError: (error) => {
            console.error('❌ Error in accept and assign ride:', error);
        },
    });
};