// hooks/blockchain/useOnchainAttestation.ts
import { useState, useCallback } from 'react';
import { Alert } from 'react-native';
import { useAuthContext } from '@/context/AuthContext';
import {
  OnchainLocationAttestation,
  SUPPORTED_NETWORKS,
  GeofenceAttestationInput,
  AttestationResult,
  AttestationEventType,
  RideAttestations,
  createAstralWalletClient,
  initializeAstralSDK
} from '@/lib/blockchain/astralSDK';
import { type Address } from 'viem';

interface UseOnchainAttestationOptions {
  network?: keyof typeof SUPPORTED_NETWORKS;
  autoConfirm?: boolean;
}

interface AttestationState {
  isCreating: boolean;
  lastAttestation: OnchainLocationAttestation | null;
  error: string | null;
  rideAttestations: RideAttestations;
}

const initialRideAttestations: RideAttestations = {
  pickupEntry: null,
  pickupConfirmed: null,
  dropoffEntry: null,
  dropoffConfirmed: null,
};

export const useOnchainAttestation = (options: UseOnchainAttestationOptions = {}) => {
  const { network = 'sepolia', autoConfirm = false } = options;
  const { isAuthenticated, walletAddress, dynamicUser } = useAuthContext();
  
  const [state, setState] = useState<AttestationState>({
    isCreating: false,
    lastAttestation: null,
    error: null,
    rideAttestations: initialRideAttestations,
  });

  const createGeofenceAttestation = useCallback(async (
    input: GeofenceAttestationInput
  ): Promise<AttestationResult> => {
    if (!isAuthenticated || !walletAddress) {
      Alert.alert('Wallet Required', 'Please connect your wallet to create onchain attestations');
      return { success: false, error: 'Wallet not connected' };
    }

    setState(prev => ({ ...prev, isCreating: true, error: null }));

    try {
      // Use wallet address from auth context
      const address = walletAddress as Address;
      if (!address) {
        throw new Error('Wallet address not available');
      }

      // Create wallet client using viem
      const walletClient = createAstralWalletClient(network, address);
      
      // Initialize Astral SDK
      const sdk = initializeAstralSDK(walletClient, network);

      // Determine event type for memo
      const eventType = input.eventType || 'geofence_entry';
      const eventDescription = getEventDescription(eventType, input.geofenceData.type);

      // Prepare attestation input for Astral SDK
      const attestationInput = {
        location: {
          type: 'Point' as const,
          coordinates: [input.location.longitude, input.location.latitude] as [number, number],
          properties: {
            name: input.geofenceData.address || `${input.geofenceData.type} location`,
            type: input.geofenceData.type,
            geofenceId: input.geofenceData.geofenceId,
            phase: input.geofenceData.phase,
            eventType,
            rideId: input.rideId,
            driverId: input.driverId,
            passengerId: input.passengerId,
          },
        },
        memo: input.memo || `${eventDescription} - ${input.geofenceData.address || 'Unknown location'}`,
        timestamp: new Date(),
        revocable: true,
      };

      // Show confirmation dialog unless auto-confirm is enabled
      if (!autoConfirm) {
        const networkConfig = SUPPORTED_NETWORKS[network];
        const confirmed = await new Promise<boolean>((resolve) => {
          Alert.alert(
            'Create Onchain Attestation',
            `This will create a permanent blockchain record:\n\n${eventDescription}\n\nNetwork: ${networkConfig.name}\nEstimated cost: ~$0.01-0.10`,
            [
              { text: 'Cancel', onPress: () => resolve(false) },
              { text: 'Confirm', onPress: () => resolve(true) },
            ]
          );
        });

        if (!confirmed) {
          setState(prev => ({ ...prev, isCreating: false }));
          return { success: false, error: 'User cancelled' };
        }
      }

      // Create the attestation using Astral SDK
      const attestation = await sdk.createOnchainLocationAttestation(attestationInput);

      // Update ride attestations based on event type
      const updatedRideAttestations = updateRideAttestations(
        state.rideAttestations,
        eventType,
        input.geofenceData.type,
        attestation
      );

      setState(prev => ({
        ...prev,
        isCreating: false,
        lastAttestation: attestation,
        error: null,
        rideAttestations: updatedRideAttestations,
      }));

      // Show success notification
      Alert.alert(
        'Attestation Created!',
        `Successfully created onchain proof:\n${eventDescription}\n\nTransaction: ${attestation.txHash.slice(0, 10)}...`,
        [
          {
            text: 'View on Explorer',
            onPress: () => {
              const explorerUrl = network === 'sepolia' 
                ? `https://sepolia.etherscan.io/tx/${attestation.txHash}`
                : network === 'base'
                ? `https://basescan.org/tx/${attestation.txHash}`
                : `https://arbiscan.io/tx/${attestation.txHash}`;
              console.log(explorerUrl);
            },
          },
          { text: 'OK' },
        ]
      );

      return { success: true, attestation };
    } catch (error) {
      console.error('Failed to create attestation:', error);
      const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
      
      setState(prev => ({
        ...prev,
        isCreating: false,
        error: errorMessage,
      }));

      Alert.alert('Attestation Failed', errorMessage);
      return { success: false, error: errorMessage };
    }
  }, [isAuthenticated, walletAddress, network, autoConfirm]);

  const verifyAttestation = useCallback(async (attestation: OnchainLocationAttestation) => {
    if (!isAuthenticated || !walletAddress) return null;

    try {
      const address = walletAddress as Address;
      if (!address) return null;

      // Create wallet client using viem
      const walletClient = createAstralWalletClient(network, address);
      
      // Initialize Astral SDK
      const sdk = initializeAstralSDK(walletClient, network);

      return await sdk.verifyOnchainLocationAttestation(attestation);
    } catch (error) {
      console.error('Failed to verify attestation:', error);
      return null;
    }
  }, [isAuthenticated, walletAddress, network]);

  // Create pickup confirmation attestation
  const createPickupConfirmationAttestation = useCallback(async (
    input: Omit<GeofenceAttestationInput, 'eventType'>,
    isAutoConfirmed: boolean = false
  ): Promise<AttestationResult> => {
    const eventType: AttestationEventType = isAutoConfirmed ? 'pickup_auto' : 'pickup_confirmed';
    return createGeofenceAttestation({
      ...input,
      eventType,
      memo: input.memo || `Pickup ${isAutoConfirmed ? 'auto-confirmed (timeout)' : 'confirmed by passenger'}`,
    });
  }, [createGeofenceAttestation]);

  // Create dropoff confirmation attestation
  const createDropoffConfirmationAttestation = useCallback(async (
    input: Omit<GeofenceAttestationInput, 'eventType'>,
    isAutoConfirmed: boolean = false
  ): Promise<AttestationResult> => {
    const eventType: AttestationEventType = isAutoConfirmed ? 'dropoff_auto' : 'dropoff_confirmed';
    return createGeofenceAttestation({
      ...input,
      eventType,
      memo: input.memo || `Dropoff ${isAutoConfirmed ? 'auto-confirmed (timeout)' : 'confirmed by passenger'}`,
    });
  }, [createGeofenceAttestation]);

  // Create geofence entry attestation (when driver enters geofence)
  const createGeofenceEntryAttestation = useCallback(async (
    input: Omit<GeofenceAttestationInput, 'eventType'>
  ): Promise<AttestationResult> => {
    return createGeofenceAttestation({
      ...input,
      eventType: 'geofence_entry',
      memo: input.memo || `Driver entered ${input.geofenceData.type} geofence`,
    });
  }, [createGeofenceAttestation]);

  // Reset ride attestations (for new ride)
  const resetRideAttestations = useCallback(() => {
    setState(prev => ({
      ...prev,
      rideAttestations: initialRideAttestations,
    }));
  }, []);

  const clearError = useCallback(() => {
    setState(prev => ({ ...prev, error: null }));
  }, []);

  return {
    ...state,
    // Core attestation methods
    createGeofenceAttestation,
    createGeofenceEntryAttestation,
    createPickupConfirmationAttestation,
    createDropoffConfirmationAttestation,
    // Utility methods
    verifyAttestation,
    resetRideAttestations,
    clearError,
    // State
    isWalletConnected: isAuthenticated && !!walletAddress,
    currentNetwork: network,
  };
};

