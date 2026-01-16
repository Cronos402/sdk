/**
 * Cronos402 Server Plugin
 * Adds paid tool functionality to MCP servers using Cronos payment network
 *
 * This is a Cronos-only implementation using EIP-3009 (gasless USDC.e transfers)
 */
import type { McpServer, RegisteredTool, ToolCallback } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { CallToolResult, ToolAnnotations } from "@modelcontextprotocol/sdk/types.js";
import type { ZodRawShape } from "zod";
import { getAddress } from "viem";

import {
  type CronosNetwork,
  priceToAtomicAmount,
  isCronosNetwork,
  CRONOS_FACILITATOR_URL,
} from "../../../utils/cronos-x402.js";
import { useCronosFacilitator } from "../../../utils/cronos-facilitator.js";
import {
  decodeCronosPayment,
  findMatchingCronosRequirements,
} from "../../../utils/cronos-decode.js";
import type {
  CronosPaymentRequirements,
  CronosPaymentHeader,
  Price,
  RecipientWithTestnet,
  FacilitatorConfig,
} from "../../../types/index.js";

// Cronos-only supported networks
const SupportedCronosNetworks: CronosNetwork[] = ["cronos-testnet", "cronos-mainnet"];

// Re-export types for backward compatibility
export type { Price, RecipientWithTestnet, FacilitatorConfig };

export type X402Config = {
  recipient:
    | Partial<Record<string, string>>
    | Partial<Record<"evm", RecipientWithTestnet>>;
  facilitator?: FacilitatorConfig;
  version?: number;
};

export interface X402AugmentedServer {
  paidTool<Args extends ZodRawShape>(
    name: string,
    description: string,
    price: Price,
    paramsSchema: Args,
    annotations: ToolAnnotations,
    cb: ToolCallback<Args>
  ): RegisteredTool;
}

