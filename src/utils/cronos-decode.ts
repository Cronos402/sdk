/**
 * Cronos Payment Decoding Utilities
 *
 * Shared functions for decoding and matching Cronos payment headers.
 * These replace x402's decode functions with Cronos-specific implementations.
 */

import type {
  CronosPaymentHeader,
  CronosPaymentRequirements,
  PaymentPayload,
} from '../types/index.js';

/**
 * Decode a base64-encoded Cronos payment header
 *
 * @param token - Base64-encoded payment header string
 * @returns Decoded payment header object
 * @throws Error if decoding fails
 */
export function decodeCronosPayment(token: string): CronosPaymentHeader {
  let jsonString: string;

  if (typeof atob === 'function') {
    jsonString = atob(token);
  } else if (typeof Buffer !== 'undefined') {
    jsonString = Buffer.from(token, 'base64').toString('utf-8');
  } else {
    throw new Error('No base64 decoder available');
  }

  return JSON.parse(jsonString) as CronosPaymentHeader;
}

/**
 * Encode a payment header to base64
 *
 * @param header - Payment header object to encode
 * @returns Base64-encoded string
 */
export function encodeCronosPayment(header: CronosPaymentHeader): string {
  const jsonString = JSON.stringify(header);

  if (typeof btoa === 'function') {
    return btoa(jsonString);
  } else if (typeof Buffer !== 'undefined') {
    return Buffer.from(jsonString, 'utf-8').toString('base64');
  } else {
    throw new Error('No base64 encoder available');
  }
}

/**
 * Find matching payment requirements for a Cronos payment
 *
 * @param accepts - Array of accepted payment requirements
 * @param decoded - Decoded payment header
 * @returns Matching requirement or null if none found
 */
export function findMatchingCronosRequirements(
  accepts: CronosPaymentRequirements[],
  decoded: CronosPaymentHeader
): CronosPaymentRequirements | null {
  return accepts.find(req =>
    req.network === decoded.network &&
    req.scheme === decoded.scheme
  ) ?? null;
}

/**
 * Convert a CronosPaymentHeader to PaymentPayload format
 * (for facilitator API compatibility)
 *
 * @param decoded - Decoded payment header
 * @param x402Version - Protocol version (default: 1)
 * @returns PaymentPayload object
 */
export function toPaymentPayload(
  decoded: CronosPaymentHeader,
  x402Version: number = 1
): PaymentPayload {
  return {
    x402Version,
    scheme: decoded.scheme,
    network: decoded.network,
    payload: decoded.payload,
  };
}