// Helper function to get human-readable event description
function getEventDescription(
  eventType: AttestationEventType,
  geofenceType: 'pickup' | 'destination'
): string {
  switch (eventType) {
    case 'geofence_entry':
      return `Driver entered ${geofenceType} geofence`;
    case 'pickup_confirmed':
      return 'Passenger confirmed pickup';
    case 'pickup_auto':
      return 'Pickup auto-confirmed (passenger timeout)';
    case 'dropoff_confirmed':
      return 'Passenger confirmed dropoff';
    case 'dropoff_auto':
      return 'Dropoff auto-confirmed (passenger timeout)';
    default:
      return `${geofenceType} attestation`;
  }
}

// Helper function to update ride attestations based on event type
function updateRideAttestations(
  current: RideAttestations,
  eventType: AttestationEventType,
  geofenceType: 'pickup' | 'destination',
  attestation: OnchainLocationAttestation
): RideAttestations {
  const updated = { ...current };

  switch (eventType) {
    case 'geofence_entry':
      if (geofenceType === 'pickup') {
        updated.pickupEntry = attestation;
      } else {
        updated.dropoffEntry = attestation;
      }
      break;
    case 'pickup_confirmed':
    case 'pickup_auto':
      updated.pickupConfirmed = attestation;
      break;
    case 'dropoff_confirmed':
    case 'dropoff_auto':
      updated.dropoffConfirmed = attestation;
      break;
  }

  return updated;
}