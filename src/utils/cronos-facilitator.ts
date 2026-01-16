/**
 * Cronos Facilitator Client
 * Handles payment verification and settlement through Cronos facilitator API
 *
 * The Cronos facilitator expects:
 * - paymentHeader: Base64-encoded JSON containing the EIP-3009 payload
 * - paymentRequirements: The payment requirements object
 *
 * The paymentHeader structure (before base64 encoding):
 * {
 *   "x402Version": 1,
 *   "scheme": "exact",
 *   "network": "cronos-testnet",
 *   "payload": {
 *     "from": "0x...",
 *     "to": "0x...",
 *     "value": "10000",
 *     "validAfter": 0,
 *     "validBefore": 1736933200,
 *     "nonce": "0x...",
 *     "signature": "0x...",
 *     "asset": "0x..."
 *   }
 * }
 */

import type { PaymentPayload, CronosPaymentRequirements as PaymentRequirements } from "../types/index.js";
import { CRONOS_FACILITATOR_URL, type CronosNetwork, isCronosNetwork } from "./cronos-x402.js";

/**
 * Request body for Cronos facilitator /verify endpoint
 */
export interface CronosFacilitatorVerifyRequest {
  x402Version: number;
  paymentHeader: string; // Base64-encoded payment header
  paymentRequirements: PaymentRequirements;
}

export interface CronosFacilitatorVerifyResponse {
  isValid: boolean;
  payer?: string; // Address of the payer
  invalidReason?: string | null;
  transaction?: string; // Transaction hash if already settled
}

/**
 * Request body for Cronos facilitator /settle endpoint
 */
export interface CronosFacilitatorSettleRequest {
  x402Version: number;
  paymentHeader: string;
  paymentRequirements: PaymentRequirements;
}

export interface CronosFacilitatorSettleResponse {
  success: boolean;
  transaction?: string; // Transaction hash
  txHash?: string; // Alternative field name used by facilitator
  network?: string;
  payer?: string;
  from?: string; // Alternative field name used by facilitator
  errorReason?: string;
  error?: string; // Alternative field name used by facilitator
  event?: string; // "payment.settled" or "payment.failed"
}

export interface CronosFacilitatorSupportedResponse {
  kinds: Array<{
    x402Version: number;
    network: string;
    scheme: string;
  }>;
}

export class CronosFacilitatorClient {
  private baseUrl: string;

  constructor(baseUrl: string = CRONOS_FACILITATOR_URL) {
    this.baseUrl = baseUrl.replace(/\/$/, ""); // Remove trailing slash
  }

  /**
   * Encode a payment payload to base64 for the facilitator
   */
  private encodePaymentHeader(paymentPayload: PaymentPayload): string {
    const jsonString = JSON.stringify(paymentPayload);
    if (typeof btoa === 'function') {
      return btoa(jsonString);
    } else if (typeof Buffer !== 'undefined') {
      return Buffer.from(jsonString, 'utf-8').toString('base64');
    } else {
      throw new Error('No base64 encoder available');
    }
  }

  /**
   * Verify a payment through the Cronos facilitator
   *
   * The facilitator expects the paymentHeader to be the Base64-encoded JSON
   * containing the full payment header structure (x402Version, scheme, network, payload).
   */
  async verify(
    paymentPayload: PaymentPayload,
    requirements: PaymentRequirements
  ): Promise<CronosFacilitatorVerifyResponse> {
    // Only handle Cronos networks
    if (!isCronosNetwork(requirements.network)) {
      return {
        isValid: false,
        invalidReason: "UNSUPPORTED_NETWORK",
      };
    }

    try {
      // Encode the full payment payload as base64
      const paymentHeader = this.encodePaymentHeader(paymentPayload);

      const request: CronosFacilitatorVerifyRequest = {
        x402Version: paymentPayload.x402Version ?? 1,
        paymentHeader,
        paymentRequirements: requirements,
      };

      console.log('[CronosFacilitator] Verify request URL:', `${this.baseUrl}/verify`);
      console.log('[CronosFacilitator] Verify request body:', JSON.stringify(request, null, 2));

      const response = await fetch(`${this.baseUrl}/verify`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X402-Version": "1",
        },
        body: JSON.stringify(request),
      });

