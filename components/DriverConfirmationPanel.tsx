// components/DriverConfirmationPanel.tsx
import React from 'react';
import { View, Text, TouchableOpacity, ActivityIndicator } from 'react-native';
import { OnchainLocationAttestation } from '@/lib/blockchain/astralSDK';

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

interface DriverConfirmationPanelProps {
  geofenceState: GeofenceState;
  navigationPhase: string;
  isCreatingAttestation: boolean;
  attestationError: string | null;
  isWalletConnected: boolean;
  enableOnchainAttestations: boolean;
  onToggleAttestations: (enabled: boolean) => void;
  onTriggerManualConfirmation: (type: 'pickup' | 'destination') => void;
  onCancelConfirmation: (type: 'pickup' | 'destination') => void;
}

export const DriverConfirmationPanel: React.FC<DriverConfirmationPanelProps> = ({
  geofenceState,
  navigationPhase,
  isCreatingAttestation,
  attestationError,
  isWalletConnected,
  enableOnchainAttestations,
  onToggleAttestations,
  onTriggerManualConfirmation,
  onCancelConfirmation,
}) => {
  
  const formatTime = (seconds: number): string => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  const ConfirmationStatus = ({ 
    type, 
    state 
  }: { 
    type: 'pickup' | 'destination'; 
    state: GeofenceState['pickup'] | GeofenceState['destination'];
  }) => {
    const isRelevantPhase = 
      (type === 'pickup' && (navigationPhase === 'to-pickup' || navigationPhase === 'at-pickup')) ||
      (type === 'destination' && (navigationPhase === 'to-destination' || navigationPhase === 'at-destination'));

    if (!isRelevantPhase) return null;

    return (
      <View className="p-4 bg-white rounded-lg border border-gray-200 mb-3">
        <View className="flex-row items-center justify-between mb-2">
          <Text className="font-semibold text-gray-900 capitalize">
            {type} Confirmation
          </Text>
          
          {state.isWaitingForConfirmation && (
            <View className="flex-row items-center">
              <ActivityIndicator size="small" color="#3b82f6" />
              <Text className="ml-2 text-blue-600 font-medium">
                {formatTime(state.timeRemaining)}
              </Text>
            </View>
          )}
        </View>

        {state.isWaitingForConfirmation && (
          <View className="mb-3">
            <Text className="text-gray-600 text-sm mb-2">
              Waiting for passenger confirmation...
            </Text>
            <View className="bg-yellow-50 p-3 rounded-md">
              <Text className="text-yellow-800 text-sm">
                ⏱️ Auto-confirm in {formatTime(state.timeRemaining)}
              </Text>
            </View>
          </View>
        )}

        {state.hasConfirmed && (
          <View className="bg-green-50 p-3 rounded-md mb-2">
            <Text className="text-green-800 text-sm">
              ✅ Passenger confirmed {type}
            </Text>
          </View>
        )}

        {state.attestation && (
          <View className="bg-blue-50 p-3 rounded-md mb-2">
            <Text className="text-blue-800 text-xs">
              🔗 Onchain proof created
            </Text>
            <Text className="text-blue-600 text-xs font-mono">
              {state.attestation.uid.slice(0, 20)}...
            </Text>
          </View>
        )}

        <View className="flex-row space-x-2">
          {!state.isWaitingForConfirmation && !state.hasConfirmed && (
            <TouchableOpacity
              onPress={() => onTriggerManualConfirmation(type)}
              disabled={isCreatingAttestation}
              className="flex-1 bg-blue-500 py-2 px-4 rounded-md"
            >
              {isCreatingAttestation ? (
                <ActivityIndicator size="small" color="white" />
              ) : (
                <Text className="text-white text-center font-medium">
                  Start Confirmation
                </Text>
              )}
            </TouchableOpacity>
          )}

          {state.isWaitingForConfirmation && (
            <TouchableOpacity
              onPress={() => onCancelConfirmation(type)}
              className="flex-1 bg-gray-500 py-2 px-4 rounded-md"
            >
              <Text className="text-white text-center font-medium">
                Cancel
              </Text>
            </TouchableOpacity>
          )}
        </View>
      </View>
    );
  };

  return (
    <View className="p-4 bg-gray-50">
      <View className="flex-row items-center justify-between mb-4">
        <Text className="text-lg font-semibold text-gray-900">
          Driver Confirmation
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
            Attestations {enableOnchainAttestations ? 'ON' : 'OFF'}
          </Text>
        </TouchableOpacity>
      </View>

      {!isWalletConnected && enableOnchainAttestations && (
        <View className="p-3 bg-yellow-50 rounded-lg mb-4">
          <Text className="text-yellow-800 text-sm">
            ⚠️ Connect wallet for onchain attestations
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

      <ConfirmationStatus type="pickup" state={geofenceState.pickup} />
      <ConfirmationStatus type="destination" state={geofenceState.destination} />

      {enableOnchainAttestations && (
        <View className="mt-4 p-3 bg-blue-50 rounded-lg">
          <Text className="text-blue-800 text-xs">
            💡 When you enter a geofence, the passenger will be asked to confirm. 
            An onchain attestation creates permanent proof of the interaction.
          </Text>
        </View>
      )}
    </View>
  );
};