import React, { memo, useMemo } from 'react';
import { View, Text, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { NavigationPhase } from "@/hooks/navigation/types";

interface PhaseIndicatorBannerProps {
    navigationPhase: NavigationPhase;
    pickupAddress: string;
    destinationAddress: string;
    onClose: () => void;
}

export const PhaseIndicatorBanner: React.FC<PhaseIndicatorBannerProps> = memo(({
                                                                                   navigationPhase,
                                                                                   pickupAddress,
                                                                                   destinationAddress,
                                                                                   onClose
                                                                               }) => {
    const bannerConfig = useMemo(() => {
        const isPickupPhase = navigationPhase === 'to-pickup';

        return {
            isPickupPhase,
            backgroundColor: isPickupPhase ? 'bg-blue-500' : 'bg-green-600',
            iconName: isPickupPhase ? 'person' : 'location',
            title: isPickupPhase ? 'Going to Pickup' : 'Going to Destination',
            address: isPickupPhase ? pickupAddress : destinationAddress
        };
    }, [navigationPhase, pickupAddress, destinationAddress]);

    return (
        <View className={`absolute top-16 left-5 right-5 ${bannerConfig.backgroundColor} rounded-xl p-3 shadow-lg flex-row items-center justify-between`}>
            <View className="flex-row items-center flex-1">
                <Ionicons
                    name={bannerConfig.iconName as any}
                    size={24}
                    color="white"
                />
                <View className="ml-3 flex-1">
                    <Text className="text-white text-sm font-semibold">
                        {bannerConfig.title}
                    </Text>
                    <Text className="text-white/90 text-xs mt-1" numberOfLines={1}>
                        {bannerConfig.address}
                    </Text>
                </View>
            </View>
            <TouchableOpacity
                onPress={onClose}
                className="bg-black/20 rounded-full p-2"
            >
                <Ionicons name="close" size={20} color="white" />
            </TouchableOpacity>
        </View>
    );
});

PhaseIndicatorBanner.displayName = 'PhaseIndicatorBanner';