      const responseText = await response.text();
      console.log('[CronosFacilitator] Verify response status:', response.status);
      console.log('[CronosFacilitator] Verify response body:', responseText);

      if (!response.ok) {
        return {
          isValid: false,
          invalidReason: `FACILITATOR_ERROR: ${response.status} - ${responseText}`,
        };
      }

      const result: CronosFacilitatorVerifyResponse = JSON.parse(responseText);
      return result;
    } catch (error) {
      console.error("Facilitator verify error:", error);
      return {
        isValid: false,
        invalidReason: `FACILITATOR_NETWORK_ERROR: ${error instanceof Error ? error.message : String(error)}`,
      };
    }
  }

  /**
   * Settle a payment (submit transaction on-chain) through the Cronos facilitator
   * For USDC.e: The facilitator will execute transferWithAuthorization (EIP-3009)
   */
  async settle(
    paymentPayload: PaymentPayload,
    requirements: PaymentRequirements
  ): Promise<CronosFacilitatorSettleResponse> {
    // Only handle Cronos networks
    if (!isCronosNetwork(requirements.network)) {
      return {
        success: false,
        errorReason: "UNSUPPORTED_NETWORK",
      };
    }

    try {
      // Encode the full payment payload as base64
      const paymentHeader = this.encodePaymentHeader(paymentPayload);

      const request: CronosFacilitatorSettleRequest = {
        x402Version: paymentPayload.x402Version ?? 1,
        paymentHeader,
        paymentRequirements: requirements,
      };

      console.log('[CronosFacilitator] Settle request URL:', `${this.baseUrl}/settle`);
      console.log('[CronosFacilitator] Settle request body:', JSON.stringify(request, null, 2));

      const response = await fetch(`${this.baseUrl}/settle`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X402-Version": "1",
        },
        body: JSON.stringify(request),
      });

      const responseText = await response.text();
      console.log('[CronosFacilitator] Settle response status:', response.status);
      console.log('[CronosFacilitator] Settle response body:', responseText);

      if (!response.ok) {
        return {
          success: false,
          errorReason: `FACILITATOR_ERROR: ${response.status} - ${responseText}`,
        };
      }

      const result = JSON.parse(responseText);

      // Normalize the response - facilitator uses different field names
      return {
        success: result.event === 'payment.settled' || result.success === true,
        transaction: result.txHash || result.transaction,
        network: result.network || requirements.network,
        payer: result.from || result.payer,
        errorReason: result.error || result.errorReason,
        event: result.event,
      };
    } catch (error) {
      console.error("Facilitator settle error:", error);
      return {
        success: false,
        errorReason: `FACILITATOR_NETWORK_ERROR: ${error instanceof Error ? error.message : String(error)}`,
      };
    }
  }

  /**
   * Get supported payment kinds from the Cronos facilitator
   */
  async supported(): Promise<CronosFacilitatorSupportedResponse> {
    try {
      const response = await fetch(`${this.baseUrl}/supported`, {
        method: "GET",
        headers: {
          "Content-Type": "application/json",
        },
      });

      if (!response.ok) {
        throw new Error(`Facilitator supported failed: ${response.status}`);
      }

      const result: CronosFacilitatorSupportedResponse = await response.json();
      return result;
    } catch (error) {
      console.error("Facilitator supported error:", error);
      // Return Cronos networks as fallback
      return {
        kinds: [
          {
            x402Version: 1,
            network: "cronos-testnet",
            scheme: "exact",
          },
          {
            x402Version: 1,
            network: "cronos-mainnet",
            scheme: "exact",
          },
        ],
      };
    }
  }
}

/**
 * Create a Cronos facilitator client instance
 */
export function createCronosFacilitator(url?: string): CronosFacilitatorClient {
  return new CronosFacilitatorClient(url);
}

/**
 * Factory function compatible with x402's useFacilitator pattern
 * Returns verify, settle, and supported functions
 */
export function useCronosFacilitator(config: { url: string } = { url: CRONOS_FACILITATOR_URL }) {
  const client = createCronosFacilitator(config.url);

  return {
    verify: client.verify.bind(client),
    settle: client.settle.bind(client),
    supported: client.supported.bind(client),
  };
}
