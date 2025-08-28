// hooks/useOSRMNavigation.example.tsx - Example usage of enhanced phase transition functionality
import React, { useEffect, useState } from 'react';
import { View, Text, Button, Alert } from 'react-native';
import { useOSRMNavigation } from './useOSRMNavigation';

interface NavigationCoordinates {
    latitude: number;
    longitude: number;
}

const NavigationPhaseTransitionExample: React.FC = () => {
    // Example coordinates
    const [currentPhase, setCurrentPhase] = useState<'to-pickup' | 'at-pickup' | 'to-destination'>('to-pickup');
    
    const pickupLocation: NavigationCoordinates = { latitude: 40.7128, longitude: -74.0060 };
    const destinationLocation: NavigationCoordinates = { latitude: 40.7589, longitude: -73.9851 };
    const driverLocation: NavigationCoordinates = { latitude: 40.7000, longitude: -74.0100 };

    // Initialize navigation hook with pickup as initial destination
    const navigation = useOSRMNavigation({
        origin: driverLocation,
        destination: currentPhase === 'to-pickup' ? pickupLocation : destinationLocation,
        enabled: true,
        onDestinationReached: (data) => {
            console.log('Destination reached:', data);
            if (currentPhase === 'to-pickup') {
                handlePickupComplete();
            }
        },
        onNavigationError: (error) => {
            console.error('Navigation error:', error);
            Alert.alert('Navigation Error', error.message);
        }
    });

    // Handle pickup completion and transition to destination phase
    const handlePickupComplete = async () => {
        try {
            console.log('🎯 Pickup completed, transitioning to destination phase');
            
            // Clear current route and navigation state
            navigation.clearRoute();
            
            // Update phase
            setCurrentPhase('to-destination');
            
            // Restart navigation with new destination
            await navigation.restartNavigation(pickupLocation, destinationLocation);
            
            console.log('✅ Successfully transitioned to destination navigation');
        } catch (error) {
            console.error('❌ Failed to transition to destination phase:', error);
            Alert.alert('Transition Error', 'Failed to start navigation to destination');
        }
    };

    // Handle manual phase transition (for testing)
    const handleManualTransition = async () => {
        if (currentPhase === 'to-pickup') {
            await handlePickupComplete();
        }
    };

    // Calculate route preview for destination (without starting navigation)
    const handlePreviewDestinationRoute = async () => {
        try {
            console.log('📍 Calculating destination route preview');
            const route = await navigation.calculateRouteOnly(pickupLocation, destinationLocation);
            console.log('Route preview:', {
                distance: route.distance,
                duration: route.duration,
                coordinates: route.coordinates.length
            });
            Alert.alert(
                'Route Preview', 
                `Distance: ${navigation.formatDistance(route.distance)}\nDuration: ${navigation.formatDuration(route.duration)}`
            );
        } catch (error) {
            console.error('❌ Failed to calculate route preview:', error);
            Alert.alert('Preview Error', 'Failed to calculate route preview');
        }
    };

    // Start initial navigation
    const handleStartNavigation = async () => {
        try {
            await navigation.startNavigation();
        } catch (error) {
            console.error('❌ Failed to start navigation:', error);
        }
    };

    return (
        <View style={{ padding: 20 }}>
            <Text style={{ fontSize: 18, fontWeight: 'bold', marginBottom: 20 }}>
                Navigation Phase Transition Example
            </Text>
            
            <Text style={{ marginBottom: 10 }}>
                Current Phase: {currentPhase}
            </Text>
            
            <Text style={{ marginBottom: 10 }}>
                Is Navigating: {navigation.isNavigating ? 'Yes' : 'No'}
            </Text>
            
            <Text style={{ marginBottom: 10 }}>
                Is Loading: {navigation.isLoading ? 'Yes' : 'No'}
            </Text>
            
            <Text style={{ marginBottom: 10 }}>
                Is Transitioning: {navigation.isTransitioning ? 'Yes' : 'No'}
            </Text>
            
            {navigation.error && (
                <Text style={{ color: 'red', marginBottom: 10 }}>
                    Error: {navigation.error.message}
                </Text>
            )}
            
            {navigation.route && (
                <Text style={{ marginBottom: 10 }}>
                    Route Distance: {navigation.formatDistance(navigation.route.distance)}
                </Text>
            )}
            
            {navigation.currentInstruction && (
                <Text style={{ marginBottom: 10 }}>
                    Current Instruction: {navigation.currentInstruction.text}
                </Text>
            )}
            
            <View style={{ gap: 10 }}>
                <Button
                    title="Start Navigation"
                    onPress={handleStartNavigation}
                    disabled={navigation.isNavigating || navigation.isLoading}
                />
                
                <Button
                    title="Simulate Pickup Complete"
                    onPress={handleManualTransition}
                    disabled={currentPhase !== 'to-pickup' || navigation.isTransitioning}
                />
                
                <Button
                    title="Preview Destination Route"
                    onPress={handlePreviewDestinationRoute}
                    disabled={navigation.isLoading}
                />
                
                <Button
                    title="Clear Route"
                    onPress={navigation.clearRoute}
                    disabled={!navigation.route}
                />
                
                <Button
                    title="Stop Navigation"
                    onPress={navigation.stopNavigation}
                    disabled={!navigation.isNavigating}
                />
                
                {navigation.error && navigation.retryCount < 3 && (
                    <Button
                        title={`Retry Navigation (${navigation.retryCount}/3)`}
                        onPress={navigation.retryNavigation}
                        disabled={navigation.isLoading}
                    />
                )}
            </View>
            
            <View style={{ marginTop: 20 }}>
                <Text style={{ fontWeight: 'bold' }}>Enhanced Features:</Text>
                <Text>• Route clearing for phase transitions</Text>
                <Text>• Navigation service restart capability</Text>
                <Text>• Transition-aware route calculation</Text>
                <Text>• Enhanced error handling with retry logic</Text>
                <Text>• Transition state tracking</Text>
            </View>
        </View>
    );
};

export default NavigationPhaseTransitionExample;