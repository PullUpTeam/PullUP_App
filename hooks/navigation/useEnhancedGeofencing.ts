// hooks/navigation/useEnhancedGeofencing.ts
import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { getDistance } from 'geolib';
import { GEOFENCE_CHECK_INTERVAL, GEOFENCE_RADIUS_METERS, NavigationPhase } from "@/hooks/navigation/types";
import { useDriverConfirmation } from '@/hooks/navigation/useDriverConfirmation';
import { OnchainLocationAttestation } from '@/lib/blockchain/astralSDK';

interface UseEnhancedGeofencingProps {
    driverLocation: { latitude: number; longitude: number } | null;
    pickupLocation: { latitude: number; longitude: number };
    destinationLocation: { latitude: number; longitude: number };
    pickupAddress?: string;
    destinationAddress?: string;
    navigationPhase: NavigationPhase;
    
    // Callbacks for geofence entry (triggers confirmation flow)
    onEnterPickupGeofence: () => void;
    onEnterDestinationGeofence: () => void;
    
    // Callbacks for passenger confirmation
    onPassengerConfirmation: (type: 'pickup' | 'destination', confirmed: boolean, attestation?: OnchainLocationAttestation) => void;
    onConfirmationTimeout: (type: 'pickup' | 'destination', attestation?: OnchainLocationAttestation) => void;
    
    // Onchain attestation settings
    enableOnchainAttestations?: boolean;
    confirmationTimeoutMs?: number;
}

interface GeofenceVisibility {
    showPickupGeofence: boolean;
    showDestinationGeofence: boolean;
}

interface GeofenceState {
    pickup: {
        attestation: OnchainLocationAttestation | null;
        isWaitingForConfirmation: boolean;
        hasConfirmed: boolean;
        timeRemaining: number;
    };
    destination: {
        attestation: OnchainLocationAttestation | null;
        isWaitingForConfirmation: boolean;
        hasConfirmed: boolean;
        timeRemaining: number;
    };
}

