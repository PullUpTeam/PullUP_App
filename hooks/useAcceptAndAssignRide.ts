// hooks/useAcceptAndAssignRide.ts - TYPE-SAFE VERSION
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { rideAPI, rideQueryKeys, AssignDriverResponse } from '@/api/rideAPI';
import { useAuthContext } from '@/context/AuthContext';

export const useAcceptAndAssignRide = () => {
    const queryClient = useQueryClient();
    const { backendUser, dynamicUser } = useAuthContext();

    return useMutation<AssignDriverResponse, Error, string>({
        mutationFn: async (rideId: string) => {
            // ✅ Type-safe way to access properties that might not be in the type definition
            const getDriverId = (): string | null => {
                // Try backendUser first
                if (backendUser?.id) {
                    return backendUser.id;
                }

                // Try dynamicUser with type assertion to access potentially missing properties
                if (dynamicUser) {
                    const user = dynamicUser as any; // Temporary type assertion

                    // Try common property names
                    const possibleIds = [
                        user.id,
                        user.userId,
                        user.user?.id,
                        user.primaryWallet?.address,
                        user.email,
                        user.walletAddress,
                    ];

                    for (const id of possibleIds) {
                        if (id && typeof id === 'string') {
                            console.log('✅ Found driver ID from dynamicUser:', id);
                            return id;
                        }
                    }
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