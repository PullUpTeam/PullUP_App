import React from 'react';
import { View, Text, TouchableOpacity } from 'react-native';
import { TripPhase, TripPhaseInfo } from '@/hooks/useTripPhaseManager';

interface TripInfoProps {
    tripStatus: string;
    driverName: string;
    driverVehicle: string;
    pickupAddress: string;
    price: string;
    isLoadingRoute: boolean;
    // Real-time distance tracking props
    distance?: number | null;
    formattedDistance?: string | null;
    eta?: number | null;
    formattedEta?: string | null;
    isLoadingDistance?: boolean;
    distanceError?: string | null;
    lastUpdated?: string | null;
    onRetryDistance?: () => void;
    // Trip phase management props
    currentPhase?: TripPhase;
    phaseInfo?: TripPhaseInfo;
    shouldShowETA?: boolean;
    distanceLabel?: string;
    etaLabel?: string;
    statusMessage?: string;
}

export const TripInfo: React.FC<TripInfoProps> = ({
    tripStatus,
    driverName,
    driverVehicle,
    pickupAddress,
    price,
    isLoadingRoute,
    distance,
    formattedDistance,
    eta,
    formattedEta,
    isLoadingDistance = false,
    distanceError,
    lastUpdated,
    onRetryDistance,
    // Trip phase props
    currentPhase = 'waiting',
    phaseInfo,
    shouldShowETA = true,
    distanceLabel = 'Distance',
    etaLabel = 'ETA',
    statusMessage,
}) => {
    const formatPrice = (priceString: string): string => {
        try {
            return `${parseFloat(priceString).toFixed(2)}`;
        } catch {
            return 'N/A';
        }
    };

    const formatLastUpdated = (timestamp: string): string => {
        try {
            const date = new Date(timestamp);
            const now = new Date();
            const diffInSeconds = Math.floor((now.getTime() - date.getTime()) / 1000);
            
            if (diffInSeconds < 60) {
                return `${diffInSeconds}s ago`;
            } else if (diffInSeconds < 3600) {
                const minutes = Math.floor(diffInSeconds / 60);
                return `${minutes}m ago`;
            } else {
                const hours = Math.floor(diffInSeconds / 3600);
                return `${hours}h ago`;
            }
        } catch {
            return 'Unknown';
        }
    };

    const renderDistanceInfo = () => {
        // Don't show distance info if phase doesn't require it
        if (!phaseInfo?.showDistanceToPickup && !phaseInfo?.showDistanceToDestination) {
            return null;
        }

        if (isLoadingDistance) {
            return (
                <Text className="text-base mb-2 text-blue-600">
                    📍 Calculating {distanceLabel.toLowerCase()}...
                </Text>
            );
        }

        if (distanceError) {
            return (
                <View className="mb-2">
                    <Text className="text-base text-red-600 mb-1">
                        ⚠️ {distanceLabel} unavailable
                    </Text>
                    <Text className="text-sm text-gray-600 mb-1">
                        {distanceError}
                    </Text>
                    {onRetryDistance && (
                        <TouchableOpacity 
                            onPress={onRetryDistance}
                            className="bg-blue-500 px-3 py-1 rounded"
                        >
                            <Text className="text-white text-sm">Retry</Text>
                        </TouchableOpacity>
                    )}
                </View>
            );
        }

        if (formattedDistance) {
            return (
                <View className="mb-2">
                    <Text className="text-base font-semibold">
                        📍 {distanceLabel}: {formattedDistance}
                    </Text>
                    {formattedEta && shouldShowETA && (
                        <Text className="text-base">
                            ⏱️ {etaLabel}: {formattedEta}
                        </Text>
                    )}
                    {lastUpdated && (
                        <Text className="text-xs text-gray-500 mt-1">
                            Updated {formatLastUpdated(lastUpdated)}
                        </Text>
                    )}
                </View>
            );
        }

        return null;
    };

    const renderPhaseSpecificInfo = () => {
        if (!phaseInfo) return null;

        switch (currentPhase) {
            case 'waiting':
                return (
                    <View className="mb-2 p-3 bg-yellow-50 border border-yellow-200 rounded">
                        <Text className="text-base text-yellow-800">
                            🔍 {phaseInfo.description}
                        </Text>
                    </View>
                );
            case 'approaching_pickup':
                return (
                    <View className="mb-2 p-3 bg-blue-50 border border-blue-200 rounded">
                        <Text className="text-base text-blue-800">
                            🚗 {statusMessage || phaseInfo.description}
                        </Text>
                    </View>
                );
            case 'driver_arrived':
                return (
                    <View className="mb-2 p-3 bg-green-50 border border-green-200 rounded">
                        <Text className="text-base text-green-800 font-semibold">
                            ✅ {phaseInfo.description}
                        </Text>
                        <Text className="text-sm text-green-700 mt-1">
                            Your driver is waiting for you at the pickup location
                        </Text>
                    </View>
                );
            case 'en_route':
                return (
                    <View className="mb-2 p-3 bg-purple-50 border border-purple-200 rounded">
                        <Text className="text-base text-purple-800">
                            🛣️ {phaseInfo.description}
                        </Text>
                    </View>
                );
            case 'completed':
                return (
                    <View className="mb-2 p-3 bg-green-50 border border-green-200 rounded">
                        <Text className="text-base text-green-800 font-semibold">
                            🎉 {phaseInfo.description}
                        </Text>
                        <Text className="text-sm text-green-700 mt-1">
                            Thank you for riding with us!
                        </Text>
                    </View>
                );
            case 'cancelled':
                return (
                    <View className="mb-2 p-3 bg-red-50 border border-red-200 rounded">
                        <Text className="text-base text-red-800">
                            ❌ {phaseInfo.description}
                        </Text>
                    </View>
                );
            default:
                return null;
        }
    };

    return (
        <View className="flex-[0.3] p-4 bg-gray-50 border-t border-gray-200">
            <Text className="text-lg font-bold mb-2.5">{tripStatus}</Text>
            
            {renderPhaseSpecificInfo()}
            
            {/* Driver info - only show when driver is assigned */}
            {currentPhase !== 'waiting' && (
                <Text className="text-base mb-2">
                    Driver: {driverName || 'N/A'} ({driverVehicle || 'N/A'})
                </Text>
            )}
            
            {/* Destination info - show based on phase */}
            {(currentPhase === 'waiting' || currentPhase === 'approaching_pickup' || currentPhase === 'driver_arrived') && (
                <Text className="text-base mb-2">
                    Pickup: {pickupAddress || 'N/A'}
                </Text>
            )}
            
            <Text className="text-base mb-2">
                Est. Price: {formatPrice(price)}
            </Text>
            
            {renderDistanceInfo()}
            
            {isLoadingRoute && (
                <Text className="text-base mb-2 text-blue-600">Updating route...</Text>
            )}
        </View>
    );
};