# Driver Confirmation with Onchain Attestations

This guide explains how to integrate driver confirmation flow with onchain attestations in your PullUp app using EAS (Ethereum Attestation Service).

## Overview

The driver confirmation system creates a two-step verification process:

1. **Driver enters geofence** → Automatic onchain attestation created
2. **Passenger confirmation** → Either confirms or times out (30s default)

This provides immutable proof of service delivery and passenger interaction for:

- Proof of service delivery
- Dispute resolution  
- Smart contract integration
- Regulatory compliance
- Insurance claims

## Prerequisites

1. **Wallet Integration**: Your app already has Dynamic Labs wallet integration ✅
2. **Location Services**: Your app already has geofencing implemented ✅
3. **Network Access**: Ensure your app can connect to Ethereum networks

## Installation

1. **Install Dependencies**:
```bash
npm install viem@^2.21.0 @decentralized-geo/astral-sdk
# or
bun add viem@^2.21.0 @decentralized-geo/astral-sdk
```

## Integration Steps

### 1. Add Driver Confirmation to Your Driver App

**Important**: This is for the driver-facing app, not the passenger trip screen.

```typescript
// In your driver navigation screen
import { useEnhancedGeofencing } from '@/hooks/navigation/useEnhancedGeofencing';

const {
  isInPickupGeofence,
  isInDestinationGeofence,
  geofenceState,
  triggerManualConfirmation,
  cancelConfirmation,
  // ... other returns
} = useEnhancedGeofencing({
  driverLocation,
  pickupLocation,
  destinationLocation,
  pickupAddress,
  destinationAddress,
  navigationPhase,
  
  // Geofence entry triggers confirmation flow
  onEnterPickupGeofence: () => {
    console.log('Driver entered pickup - starting confirmation');
  },
  onEnterDestinationGeofence: () => {
    console.log('Driver entered destination - starting confirmation');
  },
  
  // Handle passenger responses
  onPassengerConfirmation: (type, confirmed, attestation) => {
    if (confirmed) {
      // Passenger confirmed - proceed with trip
      console.log(`Passenger confirmed ${type}`);
    } else {
      // Passenger not ready - wait or take action
      console.log(`Passenger not ready for ${type}`);
    }
  },
  
  // Handle timeouts (auto-confirm after 30s)
  onConfirmationTimeout: (type, attestation) => {
    console.log(`${type} confirmation timed out - auto-proceeding`);
  },
  
  // Settings
  enableOnchainAttestations: true,
  confirmationTimeoutMs: 30000, // 30 seconds
});
```

### 2. Add Driver Confirmation Panel to UI

Add the confirmation panel to your driver screen:

```typescript
import { DriverConfirmationPanel } from '@/components/DriverConfirmationPanel';

// In your driver screen render method
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
```

### 3. Access Driver Navigation

The enhanced driver navigation with confirmation flow is available at:
- **Route**: `/(app)/driver-navigation`
- **File**: `app/(app)/driver-navigation.tsx`

Navigate to it with ride parameters:
```typescript
router.push({
  pathname: '/(app)/driver-navigation',
  params: {
    rideId: 'ride-123',
    pickupLat: '37.7749',
    pickupLng: '-122.4194',
    pickupAddress: '123 Main St, San Francisco',
    destLat: '37.7849',
    destLng: '-122.4094',
    destAddress: '456 Oak St, San Francisco',
    passengerName: 'John Doe',
    estimatedPrice: '$15.00'
  }
});
```

### 4. Configure Network Settings

Update the network configuration in `lib/blockchain/astralSDK.ts`:

```typescript
// For production, use mainnet networks
export const SUPPORTED_NETWORKS = {
  base: {
    chainId: 8453,
    rpcUrl: 'https://mainnet.base.org',
    easContract: '0x4200000000000000000000000000000000000021',
    name: 'Base',
  },
  // Add other networks as needed
};
```

### 4. Environment Variables

Add your RPC endpoints to your environment:

```bash
# .env
EXPO_PUBLIC_SEPOLIA_RPC_URL=https://sepolia.infura.io/v3/YOUR_KEY
EXPO_PUBLIC_BASE_RPC_URL=https://mainnet.base.org
EXPO_PUBLIC_ARBITRUM_RPC_URL=https://arb1.arbitrum.io/rpc
```

## Usage Flow

### 1. Driver Enters Geofence
- Driver approaches pickup/destination location
- App detects geofence entry automatically
- Onchain attestation is created immediately (if enabled)

