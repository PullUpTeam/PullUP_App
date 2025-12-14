// lib/blockchain/astralSDK.ts
import { 
  AstralSDK,
  UnsignedLocationAttestation,
  OffchainLocationAttestation,
  OnchainLocationAttestation
} from '@decentralized-geo/astral-sdk';
import { createWalletClient, http, type WalletClient } from 'viem';
import { sepolia, base, arbitrum } from 'viem/chains';

// Re-export types from Astral SDK
export {
  AstralSDK,
  UnsignedLocationAttestation,
  OffchainLocationAttestation,
  OnchainLocationAttestation
} from '@decentralized-geo/astral-sdk';

// Attestation event types for ride lifecycle
export type AttestationEventType =
  | 'geofence_entry'      // Driver enters geofence (pickup or destination)
  | 'pickup_confirmed'    // Passenger confirms pickup
  | 'pickup_auto'         // Pickup auto-confirmed after timeout
  | 'dropoff_confirmed'   // Passenger confirms dropoff
  | 'dropoff_auto';       // Dropoff auto-confirmed after timeout

// Additional types for our implementation
export interface GeofenceAttestationInput {
  location: {
    latitude: number;
    longitude: number;
  };
  geofenceData: {
    geofenceId: string;
    type: 'pickup' | 'destination';
    phase: string;
    address?: string;
  };
  memo?: string;
  eventType?: AttestationEventType;
  rideId?: string;
  driverId?: string;
  passengerId?: string;
}

export interface AttestationResult {
  success: boolean;
  attestation?: OnchainLocationAttestation;
  error?: string;
}

// Structure to hold all attestations for a ride
export interface RideAttestations {
  pickupEntry: OnchainLocationAttestation | null;      // When driver enters pickup geofence
  pickupConfirmed: OnchainLocationAttestation | null;  // When passenger confirms pickup
  dropoffEntry: OnchainLocationAttestation | null;     // When driver enters destination geofence
  dropoffConfirmed: OnchainLocationAttestation | null; // When passenger confirms dropoff
}

// Network configurations using viem chains
export const SUPPORTED_NETWORKS = {
  sepolia: {
    chain: sepolia,
    rpcUrl: 'https://sepolia.infura.io/v3/YOUR_KEY',
    easContract: '0xC2679fBD37d54388Ce493F1DB75320D236e1815e',
    name: 'Sepolia Testnet',
  },
  base: {
    chain: base,
    rpcUrl: 'https://mainnet.base.org',
    easContract: '0x4200000000000000000000000000000000000021',
    name: 'Base',
  },
  arbitrum: {
    chain: arbitrum,
    rpcUrl: 'https://arb1.arbitrum.io/rpc',
    easContract: '0xbD75f629A22Dc1ceD33dDA0b68c546A1c035c458',
    name: 'Arbitrum One',
  },
} as const;

export type SupportedNetwork = keyof typeof SUPPORTED_NETWORKS;

// Helper function to create wallet client for Astral SDK
export function createAstralWalletClient(
  network: SupportedNetwork,
  account: `0x${string}`
): WalletClient {
  const networkConfig = SUPPORTED_NETWORKS[network];
  
  return createWalletClient({
    chain: networkConfig.chain,
    transport: http(networkConfig.rpcUrl),
    account,
  });
}

// Helper function to initialize Astral SDK
export function initializeAstralSDK(
  walletClient: WalletClient,
  network: SupportedNetwork
): AstralSDK {
  return new AstralSDK({
    signer: walletClient,
    chainId: SUPPORTED_NETWORKS[network].chain.id,
  });
}