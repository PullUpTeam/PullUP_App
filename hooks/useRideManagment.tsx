// hooks/useRideManagement.tsx - FIXED VERSION
import { useCallback } from 'react';
import { Alert } from 'react-native';
import { useRouter } from 'expo-router';
import { useGetAvailableRides } from '@/hooks/ride/useGetAvailableRides';
import { useAcceptAndAssignRide } from "@/hooks/useAcceptAndAssignRide";
import { LocationData } from './useRideAppState';

interface UseRideManagementProps {
    isDriverViewActive: boolean;
    origin: LocationData | null;
    destination: LocationData | null;
    selectedRide: any;
    routeInfo: any;
    setAcceptingRideId: (id: string | null) => void;
}

export const useRideManagement = ({
                                      isDriverViewActive,
                                      origin,
                                      destination,
                                      selectedRide,
                                      routeInfo,
                                      setAcceptingRideId,
                                  }: UseRideManagementProps) => {
    const router = useRouter();

    // Driver-specific hooks
    const {
        data: availableRidesData,
        isLoading: isLoadingRides,
        refetch: fetchAvailableRides
    } = useGetAvailableRides({ enabled: isDriverViewActive });

    // ✅ FIXED: Use isPending instead of isLoading for mutations
    const { mutate: acceptAndAssignRide, isPending: isAcceptingRide } = useAcceptAndAssignRide();

    const availableRides = availableRidesData?.rides || [];

    // Driver Actions
    const handleAcceptRide = useCallback(async (rideId: string) => {
        // Prevent multiple simultaneous accepts
        if (isAcceptingRide) {
            console.log('⚠️ Already accepting a ride, please wait...');
            return;
        }

        setAcceptingRideId(rideId);

        // Find the ride data
        const rideToAccept = availableRides.find(ride => ride.id === rideId);

        if (!rideToAccept) {
            setAcceptingRideId(null);
            Alert.alert('Error', 'Ride data not found');
            return;
        }

        console.log('🚗 Starting ride acceptance process for:', rideId);

        acceptAndAssignRide(rideId, {
            onSuccess: (data) => {
                // ✅ Now we get AssignDriverResponse which includes both ride and driver
                const assignedRide = data.ride;
                const assignedDriver = data.driver;
                setAcceptingRideId(null);

                console.log('✅ Ride accepted and driver assigned successfully!');
                console.log('Assigned ride data:', assignedRide);
                console.log('Driver data:', assignedDriver);

                // Validate required data before navigation
                if (!assignedRide.originCoordinates || !assignedRide.destinationCoordinates) {
                    Alert.alert('Error', 'Missing ride location data. Please try again.');
                    return;
                }

                // ✅ Check that driver assignment was successful
                if (!assignedRide.assignedDriverId) {
                    Alert.alert('Error', 'Driver assignment failed. Please try again.');
                    return;
                }

                console.log('✅ Ride status:', assignedRide.status);
                console.log('✅ Assigned driver ID:', assignedRide.assignedDriverId);

                try {
                    // Navigate immediately to driver navigation screen
                    router.push({
                        pathname: '/(app)/driver-navigation',
                        params: {
                            rideId: assignedRide.id,
                            pickupLat: assignedRide.originCoordinates.latitude.toString(),
                            pickupLng: assignedRide.originCoordinates.longitude.toString(),
                            pickupAddress: assignedRide.originAddress,
                            destLat: assignedRide.destinationCoordinates.latitude.toString(),
                            destLng: assignedRide.destinationCoordinates.longitude.toString(),
                            destAddress: assignedRide.destinationAddress,
                            passengerName: assignedRide.userEmail?.split('@')[0] || 'Passenger',
                            estimatedPrice: assignedRide.customPrice || assignedRide.estimatedPrice || '$0.00',
                            driverId: assignedRide.assignedDriverId, // ✅ Pass driver ID
                        }
                    });

                    console.log('🚗 Navigation started successfully');
                } catch (error) {
                    console.error('❌ Navigation error:', error);
                    Alert.alert(
                        'Navigation Error',
                        'Failed to start navigation. Please try again.',
                        [
                            { text: 'OK', onPress: () => console.log('Navigation error acknowledged') }
                        ]
                    );
                }
            },
            onError: (error: any) => {
                setAcceptingRideId(null);
                console.error('❌ Error accepting and assigning ride:', error);
                Alert.alert(
                    'Failed to Accept Ride',
                    error.message || 'Unable to accept the ride. Please try again.',
                    [
                        { text: 'Retry', onPress: () => handleAcceptRide(rideId) },
                        { text: 'Cancel', style: 'cancel' }
                    ]
                );
            },
        });
    }, [acceptAndAssignRide, setAcceptingRideId, availableRides, router, isAcceptingRide]);

    const handleRejectRide = useCallback(async (rideId: string) => {
        try {
            console.log('❌ Rejected ride:', rideId);
            // Future: Track rejections via API
        } catch (error: any) {
            console.error('Error rejecting ride:', error);
            Alert.alert('Error', 'Failed to reject ride.');
        }
    }, []);

    const handleRefreshRides = useCallback(async () => {
        await fetchAvailableRides();
    }, [fetchAvailableRides]);

    // Passenger Actions
    const handleConfirmRide = useCallback(() => {
        if (!origin || !destination || !selectedRide) {
            Alert.alert('Missing Information', 'Please select pickup, destination, and ride type');
            return;
        }

        const estimatedFare = ((routeInfo?.distanceValue || 0) / 1000) * 1.5 + 3;

        Alert.alert(
            'Confirm Ride',
            `Confirm ${selectedRide.type} from ${origin.address} to ${destination.address}\n\nEstimated fare: $${estimatedFare.toFixed(2)}`,
            [
                { text: 'Cancel', style: 'cancel' },
                {
                    text: 'Confirm',
                    onPress: () => {
                        router.push({
                            pathname: '/(app)/loading',
                            params: {
                                price: estimatedFare.toFixed(2),
                                pickupAddress: origin?.address || 'Current Location',
                                destinationAddress: destination?.address || 'Not specified',
                            },
                        });
                    }
                },
            ]
        );
    }, [origin, destination, selectedRide, routeInfo, router]);

    return {
        // Driver data
        availableRides,
        isLoadingRides,
        isAcceptingRide, // ✅ Now using isPending from mutation

        // Driver actions
        handleAcceptRide,
        handleRejectRide,
        handleRefreshRides,

        // Passenger actions
        handleConfirmRide,
    };
};