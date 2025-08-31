// lib/blockchain/config.ts
export const BLOCKCHAIN_CONFIG = {
  // Default network for development
  defaultNetwork: 'sepolia' as const,
  
  // Gas settings
  gasSettings: {
    // Buffer percentage for gas limit estimation
    gasLimitBuffer: 10, // 10% buffer
    
    // Default gas prices (in gwei)
    defaultGasPrice: {
      sepolia: 20,
      base: 0.1,
      arbitrum: 0.1,
    },
    
    // Maximum gas prices (in gwei) - safety limit
    maxGasPrice: {
      sepolia: 100,
      base: 10,
      arbitrum: 10,
    },
  },
  
  // Attestation settings
  attestation: {
    // Auto-confirm attestations without user prompt (for testing)
    autoConfirm: false,
    
    // Enable attestations by default
    enabledByDefault: false,
    
    // Retry settings for failed transactions
    maxRetries: 3,
    retryDelay: 2000, // 2 seconds
    
    // Schema settings (these would be real schema UIDs in production)
    schemas: {
      geofenceEntry: '0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef',
      locationProof: '0xabcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890',
    },
  },
  
  // UI settings
  ui: {
    // Show detailed transaction info
    showTransactionDetails: true,
    
    // Show gas cost estimates
    showGasCosts: true,
    
    // Confirmation timeout (ms)
    confirmationTimeout: 30000, // 30 seconds
  },
  
  // Development settings
  development: {
    // Use mock transactions in development
    useMockTransactions: __DEV__,
    
    // Log all blockchain interactions
    enableLogging: __DEV__,
    
    // Skip wallet connection requirement for testing
    skipWalletCheck: false,
  },
} as const;

// Helper function to get network-specific gas price
export const getNetworkGasPrice = (network: keyof typeof BLOCKCHAIN_CONFIG.gasSettings.defaultGasPrice) => {
  return BLOCKCHAIN_CONFIG.gasSettings.defaultGasPrice[network];
};

// Helper function to check if attestations should be enabled by default
export const shouldEnableAttestations = () => {
  return BLOCKCHAIN_CONFIG.attestation.enabledByDefault;
};

// Helper function to get retry settings
export const getRetrySettings = () => {
  return {
    maxRetries: BLOCKCHAIN_CONFIG.attestation.maxRetries,
    retryDelay: BLOCKCHAIN_CONFIG.attestation.retryDelay,
  };
};