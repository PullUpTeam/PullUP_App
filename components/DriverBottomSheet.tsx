import React from 'react';
import { View, Text, TouchableOpacity, ScrollView, Alert } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { AvailableRide } from '@/api/rideAPI';

interface DriverBottomSheetProps {
    availableRides: AvailableRide[];
    isVisible: boolean;
    onAcceptRide?: (rideId: string) => Promise<void>;
    onRejectRide?: (rideId: string) => Promise<void>;
    onRefresh?: () => Promise<void>;
    isLoading?: boolean;
    isAcceptingRide?: string | null;
}

interface RideCardProps {
    ride: AvailableRide;
    onAccept: () => void;
    onReject: () => void;
    isAccepting?: boolean;
    isLoading?: boolean;
}

const RideCard: React.FC<RideCardProps> = ({
                                               ride,
                                               onAccept,
                                               onReject,
                                               isAccepting = false,
                                               isLoading = false
                                           }) => {
    // Calculate estimated earnings
    const getEstimatedEarnings = (ride: AvailableRide): string => {
        if (ride.customPrice) {
            return ride.customPrice.startsWith('$') ? ride.customPrice : `$${ride.customPrice}`;
        }
        if (ride.estimatedPrice) {
            return ride.estimatedPrice.startsWith('$') ? ride.estimatedPrice : `$${ride.estimatedPrice}`;
        }

        // Fallback calculation based on distance (simplified)
        const latDiff = ride.destinationCoordinates.latitude - ride.originCoordinates.latitude;
        const lngDiff = ride.destinationCoordinates.longitude - ride.originCoordinates.longitude;
        const distance = Math.sqrt(latDiff * latDiff + lngDiff * lngDiff);
        const estimatedPrice = Math.max(8, distance * 500 + 5);
        return `$${estimatedPrice.toFixed(2)}`;
    };

    const formatTimeAgo = (createdAt: string): string => {
        const now = new Date();
        const created = new Date(createdAt);
        const diffInMinutes = Math.floor((now.getTime() - created.getTime()) / (1000 * 60));

        if (diffInMinutes < 1) return 'Just now';
        if (diffInMinutes < 60) return `${diffInMinutes}m ago`;
        const diffInHours = Math.floor(diffInMinutes / 60);
        if (diffInHours < 24) return `${diffInHours}h ago`;
        return `${Math.floor(diffInHours / 24)}d ago`;
    };

    const shortenAddress = (address: string, maxLength: number = 35): string => {
        if (address.length <= maxLength) return address;
        return address.substring(0, maxLength) + '...';
    };

    return (
        <View className="bg-white rounded-xl p-4 mb-3 border border-gray-200 shadow-sm">
            {/* Header with earnings and time */}
            <View className="flex-row items-center justify-between mb-3">
                <View className="flex-row items-center">
                    <Ionicons name="cash-outline" size={20} color="#4CAF50" />
                    <Text className="text-lg font-bold text-green-600 ml-2">
                        {getEstimatedEarnings(ride)}
                    </Text>
                    <View className="bg-blue-100 px-2 py-1 rounded-full ml-2">
                        <Text className="text-xs text-blue-600 font-medium uppercase">
                            {ride.status}
                        </Text>
                    </View>
                </View>
                <Text className="text-xs text-gray-500">{formatTimeAgo(ride.createdAt)}</Text>
            </View>

            {/* User Info */}
            <View className="flex-row items-center mb-3">
                <Ionicons name="person-circle-outline" size={16} color="#666" />
                <Text className="text-sm text-gray-600 ml-1">
                    {ride.userEmail}
                </Text>
            </View>

            {/* Pickup Location */}
            <View className="flex-row items-start mb-2">
                <View className="w-3 h-3 bg-green-500 rounded-full mt-1 mr-3" />
                <View className="flex-1">
                    <Text className="text-xs text-gray-500 uppercase">Pickup</Text>
                    <Text className="text-sm text-gray-800 font-medium" numberOfLines={2}>
                        {shortenAddress(ride.originAddress)}
                    </Text>
                </View>
            </View>

            {/* Destination */}
            <View className="flex-row items-start mb-4">
                <View className="w-3 h-3 bg-red-500 rounded-sm mt-1 mr-3" />
                <View className="flex-1">
                    <Text className="text-xs text-gray-500 uppercase">Destination</Text>
                    <Text className="text-sm text-gray-800 font-medium" numberOfLines={2}>
                        {shortenAddress(ride.destinationAddress)}
                    </Text>
                </View>
            </View>

            {/* Action Buttons */}
            <View className="flex-row space-x-3">
                <TouchableOpacity
                    onPress={onReject}
                    disabled={isLoading || isAccepting}
                    className={`flex-1 rounded-lg py-3 items-center border ${
                        isLoading || isAccepting
                            ? 'bg-gray-100 border-gray-200'
                            : 'bg-gray-100 border-gray-200'
                    }`}
                >
                    <Text className={`font-medium ${
                        isLoading || isAccepting ? 'text-gray-400' : 'text-gray-600'
                    }`}>
                        Pass
                    </Text>
                </TouchableOpacity>
                <TouchableOpacity
                    onPress={onAccept}
                    disabled={isLoading || isAccepting}
                    className={`flex-1 rounded-lg py-3 items-center ${
                        isAccepting
                            ? 'bg-blue-400'
                            : isLoading
                                ? 'bg-gray-300'
                                : 'bg-blue-500'
                    }`}
                >
                    <Text className="text-white font-medium">
                        {isAccepting ? 'Accepting...' : 'Accept Ride'}
                    </Text>
                </TouchableOpacity>
            </View>
        </View>
    );
};

