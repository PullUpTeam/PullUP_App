import React from 'react';
import { View, Text, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import NavigationMapboxMap, { NavigationMapboxMapRef } from '@/components/NavigationMapboxMap';
import {GEOFENCE_RADIUS_METERS} from "@/hooks/navigation/types";

interface PickupWaitingScreenProps {
    mapRef: React.RefObject<NavigationMapboxMapRef | null>;
    rideData: any;
    currentPosition: any;
    driverLocation: any;
    currentHeading: number;
    pickupTimer: number;
    formatTimer: (seconds: number) => string;
    onPassengerPickup: () => void;
    onBackPress: () => void;
}

export const PickupWaitingScreen: React.FC<PickupWaitingScreenProps> = ({
                                                                            mapRef,
                                                                            rideData,
                                                                            currentPosition,
                                                                            driverLocation,
                                                                            currentHeading,
                                                                            pickupTimer,
                                                                            formatTimer,
                                                                            onPassengerPickup,
                                                                            onBackPress
                                                                        }) => (
    <View className="flex-1">
        <View className="absolute inset-0">
            <NavigationMapboxMap
                ref={mapRef}
                driverLocation={currentPosition || driverLocation}
                pickup={{
                    latitude: rideData.pickupLat,
                    longitude: rideData.pickupLng
                }}
                destination={{
                    latitude: rideData.destLat,
                    longitude: rideData.destLng
                }}
                geofenceAreas={[{
                    id: 'pickup-waiting-geofence',
                    center: [rideData.pickupLng, rideData.pickupLat],
                    radius: GEOFENCE_RADIUS_METERS,
                    color: '#4285F4',
                    opacity: 0.3,
                    type: 'pickup'
                }]}
                bearing={currentHeading}
                pitch={0}
                zoomLevel={17}
                followMode="follow"
                showUserLocation={true}
                enableScrolling={true}
                mapStyle="mapbox://styles/mapbox/navigation-day-v1"
            />
        </View>

        <View className="flex-1 justify-between pt-16">
            <View className="bg-white mx-5 rounded-2xl p-5 shadow-lg">
                <View className="flex-row items-center mb-4">
                    <View className="w-16 h-16 rounded-full bg-blue-50 items-center justify-center">
                        <Ionicons name="time" size={30} color="#4285F4" />
                    </View>
                    <View className="ml-4 flex-1">
                        <Text className="text-sm text-gray-600 mb-1">
                            Waiting at pickup
                        </Text>
                        <Text className="text-2xl font-bold text-gray-900">
                            {formatTimer(pickupTimer)}
                        </Text>
                    </View>
                </View>

                <View className="border-t border-gray-200 pt-4">
                    <Text className="text-lg font-semibold text-gray-900 mb-2">
                        {rideData.passengerName}
                    </Text>
                    <View className="flex-row items-center mb-2">
                        <Ionicons name="location" size={16} color="#666" />
                        <Text className="text-sm text-gray-600 ml-2 flex-1" numberOfLines={2}>
                            {rideData.pickupAddress}
                        </Text>
                    </View>
                    <View className="flex-row items-center">
                        <Ionicons name="cash-outline" size={16} color="#666" />
                        <Text className="text-sm text-gray-600 ml-2">
                            Est. fare: {rideData.estimatedPrice}
                        </Text>
                    </View>
                </View>
            </View>

            <View className="bg-white px-5 pt-5 pb-10 rounded-t-3xl shadow-lg">
                <TouchableOpacity
                    onPress={onPassengerPickup}
                    className="bg-green-600 rounded-xl py-5 items-center mb-3"
                >
                    <Text className="text-white text-lg font-semibold">
                        Passenger Picked Up
                    </Text>
                </TouchableOpacity>

                <View className="flex-row gap-3">
                    <TouchableOpacity className="flex-1 bg-gray-100 rounded-xl py-4 items-center flex-row justify-center">
                        <Ionicons name="call" size={20} color="#4285F4" />
                        <Text className="text-blue-500 text-base font-semibold ml-2">
                            Call
                        </Text>
                    </TouchableOpacity>

                    <TouchableOpacity className="flex-1 bg-gray-100 rounded-xl py-4 items-center flex-row justify-center">
                        <Ionicons name="chatbubble" size={20} color="#4285F4" />
                        <Text className="text-blue-500 text-base font-semibold ml-2">
                            Message
                        </Text>
                    </TouchableOpacity>
                </View>

                <TouchableOpacity
                    onPress={onBackPress}
                    className="mt-3 py-3 items-center"
                >
                    <Text className="text-red-500 text-base font-medium">
                        Cancel Trip
                    </Text>
                </TouchableOpacity>
            </View>
        </View>
    </View>
);