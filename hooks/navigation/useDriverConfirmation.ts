// hooks/navigation/useDriverConfirmation.ts
import { useState, useCallback, useRef, useEffect } from 'react';
import { Alert } from 'react-native';
import { useOnchainAttestation } from '@/hooks/blockchain/useOnchainAttestation';
import { OnchainLocationAttestation, RideAttestations } from '@/lib/blockchain/astralSDK';

interface UseDriverConfirmationProps {
  // Geofence data
  geofenceId: string;
  geofenceType: 'pickup' | 'destination';
  location: { latitude: number; longitude: number };
  address?: string;

  // Ride context for attestations
  rideId?: string;
  driverId?: string;
  passengerId?: string;

  // Confirmation settings
  confirmationTimeoutMs?: number; // Default 30 seconds
  enableOnchainAttestations?: boolean;

  // Callbacks - now includes both entry and confirmation attestations
  onConfirmationReceived: (
    confirmed: boolean,
    entryAttestation?: OnchainLocationAttestation,
    confirmationAttestation?: OnchainLocationAttestation
  ) => void;
  onTimeoutExpired: (
    entryAttestation?: OnchainLocationAttestation,
    confirmationAttestation?: OnchainLocationAttestation
  ) => void;
}

interface ConfirmationState {
  isWaitingForConfirmation: boolean;
  timeRemaining: number;
  hasConfirmed: boolean;
  hasTimedOut: boolean;
  entryAttestation: OnchainLocationAttestation | null;      // Geofence entry attestation
  confirmationAttestation: OnchainLocationAttestation | null; // Pickup/dropoff confirmation attestation
}

