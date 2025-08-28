// components/Navigation/NavigationLoadingStates.tsx
import React from 'react';
import { View, Text, TouchableOpacity, Alert, SafeAreaView } from 'react-native';
import { Stack } from 'expo-router';
import { LoadingScreen } from '@/components/Navigation/LoadingScreen';
import { ErrorScreen } from '@/components/Navigation/ErrorScreen';
import { NavigationPhase } from '@/hooks/navigation/types';

interface NavigationLoadingStatesProps {
    locationLoading: boolean;
    isLoading: boolean;
    route: any;
    isRouteTransitioning: boolean;
    navigationPhase: NavigationPhase;
    transitionProgress: number;
    navConfig: any;
    showRetryButton: boolean;
    hasHandledDestinationTransition: boolean;
    error: Error | null;
    phaseTransitionError: string | null;
    onRetryNavigation: () => void;
    onSkipNavigation: () => void;
    onForceReset: () => void;
    onRetryError: () => void;
    onGoBack: () => void;
}

export const NavigationLoadingStates: React.FC<NavigationLoadingStatesProps> = ({
                                                                                    locationLoading,
                                                                                    isLoading,
                                                                                    route,
                                                                                    isRouteTransitioning,
                                                                                    navigationPhase,
                                                                                    transitionProgress,
                                                                                    navConfig,
                                                                                    showRetryButton,
                                                                                    hasHandledDestinationTransition,
                                                                                    error,
                                                                                    phaseTransitionError,
                                                                                    onRetryNavigation,
                                                                                    onSkipNavigation,
                                                                                    onForceReset,
                                                                                    onRetryError,
                                                                                    onGoBack
                                                                                }) => {
    // Show loading state
    if (locationLoading || (isLoading && !route) || isRouteTransitioning) {
        let title = 'Getting Your Location...';
        let subtitle = 'Please wait while we locate you';

        if (isRouteTransitioning) {
            if (navigationPhase === 'to-destination') {
                title = 'Starting Trip to Destination';
                subtitle = 'Calculating route to drop-off location...';
            } else {
                title = 'Updating Navigation...';
                subtitle = `Transitioning to ${navigationPhase} phase`;
            }
            if (transitionProgress > 0) {
                subtitle += ` (${transitionProgress}%)`;
            }
        } else if (isLoading && !route) {
            title = 'Starting Navigation...';
            subtitle = `Calculating route to ${navConfig?.destinationName}`;
        }

        return (
            <SafeAreaView className="flex-1 bg-gray-100">
                <Stack.Screen options={{ headerShown: false }} />
                <LoadingScreen
                    title={title}
                    subtitle={subtitle}
                />
                {/* Manual retry button if stuck for too long */}
                {isRouteTransitioning && navigationPhase === 'to-destination' && showRetryButton && (
                    <View className="absolute bottom-20 left-4 right-4">
                        <View className="bg-white rounded-lg p-4 shadow-lg">
                            <Text className="text-center text-gray-600 mb-3">
                                Taking longer than expected?
                            </Text>
                            <Text className="text-center text-xs text-gray-500 mb-3">
                                Debug: isRouteTransitioning={isRouteTransitioning.toString()},
                                hasHandled={hasHandledDestinationTransition.toString()},
                                isLoading={isLoading.toString()}
                            </Text>
                            <TouchableOpacity
                                className="bg-blue-500 rounded-lg py-3 px-6 mb-2"
                                onPress={onRetryNavigation}
                            >
                                <Text className="text-white text-center font-semibold">
                                    Retry Navigation
                                </Text>
                            </TouchableOpacity>
                            <TouchableOpacity
                                className="bg-orange-500 rounded-lg py-2 px-4 mb-2"
                                onPress={onSkipNavigation}
                            >
                                <Text className="text-white text-center font-semibold text-sm">
                                    Skip Navigation
                                </Text>
                            </TouchableOpacity>
                            <TouchableOpacity
                                className="bg-red-500 rounded-lg py-2 px-4"
                                onPress={onForceReset}
                            >
                                <Text className="text-white text-center font-semibold text-sm">
                                    Force Reset
                                </Text>
                            </TouchableOpacity>
                        </View>
                    </View>
                )}
            </SafeAreaView>
        );
    }

    // Show error state
    if ((error && !route) || phaseTransitionError) {
        const errorTitle = phaseTransitionError ? 'Phase Transition Error' : 'Navigation Error';
        const errorMessage = phaseTransitionError || error?.message || 'Unknown error occurred';
        const onRetry = phaseTransitionError ? onRetryError : onRetryNavigation;

        return (
            <SafeAreaView className="flex-1 bg-gray-100">
                <Stack.Screen options={{ headerShown: false }} />
                <ErrorScreen
                    title={errorTitle}
                    message={errorMessage}
                    onRetry={onRetry}
                    onGoBack={onGoBack}
                />
            </SafeAreaView>
        );
    }

    return null;
};