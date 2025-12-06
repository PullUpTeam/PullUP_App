import React, { memo } from 'react';
import { View, Text } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

interface PassengerInfoCardProps {
    passengerName: string;
    estimatedPrice: string;
    isVisible: boolean;
}

export const PassengerInfoCard: React.FC<PassengerInfoCardProps> = memo(({
                                                                             passengerName,
                                                                             estimatedPrice,
                                                                             isVisible
                                                                         }) => {
    if (!isVisible) return null;

    return (
        <View className="absolute bottom-52 left-5 right-5 bg-white rounded-xl p-4 shadow-sm">
            <Text className="text-sm text-gray-600 mb-1">Picking up</Text>
            <Text className="text-base font-semibold text-gray-900">
                {passengerName}
            </Text>
            <View className="flex-row items-center mt-2">
                <Ionicons name="cash-outline" size={16} color="#666" />
                <Text className="text-sm text-gray-600 ml-2">
                    Estimated: {estimatedPrice || 'N/A'}
                </Text>
            </View>
        </View>
    );
});

PassengerInfoCard.displayName = 'PassengerInfoCard';