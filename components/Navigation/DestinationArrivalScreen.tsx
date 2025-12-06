import React from 'react';
import { View, Text, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import NavigationMapboxMap, { NavigationMapboxMapRef } from '@/components/NavigationMapboxMap';
import {GEOFENCE_RADIUS_METERS} from "@/hooks/navigation/types";

interface DestinationArrivalScreenProps {
    mapRef: React.RefObject<NavigationMapboxMapRef | null>;
    rideData: any;
    currentPosition: any;
    driverLocation: any;
    currentHeading: number;
    onTripComplete: () => void;
}

export const DestinationArrivalScreen: React.FC<DestinationArrivalScreenProps> = ({
                                                                                      mapRef,
                                                                                      rideData,
                                                                                      currentPosition,
                                                                                      driverLocation,
                                                                                      currentHeading,
                                                                                      onTripComplete
                                                                                  }) => (
    <View className="flex-1">
        <View className="absolute inset-0">
            <NavigationMapboxMap
                ref={mapRef}
                driverLocation={currentPosition || driverLocation}
                destination={{
                    latitude: rideData.destLat,
                    longitude: rideData.destLng
                }}
                geofenceAreas={[{
                    id: 'destination-arrival-geofence',
                    center: [rideData.destLng, rideData.destLat],
                    radius: GEOFENCE_RADIUS_METERS,
                    color: '#34A853',
                    opacity: 0.3,
                    type: 'destination'
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

        <View className="flex-1 justify-end">
            <View className="bg-white px-5 pt-6 pb-10 rounded-t-3xl shadow-lg">
                <View className="items-center mb-6">
                    <View className="w-20 h-20 rounded-full bg-green-50 items-center justify-center mb-4">
                        <Ionicons name="checkmark-circle" size={50} color="#34A853" />
                    </View>
                    <Text className="text-2xl font-bold text-gray-900 mb-2">
                        Arrived at Destination
                    </Text>
                    <Text className="text-base text-gray-600 text-center">
                        {rideData.destAddress}
                    </Text>
                </View>

                <View className="bg-gray-100 rounded-xl p-4 mb-5">
                    <Text className="text-sm text-gray-600 mb-2">
                        Trip Summary
                    </Text>
                    <View className="flex-row justify-between mb-2">
                        <Text className="text-base text-gray-900">Passenger</Text>
                        <Text className="text-base font-semibold text-gray-900">
                            {rideData.passengerName}
                        </Text>
                    </View>
                    <View className="flex-row justify-between">
                        <Text className="text-base text-gray-900">Fare</Text>
                        <Text className="text-base font-semibold text-green-600">
                            {rideData.estimatedPrice}
                        </Text>
                    </View>
                </View>

                <TouchableOpacity
                    onPress={onTripComplete}
                    className="bg-green-600 rounded-xl py-5 items-center"
                >
                    <Text className="text-white text-lg font-semibold">
                        Complete Trip
                    </Text>
                </TouchableOpacity>
            </View>
        </View>
    </View>
);
