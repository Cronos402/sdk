/**
 * Cronos-specific payment header creation
 * Creates EIP-3009 authorization signatures for USDC.e payments on Cronos
 *
 * IMPORTANT: This creates headers in the format expected by the Cronos facilitator,
 * which differs from the standard x402 format. The Cronos facilitator expects a flat
 * payload structure with the asset field included.
 */

import type { CronosPaymentRequirements as PaymentRequirements, MultiNetworkSigner } from "../types/index.js";
import { getAddress, type Account, type WalletClient, type Chain, type Transport } from "viem";
import { isCronosNetwork, getCronosAsset, CronosChainIds, type CronosNetwork } from "./cronos-x402.js";

/**
 * EIP-3009 payload structure expected by the Cronos facilitator
 * This is a FLAT structure (not nested like x402's ExactEvmPayload)
 */
interface CronosEip3009Payload {
  from: string;
  to: string;
  value: string;
  validAfter: number;  // Number, not string
  validBefore: number; // Number, not string
  nonce: string;
  signature: string;
  asset: string;       // Required - token contract address
}

/**
 * Payment header structure expected by the Cronos facilitator
 */
interface CronosPaymentHeader {
  x402Version: number;
  scheme: "exact";
  network: string;
  payload: CronosEip3009Payload;
}

// Authorization types for EIP-3009 TransferWithAuthorization
const authorizationTypes = {
  TransferWithAuthorization: [
    { name: "from", type: "address" },
    { name: "to", type: "address" },
    { name: "value", type: "uint256" },
    { name: "validAfter", type: "uint256" },
    { name: "validBefore", type: "uint256" },
    { name: "nonce", type: "bytes32" },
  ],
} as const;

/**
 * Generate a random nonce for EIP-3009 authorization
 */
function generateNonce(): `0x${string}` {
  const randomBytes = new Uint8Array(32);
  crypto.getRandomValues(randomBytes);
  return `0x${Array.from(randomBytes).map(b => b.toString(16).padStart(2, '0')).join('')}` as `0x${string}`;
}

/**
 * Create a payment header for Cronos networks
 * This is a Cronos-specific implementation that bypasses x402's network validation
 *
 * @param signer - Multi-network signer (uses EVM signer for Cronos)
 * @param version - x402 protocol version (default: 1)
 * @param requirement - Payment requirements from the server
 * @returns Base64-encoded payment header string
 */
export async function createCronosPaymentHeader(
  signer: MultiNetworkSigner,
  version: number,
  requirement: PaymentRequirements
): Promise<string> {
  const network = requirement.network as string;

  // Validate this is a Cronos network
  if (!isCronosNetwork(network)) {
    throw new Error(`Unsupported network for Cronos payment: ${network}. Only cronos-testnet and cronos-mainnet are supported.`);
  }

  // Must have an EVM signer
  if (!signer.evm) {
    throw new Error("EVM signer is required for Cronos payments");
  }

  const evmSigner = signer.evm as WalletClient<Transport, Chain, Account>;

  // Get account address from signer
  const fromAddress = evmSigner.account?.address;
  if (!fromAddress) {
    throw new Error("Could not get address from EVM signer");
  }

  // Get USDC.e asset configuration for this network
  const asset = getCronosAsset(network as CronosNetwork, "USDC.e");
  if (!asset.eip712) {
    throw new Error(`EIP-712 configuration not available for ${network}`);
  }

  // Build EIP-3009 authorization
  // IMPORTANT: validAfter and validBefore must be NUMBERS, not strings!
  const now = Math.floor(Date.now() / 1000);
  const validAfter = 0; // Valid immediately (number)
  const validBefore = now + 3600; // Valid for 1 hour (number) - matching official SDK
  const nonce = generateNonce();

  const from = getAddress(fromAddress);
  const to = getAddress(requirement.payTo);
  const tokenAddress = getAddress(requirement.asset);
  const value = requirement.maxAmountRequired;

  // Build EIP-712 domain using Cronos asset configuration
  // Map "cronos" to "cronos-mainnet" for chain ID lookup
  const normalizedNetwork = network === "cronos" ? "cronos-mainnet" : network;
  const chainId = CronosChainIds[normalizedNetwork as keyof typeof CronosChainIds];

  const domain = {
    name: asset.eip712.name,
    version: asset.eip712.version,
    chainId,
    verifyingContract: tokenAddress,
  };

  // Sign using EIP-712 typed data
  // The message must match exactly what the contract expects
  const messageForSigning = {
    from,
    to,
    value: BigInt(value),
    validAfter: BigInt(validAfter),
    validBefore: BigInt(validBefore),
    nonce,
  };

  const signature = await evmSigner.signTypedData({
    domain,
    types: authorizationTypes,
    primaryType: "TransferWithAuthorization",
    message: messageForSigning,
  });

  // Build the payload in Cronos facilitator's expected format (FLAT structure)
  // This differs from x402's nested ExactEvmPayload structure
  const payload: CronosEip3009Payload = {
    from,
    to,
    value,
    validAfter,  // Number, not string
    validBefore, // Number, not string
    nonce,
    signature,
    asset: tokenAddress, // Required by Cronos facilitator
  };

  // Build the complete payment header
  const paymentHeader: CronosPaymentHeader = {
    x402Version: version,
    scheme: "exact",
    network,
    payload,
  };

  // Encode as base64
  const jsonString = JSON.stringify(paymentHeader);

  // Use appropriate base64 encoding based on environment
  if (typeof btoa === 'function') {
    return btoa(jsonString);
  } else if (typeof Buffer !== 'undefined') {
    return Buffer.from(jsonString).toString('base64');
  } else {
    throw new Error("No base64 encoder available");
  }
}

/**
 * Check if a network is supported by this Cronos payment header implementation
 */
export function isNetworkSupportedForCronosPayment(network: string): boolean {
  return isCronosNetwork(network);
}
