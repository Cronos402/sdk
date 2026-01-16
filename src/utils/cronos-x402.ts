/**
 * Cronos-specific extensions for x402 protocol
 * Adds support for Cronos Testnet and Mainnet to the x402 payment system
 */

import type { Chain } from "viem";
import { cronosTestnet, cronos } from "./signer.js";

// Cronos network types
// Using "cronos" for mainnet and "cronos-testnet" for testnet to be consistent
export type CronosNetwork = "cronos-testnet" | "cronos-mainnet" | "cronos";
export type ExtendedNetwork = CronosNetwork | string;

// Cronos chain ID mappings
export const CronosChainIds = {
  "cronos-testnet": 338,
  "cronos-mainnet": 25,
} as const;

// Reverse mapping: Chain ID to Cronos network name
export const ChainIdToCronosNetwork: Record<number, CronosNetwork> = {
  338: "cronos-testnet",
  25: "cronos-mainnet",
};

// USDC.e token addresses on Cronos networks
export const CronosUSDCeAddresses = {
  "cronos-testnet": "0xc01efAaF7C5C61bEbFAeb358E1161b537b8bC0e0" as `0x${string}`,
  "cronos-mainnet": "0xf951eC28187D9E5Ca673Da8FE6757E6f0Be5F77C" as `0x${string}`,
} as const;

// Native CRO token representation (zero address for native token)
export const CRO_NATIVE_ADDRESS = "0x0000000000000000000000000000000000000000" as `0x${string}`;

// Token configuration for Cronos networks
export interface CronosAssetConfig {
  address: `0x${string}`;
  symbol: string;
  decimals: number;
  name: string;
  // EIP-3009 domain for USDC.e (used for gasless transfers)
  eip712?: {
    name: string;
    version: string;
    chainId: number;
    verifyingContract: string;
  };
}

// USDC.e asset configurations with EIP-3009 support
// Domain values from official Cronos x402 Facilitator API Reference:
// https://docs.cronos.org/cronos-x402-facilitator/api-reference
// Note: "cronos" is an alias for "cronos-mainnet", handled in getCronosAsset
export const CronosAssets: Record<"cronos-testnet" | "cronos-mainnet", Record<"USDC.e" | "CRO", CronosAssetConfig>> = {
  "cronos-testnet": {
    "USDC.e": {
      address: CronosUSDCeAddresses["cronos-testnet"],
      symbol: "devUSDC.e", // Testnet symbol
      decimals: 6,
      name: "Bridged USDC (Stargate)",
      eip712: {
        name: "Bridged USDC (Stargate)", // Must match exactly per Cronos docs
        version: "1", // Per official API reference
        chainId: 338,
        verifyingContract: CronosUSDCeAddresses["cronos-testnet"],
      },
    },
    "CRO": {
      address: CRO_NATIVE_ADDRESS,
      symbol: "TCRO",
      decimals: 18,
      name: "Test Cronos",
    },
  },
  "cronos-mainnet": {
    "USDC.e": {
      address: CronosUSDCeAddresses["cronos-mainnet"],
      symbol: "USDC.e",
      decimals: 6,
      name: "Bridged USDC (Stargate)",
      eip712: {
        name: "Bridged USDC (Stargate)", // Must match exactly per Cronos docs
        version: "1", // Per official API reference
        chainId: 25,
        verifyingContract: CronosUSDCeAddresses["cronos-mainnet"],
      },
    },
    "CRO": {
      address: CRO_NATIVE_ADDRESS,
      symbol: "CRO",
      decimals: 18,
      name: "Cronos",
    },
  },
};

// Get viem Chain object for a Cronos network
export function getCronosChain(network: CronosNetwork): Chain {
  return network === "cronos-testnet" ? cronosTestnet : cronos;
}

// Check if a network string is a Cronos network
export function isCronosNetwork(network: string): network is CronosNetwork {
  return network === "cronos-testnet" || network === "cronos-mainnet" || network === "cronos";
}

// Get asset configuration for a Cronos network
export function getCronosAsset(
  network: CronosNetwork,
  token: "USDC.e" | "CRO" = "USDC.e"
): CronosAssetConfig {
  // Map "cronos" to "cronos-mainnet" for asset lookup
  const normalizedNetwork = network === "cronos" ? "cronos-mainnet" : network;
  return CronosAssets[normalizedNetwork as "cronos-testnet" | "cronos-mainnet"][token];
}

// Convert USD price to atomic units for Cronos tokens
export function priceToAtomicAmount(
  priceUSD: string | number,
  network: CronosNetwork,
  token: "USDC.e" | "CRO" = "USDC.e"
): {
  maxAmountRequired: bigint;
  asset: CronosAssetConfig;
} {
  const asset = getCronosAsset(network, token);
  const priceNum = typeof priceUSD === "string"
    ? parseFloat(priceUSD.replace(/[^0-9.]/g, ""))
    : priceUSD;

  if (isNaN(priceNum) || priceNum <= 0) {
    throw new Error(`Invalid price: ${priceUSD}`);
  }

  // For USDC.e: 1 USD = 1 USDC.e, with 6 decimals
  // For CRO: Need to convert USD to CRO (would require price oracle in production)
  const atomicAmount = BigInt(Math.floor(priceNum * 10 ** asset.decimals));

  return {
    maxAmountRequired: atomicAmount,
    asset,
  };
}

// Cronos facilitator configuration
export const CRONOS_FACILITATOR_URL = "https://facilitator.cronoslabs.org/v2/x402";

export interface CronosFacilitatorConfig {
  url: string;
  version?: string;
}

export const DefaultCronosFacilitatorConfig: CronosFacilitatorConfig = {
  url: CRONOS_FACILITATOR_URL,
  version: "v2",
};

/**
 * Check if a given chain ID corresponds to a Cronos network
 */
export function isCronosChainId(chainId: number): boolean {
  return chainId === 25 || chainId === 338;
}

/**
 * Get Cronos network name from chain ID
 */
export function getCronosNetworkFromChainId(chainId: number): CronosNetwork | null {
  return ChainIdToCronosNetwork[chainId] ?? null;
}