export function withX402<S extends McpServer>(
  server: S,
  cfg: X402Config
): S & X402AugmentedServer {
  const facilitatorUrl = cfg.facilitator?.url ?? CRONOS_FACILITATOR_URL;
  const { verify, settle } = useCronosFacilitator({ url: facilitatorUrl });
  const x402Version = cfg.version ?? 1;

  // Normalize recipients to a per-network map (Cronos-only)
  const normalizeRecipients = (
    r: X402Config["recipient"]
  ): Partial<Record<string, string>> => {
    if (!r || typeof r !== "object") return {};

    const out: Partial<Record<string, string>> = {};

    // Helper to detect if a network is a testnet
    const isTestnetNetwork = (network: string): boolean => {
      return network.includes("testnet");
    };

    // Expand evm shorthand for Cronos networks
    const maybeFamily = r as Partial<Record<"evm", RecipientWithTestnet>>;
    if (maybeFamily.evm && typeof maybeFamily.evm.address === "string") {
      const useTestnet = maybeFamily.evm.isTestnet;
      for (const net of SupportedCronosNetworks) {
        if (useTestnet === undefined || isTestnetNetwork(net) === !!useTestnet) {
          out[net] = maybeFamily.evm.address;
        }
      }
    }

    // Copy explicit per-network mappings (override expanded ones if present)
    for (const [key, value] of Object.entries(r as Record<string, unknown>)) {
      if (typeof value === "string" && SupportedCronosNetworks.includes(key as CronosNetwork)) {
        out[key] = value;
      }
    }

    return out;
  };

  function paidTool<Args extends ZodRawShape>(
    name: string,
    description: string,
    price: Price,
    paramsSchema: Args,
    annotations: ToolAnnotations,
    cb: ToolCallback<Args>
  ): RegisteredTool {
    // Build synchronous payment information for annotations
    const recipientsByNetwork = normalizeRecipients(cfg.recipient);
    const paymentNetworks: unknown[] = [];

    // Convert price to string for processing
    const priceStr = typeof price === 'string' ? price : String(price);

    // Build basic network info synchronously (Cronos-only)
    const networks = Object.keys(recipientsByNetwork);
    for (const network of networks) {
      if (!isCronosNetwork(network)) continue; // Only Cronos networks

      const payTo = recipientsByNetwork[network];
      if (!payTo) continue;

      try {
        const atomic = priceToAtomicAmount(priceStr, network);
        const { maxAmountRequired, asset } = atomic;

        const networkInfo = {
          network,
          recipient: payTo,
          maxAmountRequired: maxAmountRequired.toString(),
          asset: {
            address: asset.address,
            symbol: asset.symbol,
            decimals: asset.decimals
          },
          type: 'evm' as const // Cronos is EVM
        };

        paymentNetworks.push(networkInfo);
      } catch (error) {
        console.warn(`Failed to process price for network ${network}:`, error);
        continue;
      }
    }

    return server.tool(
      name,
      description,
      paramsSchema,
      {
        ...annotations,
        paymentHint: true,
        paymentPriceUSD: price,
        paymentNetworks,
        paymentVersion: x402Version
      },
      (async (args, extra) => {
        const recipientsByNetwork = normalizeRecipients(cfg.recipient);

        // Build PaymentRequirements across Cronos networks
        const buildRequirements = async (): Promise<CronosPaymentRequirements[]> => {
          const reqs: CronosPaymentRequirements[] = [];

          // Convert price to string for processing
          const priceStr = typeof price === 'string' ? price : String(price);

          const networks = Object.keys(recipientsByNetwork);
          for (const network of networks) {
            if (!isCronosNetwork(network)) continue; // Only Cronos networks

            const payTo = recipientsByNetwork[network];
            if (!payTo) continue;

            try {
              const atomic = priceToAtomicAmount(priceStr, network);
              const { maxAmountRequired, asset } = atomic;

              // Extract EIP-712 domain if available (for USDC.e gasless transfers)
              const extra = asset.eip712 as Record<string, unknown> | undefined;

              const normalizedPayTo = getAddress(String(payTo));
              const normalizedAsset = getAddress(String(asset.address));

              reqs.push({
                scheme: "exact",
                network: network,
                maxAmountRequired: maxAmountRequired.toString(),
                payTo: normalizedPayTo,
                asset: normalizedAsset,
                maxTimeoutSeconds: 300,
                resource: `mcp://${name}`,
                mimeType: "application/json",
                description,
                extra,
              });
            } catch (error) {
              console.warn(`Failed to build requirements for network ${network}:`, error);
              continue;
            }
          }

          return reqs;
        };

        const accepts = await buildRequirements();
        if (!accepts.length) {
          const payload = { x402Version, error: "PRICE_COMPUTE_FAILED" } as const;
          const err: CallToolResult = {
            isError: true,
            _meta: { "x402/error": payload },
            content: [{ type: "text", text: JSON.stringify(payload) }],
          };
          return err;
        }

        // Get token either from MCP _meta or from header
        const requestInfoUnknown: unknown = (extra as { requestInfo?: unknown }).requestInfo;
        const headersUnknown: unknown = requestInfoUnknown && (requestInfoUnknown as { headers?: unknown }).headers;
        const headerToken = (() => {
          if (!headersUnknown) return undefined;
          if (typeof (headersUnknown as Headers).get === "function") {
            return (headersUnknown as Headers).get("X-PAYMENT") ?? undefined;
          }
          if (typeof headersUnknown === "object" && headersUnknown !== null) {
            const rec = headersUnknown as Record<string, unknown>;
            const direct = rec["X-PAYMENT"] ?? rec["x-payment"];
            return typeof direct === "string" ? direct : undefined;
          }
          return undefined;
        })();

        const metaToken = (extra?._meta && (extra._meta as Record<string, unknown>)["x402/payment"]) as string | undefined;
        const token = metaToken ?? headerToken;

        const paymentRequired = (
          reason = "PAYMENT_REQUIRED",
          extraFields: Record<string, unknown> = {}
        ): CallToolResult => {
          const payload = {
            x402Version,
            error: reason,
            accepts,
            ...extraFields,
          } as const;
          return {
            isError: true,
            _meta: { "x402/error": payload },
            content: [{ type: "text", text: JSON.stringify(payload) }],
          };
        };

        if (!token || typeof token !== "string") return paymentRequired();

        // Decode using Cronos format (flat payload, not nested x402 format)
        let decoded: CronosPaymentHeader;
        try {
          decoded = decodeCronosPayment(token);
          console.log('[withX402] Decoded Cronos payment:', JSON.stringify(decoded, null, 2));
        } catch (err) {
          console.error('[withX402] Failed to decode payment:', err);
          return paymentRequired("INVALID_PAYMENT");
        }

        const selected = findMatchingCronosRequirements(accepts, decoded);
        if (!selected) {
          console.log('[withX402] No matching requirements found');
          return paymentRequired("UNABLE_TO_MATCH_PAYMENT_REQUIREMENTS");
        }

        // Convert to PaymentPayload for facilitator
        const paymentPayload = {
          x402Version,
          scheme: decoded.scheme,
          network: decoded.network,
          payload: decoded.payload,
        };

        console.log('[withX402] Verifying payment with Cronos facilitator...');
        const vr = await verify(paymentPayload as any, selected as any);
        console.log('[withX402] Verify result:', vr);

        if (!vr.isValid) {
          return paymentRequired(vr.invalidReason ?? "INVALID_PAYMENT", {
            payer: vr.payer,
          });
        }

        // Execute tool
        let result: CallToolResult;
        let failed = false;
        try {
          result = await cb(args, extra);
          if (
            result &&
            typeof result === "object" &&
            "isError" in result &&
            (result as { isError?: boolean }).isError
          ) {
            failed = true;
          }
        } catch (e) {
          failed = true;
          result = {
            isError: true,
            content: [
              { type: "text", text: `Tool execution failed: ${String(e)}` },
            ],
          };
        }

        // Settle only on success
        if (!failed) {
          try {
            console.log('[withX402] Settling payment with Cronos facilitator...');
            const s = await settle(paymentPayload as any, selected as any);
            console.log('[withX402] Settle result:', s);

            if (s.success) {
              result._meta ??= {} as Record<string, unknown>;
              (result._meta as Record<string, unknown>)[
                "x402/payment-response"
              ] = {
                success: true,
                transaction: s.transaction,
                network: s.network,
                payer: s.payer,
              };
            } else {
              return paymentRequired(s.errorReason ?? "SETTLEMENT_FAILED");
            }
          } catch (err) {
            console.error('[withX402] Settlement error:', err);
            return paymentRequired("SETTLEMENT_FAILED");
          }
        }

        return result;
      }) as ToolCallback<Args>
    );
  }

  Object.defineProperty(server, "paidTool", {
    value: paidTool,
    writable: false,
    enumerable: false,
    configurable: true,
  });

  return server as S & X402AugmentedServer;
}
