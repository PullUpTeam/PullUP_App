// components/GeofenceAttestationPanel.tsx
import React from 'react';
import { View, Text, TouchableOpacity, ActivityIndicator, Alert, Linking } from 'react-native';
import { OnchainLocationAttestation, RideAttestations } from '@/lib/blockchain/astralSDK';

interface GeofenceAttestationPanelProps {
  rideAttestations: RideAttestations;
  isCreatingAttestation: boolean;
  attestationError: string | null;
  isWalletConnected: boolean;
  enableOnchainAttestations: boolean;
  onToggleAttestations: (enabled: boolean) => void;
  onCreateManualAttestation: (type: 'pickup' | 'destination') => void;
  navigationPhase: string;
}

const getExplorerUrl = (txHash: string): string => {
  return `https://sepolia.etherscan.io/tx/${txHash}`;
};

export const GeofenceAttestationPanel: React.FC<GeofenceAttestationPanelProps> = ({
  rideAttestations,
  isCreatingAttestation,
  attestationError,
  isWalletConnected,
  enableOnchainAttestations,
  onToggleAttestations,
  onCreateManualAttestation,
  navigationPhase,
}) => {
  const handleViewAttestation = (attestation: OnchainLocationAttestation, title: string) => {
    Alert.alert(
      title,
      `UID: ${attestation.uid.slice(0, 10)}...\nBlock: ${attestation.blockNumber}\nGas Used: ${attestation.gasUsed}\n\nMemo: ${attestation.memo}`,
      [
        {
          text: 'View on Explorer',
          onPress: async () => {
            const url = getExplorerUrl(attestation.txHash);
            try {
              await Linking.openURL(url);
            } catch (error) {
              console.log('Could not open URL:', url);
            }
          },
        },
        { text: 'OK' },
      ]
    );
  };

  // Single attestation item component
  const AttestationItem = ({
    label,
    attestation,
    isActive,
  }: {
    label: string;
    attestation: OnchainLocationAttestation | null;
    isActive: boolean;
  }) => (
    <View className="flex-row items-center justify-between py-2">
      <Text className={`text-sm ${isActive ? 'text-gray-900' : 'text-gray-400'}`}>
        {label}
      </Text>
      {attestation ? (
        <TouchableOpacity
          onPress={() => handleViewAttestation(attestation, label)}
          className="flex-row items-center"
        >
          <Text className="text-sm text-green-600 mr-1">✅</Text>
          <Text className="text-xs text-green-600">
            Block #{attestation.blockNumber}
          </Text>
        </TouchableOpacity>
      ) : (
        <Text className={`text-xs ${isActive ? 'text-gray-500' : 'text-gray-300'}`}>
          {isActive ? 'Pending...' : '—'}
        </Text>
      )}
    </View>
  );

  // Geofence section component (pickup or destination)
  const GeofenceSection = ({
    type,
    entryAttestation,
    confirmationAttestation,
    isActive,
  }: {
    type: 'pickup' | 'destination';
    entryAttestation: OnchainLocationAttestation | null;
    confirmationAttestation: OnchainLocationAttestation | null;
    isActive: boolean;
  }) => {
    const hasAnyAttestation = entryAttestation || confirmationAttestation;
    const isComplete = entryAttestation && confirmationAttestation;

    return (
      <View className={`p-3 rounded-lg mb-3 ${isComplete ? 'bg-green-50' : isActive ? 'bg-blue-50' : 'bg-gray-50'}`}>
        <View className="flex-row items-center justify-between mb-2">
          <Text className={`font-medium capitalize ${isActive ? 'text-gray-900' : 'text-gray-500'}`}>
            {type === 'pickup' ? '📍 Pickup' : '🏁 Dropoff'}
          </Text>
          {isComplete && (
            <View className="bg-green-100 px-2 py-0.5 rounded">
              <Text className="text-xs text-green-700">Complete</Text>
            </View>
          )}
          {!hasAnyAttestation && isWalletConnected && isActive && (
            <TouchableOpacity
              onPress={() => onCreateManualAttestation(type)}
              disabled={isCreatingAttestation}
              className="px-3 py-1 bg-blue-500 rounded-md"
            >
              {isCreatingAttestation ? (
                <ActivityIndicator size="small" color="white" />
              ) : (
                <Text className="text-white text-xs">Manual</Text>
              )}
            </TouchableOpacity>
          )}
        </View>

        <View className="border-t border-gray-200 pt-2">
          <AttestationItem
            label={type === 'pickup' ? 'Driver arrived' : 'Reached destination'}
            attestation={entryAttestation}
            isActive={isActive}
          />
          <AttestationItem
            label={type === 'pickup' ? 'Passenger confirmed' : 'Ride completed'}
            attestation={confirmationAttestation}
            isActive={isActive && !!entryAttestation}
          />
        </View>
      </View>
    );
  };

  // Determine which phase is active
  const isPickupPhase = ['to-pickup', 'at-pickup', 'picking-up'].includes(navigationPhase);
  const isDestinationPhase = ['to-destination', 'at-destination'].includes(navigationPhase);
  const isCompleted = navigationPhase === 'completed';

  // Count total attestations
  const totalAttestations = [
    rideAttestations.pickupEntry,
    rideAttestations.pickupConfirmed,
    rideAttestations.dropoffEntry,
    rideAttestations.dropoffConfirmed,
  ].filter(Boolean).length;

  return (
    <View className="p-4 bg-white border-t border-gray-200">
      <View className="flex-row items-center justify-between mb-4">
        <View className="flex-row items-center">
          <Text className="text-lg font-semibold text-gray-900">
            Ride Attestations
          </Text>
          {totalAttestations > 0 && (
            <View className="ml-2 bg-blue-100 px-2 py-0.5 rounded-full">
              <Text className="text-xs text-blue-700">{totalAttestations}/4</Text>
            </View>
          )}
        </View>

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
          <GeofenceSection
            type="pickup"
            entryAttestation={rideAttestations.pickupEntry}
            confirmationAttestation={rideAttestations.pickupConfirmed}
            isActive={isPickupPhase || isDestinationPhase || isCompleted}
          />

          <GeofenceSection
            type="destination"
            entryAttestation={rideAttestations.dropoffEntry}
            confirmationAttestation={rideAttestations.dropoffConfirmed}
            isActive={isDestinationPhase || isCompleted}
          />

          {isCompleted && totalAttestations === 4 && (
            <View className="mt-2 p-3 bg-green-50 rounded-lg">
              <Text className="text-green-800 text-sm text-center">
                🎉 All ride attestations complete! Permanent proof stored on blockchain.
              </Text>
            </View>
          )}

          <View className="mt-4 p-3 bg-blue-50 rounded-lg">
            <Text className="text-blue-800 text-xs">
              💡 Attestations are created automatically:
              {'\n'}• When driver enters geofence (entry)
              {'\n'}• When passenger confirms or timeout occurs (confirmation)
              {'\n\n'}Gas costs: ~$0.01-0.10 per attestation on L2
            </Text>
          </View>
        </>
      )}
    </View>
  );
};