export const useEnhancedGeofencing = ({
    driverLocation,
    pickupLocation,
    destinationLocation,
    pickupAddress,
    destinationAddress,
    navigationPhase,
    onEnterPickupGeofence,
    onEnterDestinationGeofence,
    onPassengerConfirmation,
    onConfirmationTimeout,
    enableOnchainAttestations = false,
    confirmationTimeoutMs = 30000,
}: UseEnhancedGeofencingProps) => {
    const [isInPickupGeofence, setIsInPickupGeofence] = useState(false);
    const [isInDestinationGeofence, setIsInDestinationGeofence] = useState(false);
    const [geofenceState, setGeofenceState] = useState<GeofenceState>({
        pickup: {
            attestation: null,
            isWaitingForConfirmation: false,
            hasConfirmed: false,
            timeRemaining: 0,
        },
        destination: {
            attestation: null,
            isWaitingForConfirmation: false,
            hasConfirmed: false,
            timeRemaining: 0,
        },
    });

    // Stable IDs for geofences to prevent infinite re-renders
    const pickupGeofenceId = useMemo(() => `pickup-${pickupLocation.latitude}-${pickupLocation.longitude}`, [pickupLocation.latitude, pickupLocation.longitude]);
    const destinationGeofenceId = useMemo(() => `destination-${destinationLocation.latitude}-${destinationLocation.longitude}`, [destinationLocation.latitude, destinationLocation.longitude]);

    // Stable callback functions to prevent infinite re-renders
    const onPickupConfirmationReceived = useCallback((confirmed: boolean, attestation?: OnchainLocationAttestation) => {
        setGeofenceState(prev => ({
            ...prev,
            pickup: {
                ...prev.pickup,
                hasConfirmed: true,
                isWaitingForConfirmation: false,
                attestation: attestation || prev.pickup.attestation,
            },
        }));
        onPassengerConfirmation('pickup', confirmed, attestation);
    }, [onPassengerConfirmation]);

    const onPickupTimeoutExpired = useCallback((attestation?: OnchainLocationAttestation) => {
        setGeofenceState(prev => ({
            ...prev,
            pickup: {
                ...prev.pickup,
                isWaitingForConfirmation: false,
                attestation: attestation || prev.pickup.attestation,
            },
        }));
        onConfirmationTimeout('pickup', attestation);
    }, [onConfirmationTimeout]);

    const onDestinationConfirmationReceived = useCallback((confirmed: boolean, attestation?: OnchainLocationAttestation) => {
        setGeofenceState(prev => ({
            ...prev,
            destination: {
                ...prev.destination,
                hasConfirmed: true,
                isWaitingForConfirmation: false,
                attestation: attestation || prev.destination.attestation,
            },
        }));
        onPassengerConfirmation('destination', confirmed, attestation);
    }, [onPassengerConfirmation]);

    const onDestinationTimeoutExpired = useCallback((attestation?: OnchainLocationAttestation) => {
        setGeofenceState(prev => ({
            ...prev,
            destination: {
                ...prev.destination,
                isWaitingForConfirmation: false,
                attestation: attestation || prev.destination.attestation,
            },
        }));
        onConfirmationTimeout('destination', attestation);
    }, [onConfirmationTimeout]);

    // Driver confirmation hooks for pickup and destination
    const pickupConfirmation = useDriverConfirmation({
        geofenceId: pickupGeofenceId,
        geofenceType: 'pickup',
        location: pickupLocation,
        address: pickupAddress,
        confirmationTimeoutMs,
        enableOnchainAttestations,
        onConfirmationReceived: onPickupConfirmationReceived,
        onTimeoutExpired: onPickupTimeoutExpired,
    });

    const destinationConfirmation = useDriverConfirmation({
        geofenceId: destinationGeofenceId,
        geofenceType: 'destination',
        location: destinationLocation,
        address: destinationAddress,
        confirmationTimeoutMs,
        enableOnchainAttestations,
        onConfirmationReceived: onDestinationConfirmationReceived,
        onTimeoutExpired: onDestinationTimeoutExpired,
    });

    // Memoize geofence visibility to prevent unnecessary recalculations
    const geofenceVisibility = useMemo<GeofenceVisibility>(() => {
        switch (navigationPhase) {
            case 'to-pickup':
            case 'at-pickup':
                return {
                    showPickupGeofence: true,
                    showDestinationGeofence: false
                };
            case 'picking-up':
                return {
                    showPickupGeofence: false,
                    showDestinationGeofence: false
                };
            case 'to-destination':
            case 'at-destination':
                return {
                    showPickupGeofence: false,
                    showDestinationGeofence: true
                };
            case 'completed':
                return {
                    showPickupGeofence: false,
                    showDestinationGeofence: false
                };
            default:
                return {
                    showPickupGeofence: false,
                    showDestinationGeofence: false
                };
        }
    }, [navigationPhase]);

    const geofenceCheckInterval = useRef<number | null>(null);
    const hasEnteredPickup = useRef(false);
    const hasEnteredDestination = useRef(false);

    // Enhanced callbacks that trigger confirmation flow
    const stableOnEnterPickup = useCallback(async () => {
        if (!hasEnteredPickup.current) {
            hasEnteredPickup.current = true;
            onEnterPickupGeofence();

            // Update state to show waiting for confirmation
            setGeofenceState(prev => ({
                ...prev,
                pickup: {
                    ...prev.pickup,
                    isWaitingForConfirmation: true,
                },
            }));

            // Start the driver confirmation process
            await pickupConfirmation.startConfirmation();
        }
    }, [onEnterPickupGeofence, pickupConfirmation]);

    const stableOnEnterDestination = useCallback(async () => {
        if (!hasEnteredDestination.current) {
            hasEnteredDestination.current = true;
            onEnterDestinationGeofence();

            // Update state to show waiting for confirmation
            setGeofenceState(prev => ({
                ...prev,
                destination: {
                    ...prev.destination,
                    isWaitingForConfirmation: true,
                },
            }));

            // Start the driver confirmation process
            await destinationConfirmation.startConfirmation();
        }
    }, [onEnterDestinationGeofence, destinationConfirmation]);

    // Reset flags when phase changes
    useEffect(() => {
        if (navigationPhase === 'to-pickup') {
            hasEnteredPickup.current = false;
            pickupConfirmation.resetConfirmation();
        } else if (navigationPhase === 'to-destination') {
            hasEnteredDestination.current = false;
            destinationConfirmation.resetConfirmation();
        } else if (navigationPhase === 'completed') {
            hasEnteredPickup.current = false;
            hasEnteredDestination.current = false;
            setIsInPickupGeofence(false);
            setIsInDestinationGeofence(false);
            pickupConfirmation.resetConfirmation();
            destinationConfirmation.resetConfirmation();
        }
    }, [navigationPhase, pickupConfirmation, destinationConfirmation]);

    // Main geofence checking logic (same as original)
    useEffect(() => {
        if (!driverLocation) {
            return;
        }

        const checkGeofences = () => {
            // Only check pickup geofence if it should be visible and we're in the right phase
            if (geofenceVisibility.showPickupGeofence && navigationPhase === 'to-pickup') {
                const distanceToPickup = getDistance(driverLocation, pickupLocation);
                const nowInPickupGeofence = distanceToPickup <= GEOFENCE_RADIUS_METERS;

                if (nowInPickupGeofence !== isInPickupGeofence) {
                    setIsInPickupGeofence(nowInPickupGeofence);

                    if (nowInPickupGeofence) {
                        console.log('📍 Entered pickup geofence - Distance:', distanceToPickup, 'meters');
                        stableOnEnterPickup();
                    }
                }
            }

            // Only check destination geofence if it should be visible and we're in the right phase
            if (geofenceVisibility.showDestinationGeofence && navigationPhase === 'to-destination') {
                const distanceToDestination = getDistance(driverLocation, destinationLocation);
                const nowInDestinationGeofence = distanceToDestination <= GEOFENCE_RADIUS_METERS;

                if (nowInDestinationGeofence !== isInDestinationGeofence) {
                    setIsInDestinationGeofence(nowInDestinationGeofence);

                    if (nowInDestinationGeofence) {
                        console.log('📍 Entered destination geofence - Distance:', distanceToDestination, 'meters');
                        stableOnEnterDestination();
                    }
                }
            }
        };

        // Clear existing interval
        if (geofenceCheckInterval.current) {
            clearInterval(geofenceCheckInterval.current);
        }

        // Set up new interval
        geofenceCheckInterval.current = setInterval(checkGeofences, GEOFENCE_CHECK_INTERVAL) as unknown as number;

        // Check immediately
        checkGeofences();

        return () => {
            if (geofenceCheckInterval.current) {
                clearInterval(geofenceCheckInterval.current);
                geofenceCheckInterval.current = null;
            }
        };
    }, [
        driverLocation,
        navigationPhase,
        geofenceVisibility.showPickupGeofence,
        geofenceVisibility.showDestinationGeofence,
        isInPickupGeofence,
        isInDestinationGeofence,
        pickupLocation.latitude,
        pickupLocation.longitude,
        destinationLocation.latitude,
        destinationLocation.longitude,
        stableOnEnterPickup,
        stableOnEnterDestination
    ]);

    // Clear geofence states when they should not be visible
    useEffect(() => {
        if (!geofenceVisibility.showPickupGeofence && isInPickupGeofence) {
            setIsInPickupGeofence(false);
        }
        if (!geofenceVisibility.showDestinationGeofence && isInDestinationGeofence) {
            setIsInDestinationGeofence(false);
        }
    }, [geofenceVisibility.showPickupGeofence, geofenceVisibility.showDestinationGeofence, isInPickupGeofence, isInDestinationGeofence]);

    // Cleanup function
    const cleanup = useCallback(() => {
        if (geofenceCheckInterval.current) {
            clearInterval(geofenceCheckInterval.current);
            geofenceCheckInterval.current = null;
        }
        setIsInPickupGeofence(false);
        setIsInDestinationGeofence(false);
        hasEnteredPickup.current = false;
        hasEnteredDestination.current = false;
    }, []);

    // Cleanup on unmount
    useEffect(() => {
        return cleanup;
    }, [cleanup]);

    // Manual confirmation trigger
    const triggerManualConfirmation = useCallback(async (type: 'pickup' | 'destination') => {
        if (type === 'pickup') {
            await pickupConfirmation.startConfirmation();
        } else {
            await destinationConfirmation.startConfirmation();
        }
    }, [pickupConfirmation, destinationConfirmation]);

    // Cancel confirmation
    const cancelConfirmation = useCallback((type: 'pickup' | 'destination') => {
        if (type === 'pickup') {
            pickupConfirmation.cancelConfirmation();
        } else {
            destinationConfirmation.cancelConfirmation();
        }
        
        setGeofenceState(prev => ({
            ...prev,
            [type]: {
                ...prev[type],
                isWaitingForConfirmation: false,
            },
        }));
    }, [pickupConfirmation, destinationConfirmation]);

    // Sync confirmation state with geofence state
    useEffect(() => {
        setGeofenceState(prev => ({
            ...prev,
            pickup: {
                ...prev.pickup,
                isWaitingForConfirmation: pickupConfirmation.isWaitingForConfirmation,
                hasConfirmed: pickupConfirmation.hasConfirmed,
                timeRemaining: pickupConfirmation.timeRemaining,
                attestation: pickupConfirmation.attestation || prev.pickup.attestation,
            },
            destination: {
                ...prev.destination,
                isWaitingForConfirmation: destinationConfirmation.isWaitingForConfirmation,
                hasConfirmed: destinationConfirmation.hasConfirmed,
                timeRemaining: destinationConfirmation.timeRemaining,
                attestation: destinationConfirmation.attestation || prev.destination.attestation,
            },
        }));
    }, [
        pickupConfirmation.isWaitingForConfirmation,
        pickupConfirmation.hasConfirmed,
        pickupConfirmation.timeRemaining,
        pickupConfirmation.attestation,
        destinationConfirmation.isWaitingForConfirmation,
        destinationConfirmation.hasConfirmed,
        destinationConfirmation.timeRemaining,
        destinationConfirmation.attestation,
    ]);

    return {
        // Original geofencing functionality
        isInPickupGeofence,
        isInDestinationGeofence,
        geofenceVisibility,
        cleanup,
        
        // Enhanced confirmation functionality
        geofenceState,
        triggerManualConfirmation,
        cancelConfirmation,
        
        // Attestation status
        isCreatingAttestation: pickupConfirmation.isCreatingAttestation || destinationConfirmation.isCreatingAttestation,
        attestationError: pickupConfirmation.attestationError || destinationConfirmation.attestationError,
        isWalletConnected: pickupConfirmation.isWalletConnected,
        enableOnchainAttestations,
    };
};