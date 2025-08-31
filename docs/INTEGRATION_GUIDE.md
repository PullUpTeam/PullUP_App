# Quick Integration Guide

This guide shows how to add driver confirmation with onchain attestations to your existing PullUp app.

## What Was Added

### 1. New Dependencies
```json
{
  "dependencies": {
    "@decentralized-geo/astral-sdk": "latest",
    "viem": "^2.21.0"
  }
}
```

### 2. New Files Created
- `lib/blockchain/astralSDK.ts` - Astral SDK integration with viem
- `hooks/blockchain/useOnchainAttestation.ts` - Hook for creating attestations
- `hooks/navigation/useDriverConfirmation.ts` - Driver confirmation logic
- `hooks/navigation/useEnhancedGeofencing.ts` - Enhanced geofencing with confirmations
- `components/DriverConfirmationPanel.tsx` - UI for driver confirmation

### 3. Modified Files
- `app/(app)/driver-navigation.tsx` - Integrated enhanced geofencing
- `package.json` - Added new dependencies

## How It Works

### Before (Original Flow)
```
Driver enters geofence → Phase transition → Continue navigation
```

### After (Enhanced Flow)
```
Driver enters geofence → Onchain attestation created → Passenger confirmation dialog → 
  ├─ Confirmed → Continue
  ├─ Denied → Wait
  └─ Timeout (30s) → Auto-continue
```

## Key Changes in driver-navigation.tsx

### 1. Import Changes
```typescript
// OLD
import { useGeofencing } from '@/hooks/navigation/useGeofencing';

// NEW
import { useEnhancedGeofencing } from '@/hooks/navigation/useEnhancedGeofencing';
import { DriverConfirmationPanel } from '@/components/DriverConfirmationPanel';
```

### 2. Hook Usage
```typescript
// OLD
const { isInPickupGeofence, isInDestinationGeofence } = useGeofencing({
  driverLocation,
  pickupLocation,
  destinationLocation,
  navigationPhase,
  onEnterPickupGeofence: () => transitionToPhase('at-pickup'),
  onEnterDestinationGeofence: () => transitionToPhase('at-destination'),
});

// NEW
const {
  isInPickupGeofence,
  isInDestinationGeofence,
  geofenceState,
  triggerManualConfirmation,
  cancelConfirmation,
  isCreatingAttestation,
  attestationError,
  isWalletConnected,
} = useEnhancedGeofencing({
  driverLocation,
  pickupLocation,
  destinationLocation,
  pickupAddress: rideData.pickupAddress,
  destinationAddress: rideData.destAddress,
  navigationPhase,
  
  // Enhanced callbacks
  onEnterPickupGeofence: async () => {
    console.log('🎯 Driver entered pickup - starting confirmation');
    await transitionToPhase('at-pickup');
    startTimer();
  },
  
  onPassengerConfirmation: (type, confirmed, attestation) => {
    if (confirmed) {
      console.log(`✅ Passenger confirmed ${type}`);
      speakInstruction('Passenger confirmed. You may proceed.');
    } else {
      console.log(`⏳ Passenger not ready for ${type}`);
      speakInstruction('Passenger is not ready yet. Please wait.');
    }
  },
  
  onConfirmationTimeout: (type, attestation) => {
    console.log(`⏰ ${type} confirmation timed out - auto-proceeding`);
    speakInstruction('Proceeding automatically.');
  },
  
  enableOnchainAttestations: true,
  confirmationTimeoutMs: 30000,
});
```

### 3. UI Addition
```typescript
// Add this to the render method
{(isInPickupGeofence || isInDestinationGeofence || 
  geofenceState.pickup.isWaitingForConfirmation || 
  geofenceState.destination.isWaitingForConfirmation) && (
  <View className="absolute bottom-0 left-0 right-0 z-20">
    <DriverConfirmationPanel
      geofenceState={geofenceState}
      navigationPhase={navigationPhase}
      isCreatingAttestation={isCreatingAttestation}
      attestationError={attestationError}
      isWalletConnected={isWalletConnected}
      enableOnchainAttestations={enableOnchainAttestations}
      onToggleAttestations={setEnableOnchainAttestations}
      onTriggerManualConfirmation={triggerManualConfirmation}
      onCancelConfirmation={cancelConfirmation}
    />
  </View>
)}
```

## Testing the Integration

### 1. Install Dependencies
```bash
bun add viem@^2.21.0 @decentralized-geo/astral-sdk
```

### 2. Test Basic Flow
1. Navigate to driver navigation screen with ride params
2. Drive to pickup location (or simulate location)
3. Enter geofence → Should see confirmation panel
4. Toggle attestations on/off
5. Test manual confirmation triggers

### 3. Test Onchain Attestations
1. Connect wallet in the app
2. Enable attestations in confirmation panel
3. Enter geofence → Should create attestation
4. Check console for attestation UID
5. Verify transaction on block explorer

## Configuration Options

### Network Selection
```typescript
// In useOnchainAttestation hook
const { createGeofenceAttestation } = useOnchainAttestation({
  network: 'sepolia', // 'sepolia' | 'base' | 'arbitrum'
  autoConfirm: false, // Require user confirmation
});
```

### Timeout Settings
```typescript
// In useEnhancedGeofencing
const { ... } = useEnhancedGeofencing({
  // ...other props
  confirmationTimeoutMs: 30000, // 30 seconds (adjustable)
});
```

### Gas Settings
```typescript
// In lib/blockchain/config.ts
export const BLOCKCHAIN_CONFIG = {
  gasSettings: {
    gasLimitBuffer: 10, // 10% buffer
    defaultGasPrice: {
      sepolia: 20, // 20 gwei
      base: 0.1,   // 0.1 gwei
    },
  },
};
```

## Rollback Instructions

If you need to rollback to the original implementation:

1. **Revert driver-navigation.tsx**:
   - Change `useEnhancedGeofencing` back to `useGeofencing`
   - Remove `DriverConfirmationPanel` import and usage
   - Simplify geofence callbacks

2. **Remove new files**:
   - Delete `hooks/navigation/useEnhancedGeofencing.ts`
   - Delete `hooks/navigation/useDriverConfirmation.ts`
   - Delete `hooks/blockchain/useOnchainAttestation.ts`
   - Delete `components/DriverConfirmationPanel.tsx`
   - Delete `lib/blockchain/astralSDK.ts`

3. **Revert package.json**:
   - Remove `viem` and `@decentralized-geo/astral-sdk` dependencies

## Support

- **Geofencing Issues**: Check existing `useGeofencing` hook
- **Attestation Issues**: Check wallet connection and network settings
- **UI Issues**: Verify component imports and props
- **Performance**: Monitor confirmation timeout settings

The integration is designed to be backward compatible - if attestations fail, the basic geofencing still works.