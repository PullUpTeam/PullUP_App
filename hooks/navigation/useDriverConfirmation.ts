// hooks/navigation/useDriverConfirmation.ts
import { useState, useCallback, useRef, useEffect } from 'react';
import { Alert } from 'react-native';
import { useOnchainAttestation } from '@/hooks/blockchain/useOnchainAttestation';
import { OnchainLocationAttestation } from '@/lib/blockchain/astralSDK';

interface UseDriverConfirmationProps {
  // Geofence data
  geofenceId: string;
  geofenceType: 'pickup' | 'destination';
  location: { latitude: number; longitude: number };
  address?: string;
  
  // Confirmation settings
  confirmationTimeoutMs?: number; // Default 30 seconds
  enableOnchainAttestations?: boolean;
  
  // Callbacks
  onConfirmationReceived: (confirmed: boolean, attestation?: OnchainLocationAttestation) => void;
  onTimeoutExpired: (attestation?: OnchainLocationAttestation) => void;
}

interface ConfirmationState {
  isWaitingForConfirmation: boolean;
  timeRemaining: number;
  hasConfirmed: boolean;
  hasTimedOut: boolean;
  attestation: OnchainLocationAttestation | null;
}

export const useDriverConfirmation = ({
  geofenceId,
  geofenceType,
  location,
  address,
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
    attestation: null,
  });

  const timeoutRef = useRef<NodeJS.Timeout | null>(null);
  const intervalRef = useRef<NodeJS.Timeout | null>(null);

  // Onchain attestation hook
  const {
    createGeofenceAttestation,
    isCreatingAttestation,
    error: attestationError,
    isWalletConnected,
  } = useOnchainAttestation({
    network: 'sepolia', // Use testnet for development
    autoConfirm: false, // Always require confirmation for driver actions
  });

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
      attestation: null,
    }));

    // Create onchain attestation immediately when entering geofence
    let attestation: OnchainLocationAttestation | undefined;
    if (enableOnchainAttestations && isWalletConnected) {
      try {
        const result = await createGeofenceAttestation({
          location,
          geofenceData: {
            geofenceId,
            type: geofenceType,
            phase: geofenceType === 'pickup' ? 'at-pickup' : 'at-destination',
            address,
          },
          memo: `Driver entered ${geofenceType} geofence - awaiting passenger confirmation`,
        });

        if (result.success && result.attestation) {
          attestation = result.attestation;
          setState(prev => ({ ...prev, attestation }));
          console.log('✅ Geofence entry attestation created:', attestation.uid);
        }
      } catch (error) {
        console.error('Failed to create geofence attestation:', error);
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
          onPress: () => handleConfirmation(true, attestation),
        },
        {
          text: 'Not Yet',
          onPress: () => handleConfirmation(false, attestation),
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
        handleTimeout(attestation);
      }
    }, 1000);

    // Set timeout for automatic confirmation
    timeoutRef.current = setTimeout(() => {
      handleTimeout(attestation);
    }, confirmationTimeoutMs);

  }, [
    state.isWaitingForConfirmation,
    geofenceType,
    confirmationTimeoutMs,
    enableOnchainAttestations,
    isWalletConnected,
    createGeofenceAttestation,
    geofenceId,
    location,
    address,
  ]);

  // Handle manual confirmation
  const handleConfirmation = useCallback((confirmed: boolean, attestation?: OnchainLocationAttestation) => {
    if (state.hasConfirmed || state.hasTimedOut) return;

    console.log(`✅ Driver confirmation received: ${confirmed}`);

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
      hasConfirmed: true,
      timeRemaining: 0,
    }));

    onConfirmationReceived(confirmed, attestation);
  }, [state.hasConfirmed, state.hasTimedOut, onConfirmationReceived]);

  // Handle timeout
  const handleTimeout = useCallback((attestation?: OnchainLocationAttestation) => {
    if (state.hasConfirmed || state.hasTimedOut) return;

    console.log('⏰ Driver confirmation timed out - auto-confirming');

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
      hasTimedOut: true,
      timeRemaining: 0,
    }));

    onTimeoutExpired(attestation);
  }, [state.hasConfirmed, state.hasTimedOut, onTimeoutExpired]);

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
      attestation: null,
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
    startConfirmation,
    cancelConfirmation,
    resetConfirmation,
    isCreatingAttestation,
    attestationError,
    isWalletConnected,
  };
};