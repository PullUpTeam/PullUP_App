// hooks/useRideStatus.example.tsx
import React from 'react';
import { View, Text, ActivityIndicator, TouchableOpacity } from 'react-native';
import { useRideStatus } from './useRideStatus';

interface RideStatusExampleProps {
    rideId: string;
}

export const RideStatusExample: React.FC<RideStatusExampleProps> = ({ rideId }) => {
    const {
        ride,
        assignedDriver,
        rideStatus,
        isWaitingForDriver,
        isDriverAssigned,
        isLoading,
        error,
        refetch,
    } = useRideStatus({
        rideId,
        enabled: !!rideId,
        pollingInterval: 5000, // Poll every 5 seconds
    });

    if (isLoading) {
        return (
            <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
                <ActivityIndicator size="large" />
                <Text style={{ marginTop: 10 }}>Loading ride status...</Text>
            </View>
        );
    }

    if (error) {
        return (
            <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', padding: 20 }}>
                <Text style={{ color: 'red', textAlign: 'center', marginBottom: 20 }}>
                    Error: {error}
                </Text>
                <TouchableOpacity
                    onPress={refetch}
                    style={{
                        backgroundColor: '#007AFF',
                        padding: 10,
                        borderRadius: 5,
                    }}
                >
                    <Text style={{ color: 'white' }}>Retry</Text>
                </TouchableOpacity>
            </View>
        );
    }

    if (!ride) {
        return (
            <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
                <Text>No ride found</Text>
            </View>
        );
    }

    return (
        <View style={{ flex: 1, padding: 20 }}>
            <Text style={{ fontSize: 24, fontWeight: 'bold', marginBottom: 20 }}>
                Ride Status
            </Text>

            {/* Ride Information */}
            <View style={{ marginBottom: 20 }}>
                <Text style={{ fontSize: 18, fontWeight: '600', marginBottom: 10 }}>
                    Trip Details
                </Text>
                <Text>From: {ride.originAddress}</Text>
                <Text>To: {ride.destinationAddress}</Text>
                <Text>Status: {rideStatus}</Text>
                {ride.estimatedPrice && <Text>Price: {ride.estimatedPrice}</Text>}
            </View>

            {/* Status-specific UI */}
            {isWaitingForDriver && (
                <View style={{ 
                    backgroundColor: '#FFF3CD', 
                    padding: 15, 
                    borderRadius: 8, 
                    marginBottom: 20 
                }}>
                    <Text style={{ fontSize: 16, fontWeight: '600', marginBottom: 5 }}>
                        🔍 Looking for a driver...
                    </Text>
                    <Text>
                        We're finding the best driver for your trip. This usually takes a few minutes.
                    </Text>
                </View>
            )}

            {isDriverAssigned && assignedDriver && (
                <View style={{ 
                    backgroundColor: '#D4EDDA', 
                    padding: 15, 
                    borderRadius: 8, 
                    marginBottom: 20 
                }}>
                    <Text style={{ fontSize: 16, fontWeight: '600', marginBottom: 10 }}>
                        🚗 Driver Assigned
                    </Text>
                    <Text>Driver: {assignedDriver.username}</Text>
                    <Text>Email: {assignedDriver.email}</Text>
                    {ride.driverAcceptedAt && (
                        <Text>
                            Accepted at: {new Date(ride.driverAcceptedAt).toLocaleTimeString()}
                        </Text>
                    )}
                </View>
            )}

            {/* Status-specific messages */}
            {rideStatus === 'approaching_pickup' && (
                <View style={{ 
                    backgroundColor: '#CCE5FF', 
                    padding: 15, 
                    borderRadius: 8, 
                    marginBottom: 20 
                }}>
                    <Text style={{ fontSize: 16, fontWeight: '600', marginBottom: 5 }}>
                        🚗 Driver is on the way
                    </Text>
                    <Text>
                        Your driver is heading to your pickup location. 
                        You'll receive an update when they arrive.
                    </Text>
                </View>
            )}

            {rideStatus === 'driver_arrived' && (
                <View style={{ 
                    backgroundColor: '#E7F3FF', 
                    padding: 15, 
                    borderRadius: 8, 
                    marginBottom: 20 
                }}>
                    <Text style={{ fontSize: 16, fontWeight: '600', marginBottom: 5 }}>
                        📍 Driver has arrived
                    </Text>
                    <Text>
                        Your driver is waiting at the pickup location. 
                        Please head out when you're ready.
                    </Text>
                </View>
            )}

            {rideStatus === 'in_progress' && (
                <View style={{ 
                    backgroundColor: '#E8F5E8', 
                    padding: 15, 
                    borderRadius: 8, 
                    marginBottom: 20 
                }}>
                    <Text style={{ fontSize: 16, fontWeight: '600', marginBottom: 5 }}>
                        🛣️ Trip in progress
                    </Text>
                    <Text>
                        You're on your way to the destination. 
                        Enjoy your ride!
                    </Text>
                </View>
            )}

            {rideStatus === 'completed' && (
                <View style={{ 
                    backgroundColor: '#D1ECF1', 
                    padding: 15, 
                    borderRadius: 8, 
                    marginBottom: 20 
                }}>
                    <Text style={{ fontSize: 16, fontWeight: '600', marginBottom: 5 }}>
                        ✅ Trip completed
                    </Text>
                    <Text>
                        You've arrived at your destination. 
                        Thank you for using our service!
                    </Text>
                </View>
            )}

            {rideStatus === 'cancelled' && (
                <View style={{ 
                    backgroundColor: '#F8D7DA', 
                    padding: 15, 
                    borderRadius: 8, 
                    marginBottom: 20 
                }}>
                    <Text style={{ fontSize: 16, fontWeight: '600', marginBottom: 5 }}>
                        ❌ Trip cancelled
                    </Text>
                    <Text>
                        This trip has been cancelled. 
                        You can book a new ride anytime.
                    </Text>
                </View>
            )}

            {/* Refresh button */}
            <TouchableOpacity
                onPress={refetch}
                style={{
                    backgroundColor: '#007AFF',
                    padding: 15,
                    borderRadius: 8,
                    alignItems: 'center',
                }}
            >
                <Text style={{ color: 'white', fontSize: 16, fontWeight: '600' }}>
                    Refresh Status
                </Text>
            </TouchableOpacity>

            {/* Debug information */}
            <View style={{ 
                marginTop: 20, 
                padding: 10, 
                backgroundColor: '#F8F9FA', 
                borderRadius: 5 
            }}>
                <Text style={{ fontSize: 12, color: '#6C757D' }}>
                    Debug Info:
                </Text>
                <Text style={{ fontSize: 12, color: '#6C757D' }}>
                    Waiting for driver: {isWaitingForDriver ? 'Yes' : 'No'}
                </Text>
                <Text style={{ fontSize: 12, color: '#6C757D' }}>
                    Driver assigned: {isDriverAssigned ? 'Yes' : 'No'}
                </Text>
                <Text style={{ fontSize: 12, color: '#6C757D' }}>
                    Last updated: {new Date().toLocaleTimeString()}
                </Text>
            </View>
        </View>
    );
};

