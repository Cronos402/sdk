/**
 * Cronos402 Type Definitions
 *
 * Centralized types for the Cronos payment system.
 * These replace x402 types with Cronos-specific implementations.
 */

import type { WalletClient, Account, Chain, Transport } from 'viem';

// ============================================================================
// Network Types
// ============================================================================

/**
 * Supported Cronos networks
 */
export type CronosNetwork = 'cronos' | 'cronos-testnet' | 'cronos-mainnet';

/**
 * All supported Cronos network values
 */
export const SUPPORTED_CRONOS_NETWORKS: CronosNetwork[] = ['cronos', 'cronos-testnet', 'cronos-mainnet'];

// ============================================================================
// Payment Types
// ============================================================================

/**
 * Price type - can be a number, string, or USD amount
 */
export type Price = number | string | `$${string}`;

/**
 * Payment scheme - only 'exact' is supported
 */
export type PaymentScheme = 'exact';

/**
 * Payment requirements structure (Cronos-specific)
 */
export interface CronosPaymentRequirements {
  scheme: PaymentScheme;
  network: CronosNetwork | string;
  maxAmountRequired: string;
  payTo: string;
  asset: string;
  maxTimeoutSeconds?: number;
  resource?: string;
  mimeType?: string;
  description?: string;
  extra?: Record<string, unknown>;
}

/**
 * Legacy compatibility alias
 */
export type PaymentRequirements = CronosPaymentRequirements;

// ============================================================================
// EIP-3009 Payload Types
// ============================================================================

/**
 * Cronos EIP-3009 payload structure (flat, not nested like x402)
 * Used for TransferWithAuthorization gasless transfers
 */
export interface CronosEip3009Payload {
  from: string;
  to: string;
  value: string;
  validAfter: number;
  validBefore: number;
  nonce: string;
  signature: string;
  asset: string;
}

/**
 * Cronos payment header structure (base64-encoded when sent)
 */
export interface CronosPaymentHeader {
  x402Version: number;
  scheme: PaymentScheme;
  network: string;
  payload: CronosEip3009Payload;
}

/**
 * Generic payment payload (for facilitator compatibility)
 */
export interface PaymentPayload {
  x402Version: number;
  scheme: PaymentScheme;
  network: string;
  payload: CronosEip3009Payload | Record<string, unknown>;
}

// ============================================================================
// Signer Types
// ============================================================================

/**
 * Signer configuration for Cronos payments
 * Only EVM signer is supported (no SVM/Solana)
 */
export interface CronosSigner {
  evm?: WalletClient<Transport, Chain, Account>;
}

/**
 * Multi-network signer (legacy compatibility)
 * Cronos only uses EVM
 */
export interface MultiNetworkSigner {
  evm?: WalletClient<Transport, Chain, Account>;
}

// ============================================================================
// Configuration Types
// ============================================================================

/**
 * Recipient with testnet flag
 */
export interface RecipientWithTestnet {
  address: string;
  isTestnet?: boolean;
}

/**
 * Facilitator configuration
 */
export interface FacilitatorConfig {
  url?: string;
}

/**
 * Asset configuration for a Cronos network
 */
export interface CronosAssetConfig {
  address: string;
  symbol: string;
  decimals: number;
  name?: string;
  eip712?: {
    name: string;
    version: string;
    chainId: number;
    verifyingContract: string;
  };
}

// ============================================================================
// Facilitator Response Types
// ============================================================================

/**
 * Facilitator verify response
 */
export interface FacilitatorVerifyResponse {
  isValid: boolean;
  payer?: string;
  invalidReason?: string | null;
  transaction?: string;
}

/**
 * Facilitator settle response
 */
export interface FacilitatorSettleResponse {
  success: boolean;
  transaction?: string;
  txHash?: string;
  network?: string;
  payer?: string;
  from?: string;
  errorReason?: string;
  error?: string;
  event?: string;
}

/**
 * Facilitator supported response
 */
export interface FacilitatorSupportedResponse {
  kinds: Array<{
    x402Version: number;
    network: string;
    scheme: string;
  }>;
}

// ============================================================================
// Export everything
// ============================================================================

export default {
  SUPPORTED_CRONOS_NETWORKS,
};