export const useDriverConfirmation = ({
  geofenceId,
  geofenceType,
  location,
  address,
  rideId,
  driverId,
  passengerId,
  confirmationTimeoutMs = 30000, // 30 seconds default
  enableOnchainAttestations = false,
  onConfirmationReceived,
  onTimeoutExpired,
}: UseDriverConfirmationProps) => {

  const [state, setState] = useState<ConfirmationState>({
    isWaitingForConfirmation: false,
    timeRemaining: 0,
    hasConfirmed: false,
    hasTimedOut: false,
    entryAttestation: null,
    confirmationAttestation: null,
  });

  const timeoutRef = useRef<NodeJS.Timeout | null>(null);
  const intervalRef = useRef<NodeJS.Timeout | null>(null);

  // Onchain attestation hook - with new methods for different event types
  const {
    createGeofenceEntryAttestation,
    createPickupConfirmationAttestation,
    createDropoffConfirmationAttestation,
    isCreatingAttestation,
    error: attestationError,
    isWalletConnected,
    rideAttestations,
  } = useOnchainAttestation({
    network: 'sepolia', // Use testnet for development
    autoConfirm: true, // Auto-confirm for smoother UX during ride
  });

  // Attestation input helper
  const getAttestationInput = useCallback(() => ({
    location,
    geofenceData: {
      geofenceId,
      type: geofenceType,
      phase: geofenceType === 'pickup' ? 'at-pickup' : 'at-destination',
      address,
    },
    rideId,
    driverId,
    passengerId,
  }), [location, geofenceId, geofenceType, address, rideId, driverId, passengerId]);

  // Start confirmation process
  const startConfirmation = useCallback(async () => {
    if (state.isWaitingForConfirmation) return;

    console.log(`🚗 Starting driver confirmation for ${geofenceType} geofence`);

    setState(prev => ({
      ...prev,
      isWaitingForConfirmation: true,
      timeRemaining: confirmationTimeoutMs / 1000,
      hasConfirmed: false,
      hasTimedOut: false,
      entryAttestation: null,
      confirmationAttestation: null,
    }));

    // Create geofence ENTRY attestation immediately when entering geofence
    let entryAttestation: OnchainLocationAttestation | undefined;
    if (enableOnchainAttestations && isWalletConnected) {
      try {
        const result = await createGeofenceEntryAttestation(getAttestationInput());

        if (result.success && result.attestation) {
          entryAttestation = result.attestation;
          setState(prev => ({ ...prev, entryAttestation }));
          console.log(`✅ ${geofenceType} geofence entry attestation created:`, entryAttestation.uid);
        }
      } catch (error) {
        console.error('Failed to create geofence entry attestation:', error);
      }
    }

    // Show confirmation dialog to passenger
    Alert.alert(
      geofenceType === 'pickup' ? 'Driver Arrived' : 'Destination Reached',
      geofenceType === 'pickup'
        ? 'Your driver has arrived at the pickup location. Are you getting in the car?'
        : 'Your driver has reached the destination. Please confirm completion.',
      [
        {
          text: 'Yes',
          onPress: () => handleConfirmation(true, entryAttestation),
        },
        {
          text: 'Not Yet',
          onPress: () => handleConfirmation(false, entryAttestation),
        },
      ],
      { cancelable: false }
    );

    // Start countdown timer
    let timeLeft = confirmationTimeoutMs / 1000;
    intervalRef.current = setInterval(() => {
      timeLeft -= 1;
      setState(prev => ({ ...prev, timeRemaining: timeLeft }));

      if (timeLeft <= 0) {
        handleTimeout(entryAttestation);
      }
    }, 1000);

    // Set timeout for automatic confirmation
    timeoutRef.current = setTimeout(() => {
      handleTimeout(entryAttestation);
    }, confirmationTimeoutMs);

  }, [
    state.isWaitingForConfirmation,
    geofenceType,
    confirmationTimeoutMs,
    enableOnchainAttestations,
    isWalletConnected,
    createGeofenceEntryAttestation,
    getAttestationInput,
  ]);

  // Handle manual confirmation - creates CONFIRMATION attestation
  const handleConfirmation = useCallback(async (
    confirmed: boolean,
    entryAttestation?: OnchainLocationAttestation
  ) => {
    if (state.hasConfirmed || state.hasTimedOut) return;

    console.log(`✅ Passenger confirmation received: ${confirmed}`);

    // Clear timers
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
    }
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }

    // Create CONFIRMATION attestation if passenger confirmed and attestations are enabled
    let confirmationAttestation: OnchainLocationAttestation | undefined;
    if (confirmed && enableOnchainAttestations && isWalletConnected) {
      try {
        const attestationInput = getAttestationInput();

        // Use appropriate confirmation method based on geofence type
        const result = geofenceType === 'pickup'
          ? await createPickupConfirmationAttestation(attestationInput, false)
          : await createDropoffConfirmationAttestation(attestationInput, false);

        if (result.success && result.attestation) {
          confirmationAttestation = result.attestation;
          console.log(`✅ ${geofenceType} confirmation attestation created:`, confirmationAttestation.uid);
        }
      } catch (error) {
        console.error('Failed to create confirmation attestation:', error);
      }
    }

    setState(prev => ({
      ...prev,
      isWaitingForConfirmation: false,
      hasConfirmed: true,
      timeRemaining: 0,
      confirmationAttestation: confirmationAttestation ?? null,
    }));

    onConfirmationReceived(confirmed, entryAttestation, confirmationAttestation);
  }, [
    state.hasConfirmed,
    state.hasTimedOut,
    enableOnchainAttestations,
    isWalletConnected,
    geofenceType,
    getAttestationInput,
    createPickupConfirmationAttestation,
    createDropoffConfirmationAttestation,
    onConfirmationReceived,
  ]);

  // Handle timeout - creates AUTO-CONFIRMATION attestation
  const handleTimeout = useCallback(async (entryAttestation?: OnchainLocationAttestation) => {
    if (state.hasConfirmed || state.hasTimedOut) return;

    console.log('⏰ Passenger confirmation timed out - auto-confirming');

    // Clear timers
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
    }
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }

    // Create AUTO-CONFIRMATION attestation
    let confirmationAttestation: OnchainLocationAttestation | undefined;
    if (enableOnchainAttestations && isWalletConnected) {
      try {
        const attestationInput = getAttestationInput();

        // Use appropriate auto-confirmation method based on geofence type
        const result = geofenceType === 'pickup'
          ? await createPickupConfirmationAttestation(attestationInput, true) // isAutoConfirmed = true
          : await createDropoffConfirmationAttestation(attestationInput, true);

        if (result.success && result.attestation) {
          confirmationAttestation = result.attestation;
          console.log(`✅ ${geofenceType} auto-confirmation attestation created:`, confirmationAttestation.uid);
        }
      } catch (error) {
        console.error('Failed to create auto-confirmation attestation:', error);
      }
    }

    setState(prev => ({
      ...prev,
      isWaitingForConfirmation: false,
      hasTimedOut: true,
      timeRemaining: 0,
      confirmationAttestation: confirmationAttestation ?? null,
    }));

    onTimeoutExpired(entryAttestation, confirmationAttestation);
  }, [
    state.hasConfirmed,
    state.hasTimedOut,
    enableOnchainAttestations,
    isWalletConnected,
    geofenceType,
    getAttestationInput,
    createPickupConfirmationAttestation,
    createDropoffConfirmationAttestation,
    onTimeoutExpired,
  ]);

  // Cancel confirmation process
  const cancelConfirmation = useCallback(() => {
    console.log('❌ Driver confirmation cancelled');

    // Clear timers
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
    }
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }

    setState(prev => ({
      ...prev,
      isWaitingForConfirmation: false,
      timeRemaining: 0,
    }));
  }, []);

  // Reset state for new confirmation
  const resetConfirmation = useCallback(() => {
    setState({
      isWaitingForConfirmation: false,
      timeRemaining: 0,
      hasConfirmed: false,
      hasTimedOut: false,
      entryAttestation: null,
      confirmationAttestation: null,
    });
  }, []);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
      }
    };
  }, []);

  return {
    ...state,
    // Legacy: single attestation property for backward compatibility
    attestation: state.confirmationAttestation ?? state.entryAttestation,
    // Actions
    startConfirmation,
    cancelConfirmation,
    resetConfirmation,
    // Attestation state
    isCreatingAttestation,
    attestationError,
    isWalletConnected,
    rideAttestations,
  };
};