// Example usage in a screen component
export const TripStatusScreen: React.FC = () => {
    // In a real app, you would get the rideId from navigation params or context
    const rideId = 'ride-123'; // This would come from your app state/navigation

    return <RideStatusExample rideId={rideId} />;
};

// Example of conditional rendering based on ride status
export const ConditionalRideStatusExample: React.FC<{ rideId: string }> = ({ rideId }) => {
    const { rideStatus, isWaitingForDriver, isDriverAssigned } = useRideStatus({ rideId });

    // Show different screens based on status
    if (isWaitingForDriver) {
        return (
            <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
                <ActivityIndicator size="large" />
                <Text style={{ marginTop: 10 }}>Finding a driver...</Text>
            </View>
        );
    }

    if (isDriverAssigned) {
        return (
            <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
                <Text style={{ fontSize: 18, fontWeight: 'bold' }}>
                    Driver Found! 🎉
                </Text>
                <Text style={{ marginTop: 10 }}>
                    Status: {rideStatus}
                </Text>
            </View>
        );
    }

    return (
        <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
            <Text>Unknown ride status</Text>
        </View>
    );
};

// Example of using the hook for navigation decisions
export const useRideStatusNavigation = (rideId: string) => {
    const { rideStatus, isWaitingForDriver, isDriverAssigned } = useRideStatus({ rideId });

    // Return navigation suggestions based on status
    const getNavigationAction = () => {
        if (isWaitingForDriver) {
            return 'SHOW_WAITING_SCREEN';
        }
        
        if (isDriverAssigned && rideStatus === 'driver_assigned') {
            return 'SHOW_DRIVER_INFO_SCREEN';
        }
        
        if (rideStatus === 'approaching_pickup' || rideStatus === 'driver_arrived') {
            return 'SHOW_TRACKING_SCREEN';
        }
        
        if (rideStatus === 'in_progress') {
            return 'SHOW_TRIP_SCREEN';
        }
        
        if (rideStatus === 'completed') {
            return 'SHOW_COMPLETION_SCREEN';
        }
        
        if (rideStatus === 'cancelled') {
            return 'SHOW_CANCELLATION_SCREEN';
        }
        
        return 'SHOW_DEFAULT_SCREEN';
    };

    return {
        rideStatus,
        isWaitingForDriver,
        isDriverAssigned,
        navigationAction: getNavigationAction(),
    };
};