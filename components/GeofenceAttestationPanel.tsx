// components/GeofenceAttestationPanel.tsx
import React from 'react';
import { View, Text, TouchableOpacity, ActivityIndicator, Alert } from 'react-native';
import { OnchainLocationAttestation } from '@/lib/blockchain/astralSDK';

interface GeofenceAttestationPanelProps {
  attestations: {
    pickup: OnchainLocationAttestation | null;
    destination: OnchainLocationAttestation | null;
  };
  isCreatingAttestation: boolean;
  attestationError: string | null;
  isWalletConnected: boolean;
  enableOnchainAttestations: boolean;
  onToggleAttestations: (enabled: boolean) => void;
  onCreateManualAttestation: (type: 'pickup' | 'destination') => void;
  navigationPhase: string;
}

export const GeofenceAttestationPanel: React.FC<GeofenceAttestationPanelProps> = ({
  attestations,
  isCreatingAttestation,
  attestationError,
  isWalletConnected,
  enableOnchainAttestations,
  onToggleAttestations,
  onCreateManualAttestation,
  navigationPhase,
}) => {
  const handleViewAttestation = (attestation: OnchainLocationAttestation) => {
    Alert.alert(
      'Attestation Details',
      `UID: ${attestation.uid.slice(0, 10)}...\nBlock: ${attestation.blockNumber}\nGas Used: ${attestation.gasUsed}\n\nMemo: ${attestation.memo}`,
      [
        {
          text: 'View on Explorer',
          onPress: () => {
            // In a real app, you'd open the browser to the block explorer
            console.log(`https://sepolia.etherscan.io/tx/${attestation.txHash}`);
          },
        },
        { text: 'OK' },
      ]
    );
  };

  const AttestationStatus = ({ 
    type, 
    attestation 
  }: { 
    type: 'pickup' | 'destination'; 
    attestation: OnchainLocationAttestation | null;
  }) => (
    <View className="flex-row items-center justify-between p-3 bg-gray-50 rounded-lg mb-2">
      <View className="flex-1">
        <Text className="font-medium text-gray-900 capitalize">
          {type} Geofence
        </Text>
        {attestation ? (
          <TouchableOpacity onPress={() => handleViewAttestation(attestation)}>
            <Text className="text-sm text-green-600">
              ✅ Attested (Block #{attestation.blockNumber})
            </Text>
          </TouchableOpacity>
        ) : (
          <Text className="text-sm text-gray-500">
            No attestation created
          </Text>
        )}
      </View>
      
      {!attestation && isWalletConnected && (
        <TouchableOpacity
          onPress={() => onCreateManualAttestation(type)}
          disabled={isCreatingAttestation}
          className="px-3 py-1 bg-blue-500 rounded-md"
        >
          {isCreatingAttestation ? (
            <ActivityIndicator size="small" color="white" />
          ) : (
            <Text className="text-white text-sm">Create</Text>
          )}
        </TouchableOpacity>
      )}
    </View>
  );

  return (
    <View className="p-4 bg-white border-t border-gray-200">
      <View className="flex-row items-center justify-between mb-4">
        <Text className="text-lg font-semibold text-gray-900">
          Onchain Attestations
        </Text>
        
        <TouchableOpacity
          onPress={() => onToggleAttestations(!enableOnchainAttestations)}
          className={`px-3 py-1 rounded-full ${
            enableOnchainAttestations ? 'bg-green-100' : 'bg-gray-100'
          }`}
        >
          <Text className={`text-sm ${
            enableOnchainAttestations ? 'text-green-700' : 'text-gray-600'
          }`}>
            {enableOnchainAttestations ? 'Enabled' : 'Disabled'}
          </Text>
        </TouchableOpacity>
      </View>

      {!isWalletConnected && (
        <View className="p-3 bg-yellow-50 rounded-lg mb-4">
          <Text className="text-yellow-800 text-sm">
            ⚠️ Connect your wallet to create onchain attestations
          </Text>
        </View>
      )}

      {attestationError && (
        <View className="p-3 bg-red-50 rounded-lg mb-4">
          <Text className="text-red-800 text-sm">
            ❌ {attestationError}
          </Text>
        </View>
      )}

      {enableOnchainAttestations && (
        <>
          <AttestationStatus type="pickup" attestation={attestations.pickup} />
          <AttestationStatus type="destination" attestation={attestations.destination} />
          
          <View className="mt-4 p-3 bg-blue-50 rounded-lg">
            <Text className="text-blue-800 text-xs">
              💡 Onchain attestations create permanent, verifiable proofs of geofence entries on the blockchain. 
              Gas costs are typically $0.01-0.10 on L2 networks.
            </Text>
          </View>
        </>
      )}
    </View>
  );
};