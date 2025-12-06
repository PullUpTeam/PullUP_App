// hooks/blockchain/useOnchainAttestation.ts
import { useState, useCallback } from 'react';
import { Alert } from 'react-native';
import { useAuthContext } from '@/context/AuthContext';
import { 
  OnchainLocationAttestation, 
  SUPPORTED_NETWORKS,
  GeofenceAttestationInput,
  AttestationResult,
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
}

export const useOnchainAttestation = (options: UseOnchainAttestationOptions = {}) => {
  const { network = 'sepolia', autoConfirm = false } = options;
  const { isAuthenticated, walletAddress, dynamicUser } = useAuthContext();
  
  const [state, setState] = useState<AttestationState>({
    isCreating: false,
    lastAttestation: null,
    error: null,
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
          },
        },
        memo: input.memo || `Geofence ${input.geofenceData.type} attestation - Phase: ${input.geofenceData.phase}`,
        timestamp: new Date(),
        revocable: true,
      };

      // Show confirmation dialog unless auto-confirm is enabled
      if (!autoConfirm) {
        const networkConfig = SUPPORTED_NETWORKS[network];
        const confirmed = await new Promise<boolean>((resolve) => {
          Alert.alert(
            'Create Onchain Attestation',
            `This will create a permanent blockchain record of entering the ${input.geofenceData.type} geofence.\n\nNetwork: ${networkConfig.name}\nEstimated cost: ~$0.01-0.10`,
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

      setState(prev => ({
        ...prev,
        isCreating: false,
        lastAttestation: attestation,
        error: null,
      }));

      // Show success notification
      Alert.alert(
        'Attestation Created!',
        `Successfully created onchain proof of geofence entry.\n\nTransaction: ${attestation.txHash.slice(0, 10)}...`,
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

  const clearError = useCallback(() => {
    setState(prev => ({ ...prev, error: null }));
  }, []);

  return {
    ...state,
    createGeofenceAttestation,
    verifyAttestation,
    clearError,
    isWalletConnected: isAuthenticated && !!walletAddress,
    currentNetwork: network,
  };
};