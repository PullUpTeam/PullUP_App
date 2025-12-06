// hooks/useRideStatus.ts
import { useQuery } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { rideAPI, rideQueryKeys, AvailableRide, Driver } from '@/api/rideAPI';

export interface UseRideStatusProps {
    rideId: string;
    enabled?: boolean;
    pollingInterval?: number;
}

export interface UseRideStatusReturn {
    ride: AvailableRide | null;
    assignedDriver: Driver | null;
    rideStatus: AvailableRide['status'] | null;
    isWaitingForDriver: boolean;
    isDriverAssigned: boolean;
    isLoading: boolean;
    error: string | null;
    refetch: () => void;
}

export const useRideStatus = ({
    rideId,
    enabled = true,
    pollingInterval = 5000, // Poll every 5 seconds
}: UseRideStatusProps): UseRideStatusReturn => {
    const [previousStatus, setPreviousStatus] = useState<AvailableRide['status'] | null>(null);

    // Query for ride details with polling
    const {
        data: rideData,
        isLoading: isLoadingRide,
        error: rideError,
        refetch: refetchRide,
    } = useQuery({
        queryKey: rideQueryKeys.ride(rideId),
        queryFn: () => rideAPI.getRideById(rideId),
        enabled: enabled && !!rideId,
        refetchInterval: pollingInterval,
        staleTime: 0, // Always consider data stale to enable polling
        retry: 3,
        retryDelay: (attemptIndex) => Math.min(1000 * 2 ** attemptIndex, 30000),
    });

    const ride = rideData?.ride || null;
    const currentStatus = ride?.status || null;

    // Query for assigned driver details when driver is assigned
    const {
        data: driverData,
        isLoading: isLoadingDriver,
        error: driverError,
        refetch: refetchDriver,
    } = useQuery({
        queryKey: rideQueryKeys.assignedDriver(rideId),
        queryFn: () => rideAPI.getAssignedDriver(rideId),
        enabled: enabled && !!rideId && !!ride?.assignedDriverId,
        refetchInterval: pollingInterval,
        staleTime: 30000, // Driver details don't change as frequently
        retry: 2,
    });

    const assignedDriver = driverData?.driver || null;

    // Handle status change notifications
    useEffect(() => {
        if (currentStatus && previousStatus && currentStatus !== previousStatus) {
            console.log(`🚗 Ride status changed: ${previousStatus} → ${currentStatus}`);

            // Handle specific status transitions
            switch (currentStatus) {
                case 'driver_assigned':
                    console.log('✅ Driver assigned to ride');
                    break;
                case 'approaching_pickup':
                    console.log('🚗 Driver is approaching pickup location');
                    break;
                case 'driver_arrived':
                    console.log('📍 Driver has arrived at pickup location');
                    break;
                case 'in_progress':
                    console.log('🛣️ Trip is now in progress');
                    break;
                case 'completed':
                    console.log('✅ Trip completed');
                    break;
                case 'cancelled':
                    console.log('❌ Trip cancelled');
                    break;
            }
        }
        setPreviousStatus(currentStatus);
    }, [currentStatus, previousStatus]);

    // Determine waiting and assignment states
    const isWaitingForDriver = currentStatus === 'pending' || currentStatus === 'accepted';
    const isDriverAssigned = !!ride?.assignedDriverId && currentStatus !== 'pending' && currentStatus !== 'accepted';

    // Combine loading states
    const isLoading = isLoadingRide || (isDriverAssigned && isLoadingDriver);

    // Combine errors
    const error = rideError?.message || driverError?.message || null;

    // Combined refetch function
    const refetch = () => {
        refetchRide();
        if (isDriverAssigned) {
            refetchDriver();
        }
    };

    return {
        ride,
        assignedDriver,
        rideStatus: currentStatus,
        isWaitingForDriver,
        isDriverAssigned,
        isLoading,
        error,
        refetch,
    };
};