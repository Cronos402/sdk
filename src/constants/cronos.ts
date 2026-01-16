/**
 * Cronos Network Constants
 * Source: https://docs.cronos.org/cronos-x402-facilitator/api-reference
 *
 * These are the official contract addresses and configuration from the Cronos documentation.
 * Do not modify these values unless the official documentation is updated.
 *
 * BEST PRACTICE: Always import from this file instead of hardcoding network values.
 */

import type { Address } from 'viem';

// Network identifiers as used by the Cronos x402 facilitator
export const CRONOS_NETWORK = {
  MAINNET: 'cronos-mainnet',
  TESTNET: 'cronos-testnet',
  // Alias for mainnet (used in some contexts)
  CRONOS: 'cronos',
} as const;

export type CronosNetworkId = typeof CRONOS_NETWORK[keyof typeof CRONOS_NETWORK];

// Supported networks array for iteration
export const SUPPORTED_CRONOS_NETWORKS: CronosNetworkId[] = [
  CRONOS_NETWORK.MAINNET,
  CRONOS_NETWORK.TESTNET,
];

// Chain IDs
export const CRONOS_CHAIN_ID = {
  MAINNET: 25,
  TESTNET: 338,
} as const;

// RPC URLs
export const CRONOS_RPC_URL = {
  MAINNET: 'https://evm.cronos.org',
  TESTNET: 'https://evm-t3.cronos.org',
} as const;

// USDC.e Contract Addresses (Bridged USDC via Stargate)
// Source: Cronos x402 Facilitator API Reference
export const USDC_ADDRESS = {
  // Mainnet: USDC.e (Bridged USDC Stargate)
  MAINNET: '0xf951eC28187D9E5Ca673Da8FE6757E6f0Be5F77C' as Address,
  // Testnet: devUSDC.e (Test token for development)
  TESTNET: '0xc01efAaF7C5C61bEbFAeb358E1161b537b8bC0e0' as Address,
} as const;

// USDC.e Token Metadata
export const USDC_METADATA = {
  NAME: 'Bridged USDC (Stargate)',
  SYMBOL: {
    MAINNET: 'USDC.e',
    TESTNET: 'devUSDC.e',
  },
  DECIMALS: 6,
  VERSION: '1', // EIP-712 domain version
} as const;

// Native CRO Token (zero address represents native token)
export const CRO_ADDRESS = '0x0000000000000000000000000000000000000000' as Address;

export const CRO_METADATA = {
  NAME: 'Cronos',
  SYMBOL: {
    MAINNET: 'CRO',
    TESTNET: 'TCRO',
  },
  DECIMALS: 18,
} as const;

// Cronos x402 Facilitator
export const CRONOS_FACILITATOR = {
  BASE_URL: 'https://facilitator.cronoslabs.org',
  X402_URL: 'https://facilitator.cronoslabs.org/v2/x402',
  ENDPOINTS: {
    HEALTH: '/healthcheck',
    SUPPORTED: '/v2/x402/supported',
    VERIFY: '/v2/x402/verify',
    SETTLE: '/v2/x402/settle',
  },
} as const;

// Block Explorer URLs
export const CRONOS_EXPLORER = {
  MAINNET: 'https://explorer.cronos.org',
  TESTNET: 'https://explorer.cronos.org/testnet',
} as const;

// Faucet URLs (for testnet)
export const CRONOS_FAUCET = {
  CRO: 'https://cronos.org/faucet',
  USDC: 'https://faucet.cronos.org',
} as const;

// Helper functions
export function getUsdcAddress(network: CronosNetworkId): Address {
  if (network === CRONOS_NETWORK.MAINNET || network === CRONOS_NETWORK.CRONOS) {
    return USDC_ADDRESS.MAINNET;
  }
  return USDC_ADDRESS.TESTNET;
}

export function getChainId(network: CronosNetworkId): number {
  if (network === CRONOS_NETWORK.MAINNET || network === CRONOS_NETWORK.CRONOS) {
    return CRONOS_CHAIN_ID.MAINNET;
  }
  return CRONOS_CHAIN_ID.TESTNET;
}

export function getRpcUrl(network: CronosNetworkId): string {
  if (network === CRONOS_NETWORK.MAINNET || network === CRONOS_NETWORK.CRONOS) {
    return CRONOS_RPC_URL.MAINNET;
  }
  return CRONOS_RPC_URL.TESTNET;
}

export function getExplorerUrl(network: CronosNetworkId): string {
  if (network === CRONOS_NETWORK.MAINNET || network === CRONOS_NETWORK.CRONOS) {
    return CRONOS_EXPLORER.MAINNET;
  }
  return CRONOS_EXPLORER.TESTNET;
}

export function isCronosNetwork(network: string): network is CronosNetworkId {
  return (
    network === CRONOS_NETWORK.MAINNET ||
    network === CRONOS_NETWORK.TESTNET ||
    network === CRONOS_NETWORK.CRONOS
  );
}

export function isTestnet(network: CronosNetworkId): boolean {
  return network === CRONOS_NETWORK.TESTNET;
}

export function isMainnet(network: CronosNetworkId): boolean {
  return network === CRONOS_NETWORK.MAINNET || network === CRONOS_NETWORK.CRONOS;
}

// Normalize network name (handle aliases)
export function normalizeNetwork(network: string): CronosNetworkId | undefined {
  if (network === 'cronos' || network === 'cronos-mainnet') {
    return CRONOS_NETWORK.MAINNET;
  }
  if (network === 'cronos-testnet') {
    return CRONOS_NETWORK.TESTNET;
  }
  return undefined;
}

// EIP-712 Domain for USDC.e (required for EIP-3009 signatures)
export function getUsdcEip712Domain(network: CronosNetworkId) {
  return {
    name: USDC_METADATA.NAME,
    version: USDC_METADATA.VERSION,
    chainId: getChainId(network),
    verifyingContract: getUsdcAddress(network),
  };
}

// Default network for development
export const DEFAULT_NETWORK = CRONOS_NETWORK.TESTNET;