export const DriverBottomSheet: React.FC<DriverBottomSheetProps> = ({
                                                                        availableRides,
                                                                        isVisible,
                                                                        onAcceptRide,
                                                                        onRejectRide,
                                                                        onRefresh,
                                                                        isLoading = false,
                                                                        isAcceptingRide = null,
                                                                    }) => {
    if (!isVisible) return null;

    const handleAcceptRide = async (rideId: string) => {
        try {
            await onAcceptRide?.(rideId);
        } catch (error) {
            console.error('Error accepting ride:', error);
            Alert.alert('Error', 'Failed to accept ride. Please try again.');
        }
    };

    const handleRejectRide = async (rideId: string) => {
        try {
            await onRejectRide?.(rideId);
        } catch (error) {
            console.error('Error rejecting ride:', error);
            Alert.alert('Error', 'Failed to reject ride. Please try again.');
        }
    };

    const handleRefresh = async () => {
        try {
            await onRefresh?.();
        } catch (error) {
            console.error('Error refreshing rides:', error);
            Alert.alert('Error', 'Failed to refresh rides. Please try again.');
        }
    };

    return (
        <View
            className="bg-white rounded-2xl shadow-lg"
            style={{
                position: 'absolute',
                left: 16,
                right: 16,
                bottom: 16,
                maxHeight: '70%',
                elevation: 10,
            }}
        >
            {/* Header */}
            <View className="p-4 border-b border-gray-200">
                <View className="flex-row items-center justify-between">
                    <View>
                        <Text className="text-lg font-bold text-gray-800">Available Rides</Text>
                        <Text className="text-sm text-gray-500">
                            {isLoading
                                ? 'Loading rides...'
                                : `${availableRides.length} ride${availableRides.length !== 1 ? 's' : ''} available`
                            }
                        </Text>
                    </View>
                    <View className="flex-row items-center space-x-2">
                        <TouchableOpacity
                            onPress={handleRefresh}
                            disabled={isLoading}
                            className="bg-blue-100 rounded-full p-2"
                        >
                            <Ionicons
                                name="refresh-outline"
                                size={18}
                                color={isLoading ? "#9CA3AF" : "#3B82F6"}
                            />
                        </TouchableOpacity>
                    </View>
                </View>
            </View>

            {/* Content */}
            {isLoading && availableRides.length === 0 ? (
                // Loading State
                <View className="items-center py-8 px-4">
                    <Ionicons name="sync-outline" size={48} color="#9CA3AF" />
                    <Text className="text-lg text-gray-600 mt-3 mb-1 font-medium">Loading rides...</Text>
                    <Text className="text-sm text-gray-400 text-center">
                        Fetching available ride requests
                    </Text>
                </View>
            ) : availableRides.length === 0 ? (
                // Empty State
                <View className="items-center py-8 px-4">
                    <Ionicons name="time-outline" size={48} color="#9CA3AF" />
                    <Text className="text-lg text-gray-600 mt-3 mb-1 font-medium">No rides available</Text>
                    <Text className="text-sm text-gray-400 text-center">
                        New ride requests will appear here. Stay online to receive notifications.
                    </Text>
                    <TouchableOpacity
                        onPress={handleRefresh}
                        disabled={isLoading}
                        className="mt-4 bg-blue-500 px-4 py-2 rounded-lg"
                    >
                        <Text className="text-white font-medium">Refresh</Text>
                    </TouchableOpacity>
                </View>
            ) : (
                // Rides List
                <ScrollView
                    className="max-h-96"
                    contentContainerStyle={{ padding: 16 }}
                    showsVerticalScrollIndicator={false}
                >
                    {availableRides.map((ride) => (
                        <RideCard
                            key={ride.id}
                            ride={ride}
                            onAccept={() => handleAcceptRide(ride.id)}
                            onReject={() => handleRejectRide(ride.id)}
                            isAccepting={isAcceptingRide === ride.id}
                            isLoading={isLoading}
                        />
                    ))}
                </ScrollView>
            )}

            {/* Footer */}
            {availableRides.length > 0 && (
                <View className="p-4 border-t border-gray-100 bg-gray-50 rounded-b-2xl">
                    <Text className="text-xs text-gray-500 text-center">
                        Pull to refresh • Auto-updates every 30 seconds
                    </Text>
                </View>
            )}
        </View>
    );
};

export default DriverBottomSheet;