### 2. Passenger Confirmation Dialog
- Passenger receives alert: "Driver has arrived. Are you getting in?"
- Options: "Yes" or "Not Yet"
- 30-second countdown timer starts

### 3. Confirmation Results
- **Passenger confirms**: Trip proceeds to next phase
- **Passenger denies**: Driver waits or takes appropriate action  
- **Timeout**: Auto-confirms after 30 seconds

### 4. Onchain Proof
- Attestation contains proof of geofence entry
- Includes timestamp, location, and confirmation status
- Permanent record on blockchain for disputes/verification

### Manual Triggers
- Driver can manually trigger confirmation flow
- Useful if automatic detection fails
- Same confirmation process applies

## Configuration Options

### Gas Settings

```typescript
// In lib/blockchain/config.ts
export const BLOCKCHAIN_CONFIG = {
  gasSettings: {
    gasLimitBuffer: 10, // 10% buffer for gas estimation
    defaultGasPrice: {
      sepolia: 20, // 20 gwei for testnet
      base: 0.1,   // 0.1 gwei for Base L2
    },
  },
};
```

### Attestation Settings

```typescript
attestation: {
  autoConfirm: false,        // Require user confirmation
  enabledByDefault: false,   // Start with attestations disabled
  maxRetries: 3,            // Retry failed transactions
  retryDelay: 2000,         // 2 second delay between retries
},
```

## Testing

### Development Mode

1. **Use Sepolia Testnet**: Set `defaultNetwork: 'sepolia'`
2. **Get Test ETH**: Use [Sepolia Faucet](https://sepoliafaucet.com/)
3. **Enable Mock Mode**: Set `useMockTransactions: true` for testing without real transactions

### Test Scenarios

1. **Basic Flow**:
   - Connect wallet
   - Enable attestations
   - Enter geofence
   - Verify attestation creation

2. **Error Handling**:
   - Test with insufficient funds
   - Test network disconnection
   - Test transaction failures

3. **Manual Creation**:
   - Test manual attestation creation
   - Verify gas estimation
   - Test transaction confirmation

## Security Considerations

### Privacy Warning

⚠️ **Important**: Onchain attestations are public and permanent. Make sure users understand:
- Location data will be stored on a public blockchain
- Attestations cannot be deleted (only revoked)
- Anyone can query and view the data

### Best Practices

1. **User Consent**: Always get explicit consent before creating attestations
2. **Gas Limits**: Set reasonable gas limits to prevent excessive costs
3. **Network Selection**: Use L2 networks (Base, Arbitrum) for lower costs
4. **Error Handling**: Implement robust error handling for network issues
5. **Fallback**: Ensure app works without attestations if blockchain is unavailable

## Troubleshooting

### Common Issues

1. **"Wallet not connected"**: Ensure Dynamic Labs wallet is properly connected
2. **"Insufficient funds"**: User needs ETH for gas fees
3. **"Transaction failed"**: Check network connectivity and gas settings
4. **"Schema not found"**: Verify EAS schema UIDs are correct

### Debug Mode

Enable debug logging:

```typescript
// In lib/blockchain/config.ts
development: {
  enableLogging: true,
  useMockTransactions: false, // Set to true for testing
}
```

## Production Deployment

### Checklist

- [ ] Update RPC URLs to production endpoints
- [ ] Set `useMockTransactions: false`
- [ ] Configure proper gas prices for mainnet
- [ ] Test with real transactions on testnet
- [ ] Update EAS schema UIDs to production schemas
- [ ] Add proper error monitoring
- [ ] Test wallet connection flows
- [ ] Verify block explorer links

### Monitoring

Monitor attestation creation:
- Track success/failure rates
- Monitor gas costs
- Log user adoption metrics
- Set up alerts for failed transactions

## Support

For issues with:
- **EAS Integration**: Check [EAS Documentation](https://docs.attest.sh/)
- **Dynamic Labs**: Check [Dynamic Labs Docs](https://docs.dynamic.xyz/)
- **Ethers.js**: Check [Ethers Documentation](https://docs.ethers.org/)

## Example Implementation

The driver confirmation with onchain attestations has been integrated into the existing driver navigation screen at `app/(app)/driver-navigation.tsx`.

**Key Integration Points**:
- Replaced `useGeofencing` with `useEnhancedGeofencing`
- Added `DriverConfirmationPanel` component to the UI
- Enhanced geofence callbacks to trigger passenger confirmation flow
- Added onchain attestation settings state

**Note**: The passenger trip screen (`app/(app)/trip.tsx`) is for showing driver location to passengers, not for geofencing confirmations.