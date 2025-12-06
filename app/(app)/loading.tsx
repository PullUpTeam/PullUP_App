import React, { useEffect, useState } from 'react';
import { View, Text, ActivityIndicator } from 'react-native'; // StyleSheet removed
import { useLocalSearchParams, useRouter, Stack } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';

const LoadingScreen = () => {
    const router = useRouter();
    const params = useLocalSearchParams();
    const { price, pickupAddress, destinationAddress } = params;

    const [statusText, setStatusText] = useState('Finding your driver...');
    const [driverName, setDriverName] = useState('');
    const [driverVehicle, setDriverVehicle] = useState('');
    const [eta, setEta] = useState(10); // 5 minutes in seconds
    const [elapsedTime, setElapsedTime] = useState(0);
    const [driverFound, setDriverFound] = useState(false);

    // Timer for elapsed time
    useEffect(() => {
        const interval = setInterval(() => {
            setElapsedTime((prev) => prev + 1);
        }, 1000);
        return () => clearInterval(interval);
    }, []);

    // Simulate finding a driver
    useEffect(() => {
        const findDriverTimeout = setTimeout(() => {
            setDriverFound(true);
            setStatusText('Driver Found!');
            setDriverName('John B.');
            setDriverVehicle('Toyota Prius - ABC 123');
        }, 5000); // Simulate 5 seconds to find a driver

        return () => clearTimeout(findDriverTimeout);
    }, []);

    // Countdown timer for ETA
    useEffect(() => {
        if (driverFound && eta > 0) {
            const countdownInterval = setInterval(() => {
                setEta((prevEta) => prevEta - 1);
            }, 1000);
            return () => clearInterval(countdownInterval);
        } else if (driverFound && eta === 0) {
            console.log('Driver arrived! Navigating to trip screen...');
            router.replace({
                pathname: '/(app)/trip',
                params: {
                    price,
                    pickupAddress,
                    destinationAddress,
                    driverName,
                    driverVehicle,
                    rideId: params.rideId || 'mock-ride-id', // Pass rideId if available
                }
            });
        }
    }, [driverFound, eta, router, price, pickupAddress, destinationAddress, driverName, driverVehicle]);

    const formatTime = (totalSeconds: number) => {
        const minutes = Math.floor(totalSeconds / 60);
        const seconds = totalSeconds % 60;
        return `${minutes}:${seconds < 10 ? '0' : ''}${seconds}`;
    };

    return (
        // styles.container -> className
        <SafeAreaView className="flex-1 bg-gray-100 justify-center items-center">
            <Stack.Screen options={{ headerShown: false }} />
            {/* styles.content -> className */}
            {/* Tailwind shadows are a bit different, using shadow-lg for a similar effect. Elevation is Android-specific. */}
            <View className="p-5 bg-white rounded-lg items-center shadow-lg w-[90%]">
                {/* styles.loader -> className, color is prop */}
                <ActivityIndicator size="large" color="#007AFF" className="mb-5" />
                {/* styles.statusText -> className */}
                <Text className="text-2xl font-bold mb-4 text-gray-800 text-center">{statusText}</Text>

                {driverFound ? (
                    <View>
                        {/* styles.driverInfo -> className */}
                        <Text className="text-lg text-gray-600 mb-1 text-center">Driver: {driverName}</Text>
                        <Text className="text-lg text-gray-600 mb-1 text-center">Vehicle: {driverVehicle}</Text>
                        {/* styles.etaText -> className */}
                        <Text className="text-xl font-bold text-blue-600 mt-2 mb-5 text-center">Arriving in: {formatTime(eta)}</Text>
                    </View>
                ) : (
                    // styles.infoText -> className
                    <Text className="text-base text-gray-500 text-center mb-5">Please wait while we connect you with a nearby driver.</Text>
                )}

                {/* styles.detailsContainer -> className */}
                <View className="border-t border-gray-200 pt-4 mt-4 w-full items-center">
                    {/* styles.detailText -> className */}
                    <Text className="text-base text-gray-700 mb-2 text-center">Price: ${typeof price === 'string' ? parseFloat(price).toFixed(2) : 'N/A'}</Text>
                    <Text className="text-base text-gray-700 mb-2 text-center">From: {pickupAddress || 'Current Location'}</Text>
                    <Text className="text-base text-gray-700 mb-2 text-center">To: {destinationAddress || 'Not specified'}</Text>
                </View>

                {/* styles.elapsedTimeText -> className */}
                <Text className="mt-5 text-sm text-gray-500">Elapsed Time: {formatTime(elapsedTime)}</Text>
            </View>
        </SafeAreaView>
    );
};

// StyleSheet.create({...}) block removed

export default LoadingScreen;
