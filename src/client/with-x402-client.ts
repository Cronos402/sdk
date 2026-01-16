/**
 * Cronos402 Client Wrapper
 * Wraps MCP clients with Cronos payment capabilities using EIP-3009 (gasless USDC.e)
 *
 * This is a Cronos-only implementation - no fallback to generic x402.
 */
import type { Client as MCPClient } from '@modelcontextprotocol/sdk/client/index.js';
import type { RequestOptions } from '@modelcontextprotocol/sdk/shared/protocol.js';
import type {
    CallToolRequest,
    CallToolResult,
    CallToolResultSchema,
    CompatibilityCallToolResultSchema
} from '@modelcontextprotocol/sdk/types.js';
import { isCronosNetwork, type CronosNetwork } from '../utils/cronos-x402.js';
import { createCronosPaymentHeader } from '../utils/cronos-payment-header.js';
import type {
  CronosPaymentRequirements,
  CronosSigner,
} from '../types/index.js';

// Cronos-only supported networks
const SupportedCronosNetworks: CronosNetwork[] = ['cronos', 'cronos-testnet'];

// Re-export types for backward compatibility
export type { CronosPaymentRequirements, CronosSigner };

export interface X402AugmentedClient {
  callTool(
    params: CallToolRequest["params"],
    resultSchema?:
      | typeof CallToolResultSchema
      | typeof CompatibilityCallToolResultSchema,
    options?: RequestOptions
  ): Promise<CallToolResult>;
}

export type X402ClientConfig = {
  wallet: CronosSigner;
  maxPaymentValue?: bigint;
  version?: number;
  confirmationCallback?: (payment: CronosPaymentRequirements[]) => Promise<
    | boolean
    | number
    | { index: number }
    | { network: CronosNetwork }
    | { requirement: CronosPaymentRequirements }
  >; // Allows declining (false), approving (true), or selecting which requirement
};

/**
 * Wraps an MCP client with Cronos payment capabilities
 * Supports only Cronos networks (cronos-testnet, cronos-mainnet)
 */
export function withX402Client<T extends MCPClient>(
  client: T,
  x402Config: X402ClientConfig
): X402AugmentedClient & T {
  const { wallet: walletConfig, version } = x402Config;
  // Cronos-only: only EVM signer supported
  const signer: CronosSigner = { evm: walletConfig.evm };

  const maxPaymentValue = x402Config.maxPaymentValue ?? BigInt(0.1 * 10 ** 6); // 0.10 USDC

  const _listTools = client.listTools.bind(client);

  // Wrap the original method to include payment information in the description
  const listTools: typeof _listTools = async (params, options) => {
    const toolsRes = await _listTools(params, options);
    toolsRes.tools = toolsRes.tools.map((tool) => {
      let description = tool.description;
      if (tool.annotations?.paymentHint) {
        const cost = tool.annotations?.paymentPriceUSD
          ? `$${tool.annotations?.paymentPriceUSD}`
          : "an unknown amount";

        let paymentDetails = ` (This is a paid tool, you will be charged ${cost} for its execution)`;

        // Add detailed payment information if available
        if (tool.annotations?.paymentNetworks && Array.isArray(tool.annotations.paymentNetworks)) {
          const networks = tool.annotations.paymentNetworks as Array<{
            network: string;
            recipient: string;
            maxAmountRequired: string;
            asset: { address: string; symbol?: string; decimals?: number };
            type: 'evm';
          }>;

          if (networks.length > 0) {
            paymentDetails += `\n\nPayment Details:`;
            networks.forEach((net) => {
              const amount = net.maxAmountRequired;
              const symbol = net.asset.symbol || 'tokens';
              const decimals = net.asset.decimals || 6;
              const formattedAmount = (Number(amount) / Math.pow(10, decimals)).toFixed(decimals);

              paymentDetails += `\n• ${net.network} (${net.type.toUpperCase()}): ${formattedAmount} ${symbol}`;
              paymentDetails += `\n  Recipient: ${net.recipient}`;
              paymentDetails += `\n  Asset: ${net.asset.address}`;
            });
          }
        }

        description += paymentDetails;
      }
      return {
        ...tool,
        description
      };
    });
    return toolsRes;
  };

  const _callTool = client.callTool.bind(client);

  const callToolWithPayment = async (
    params: CallToolRequest["params"],
    resultSchema?:
      | typeof CallToolResultSchema
      | typeof CompatibilityCallToolResultSchema,
    options?: RequestOptions
  ): ReturnType<typeof client.callTool> => {
    // call the tool
    const res = await _callTool(params, resultSchema, options);

    // If it errored and returned accepts, we need to confirm payment
    const maybeX402Error = res._meta?.["x402/error"] as
      | { accepts: CronosPaymentRequirements[] }
      | undefined;

    if (
      res.isError &&
      maybeX402Error &&
      maybeX402Error.accepts &&
      Array.isArray(maybeX402Error.accepts) &&
      maybeX402Error.accepts.length > 0
    ) {
      const accepts = maybeX402Error.accepts;
      const confirmationCallback = x402Config.confirmationCallback;

      // Build supported networks - Cronos only
      const supportedNetworks: string[] = [];
      if (signer.evm) {
        for (const net of SupportedCronosNetworks) {
          if (isCronosNetwork(net)) {
            supportedNetworks.push(net);
          }
        }
      }

      // Resolve selection from confirmation callback (if provided)
      let selectedReq: CronosPaymentRequirements | undefined;
      if (confirmationCallback) {
        const selection = await confirmationCallback(accepts);

        if (selection === false) {
          return {
            isError: true,
            content: [{ type: "text", text: "User declined payment" }]
          };
        }

        // If boolean true, we just proceed to default selection below
        if (selection !== true) {
          if (typeof selection === 'number') {
            const idx = selection;
            if (Number.isInteger(idx) && idx >= 0 && idx < accepts.length) {
              selectedReq = accepts[idx];
            }
          } else if (typeof selection === 'object' && selection) {
            if ('index' in selection) {
              const idx = selection.index;
              if (Number.isInteger(idx) && idx >= 0 && idx < accepts.length) {
                selectedReq = accepts[idx];
              }
            } else if ('network' in selection) {
              const net = selection.network;
              selectedReq = accepts.find((a) => a.network === net && a.scheme === 'exact');
            } else if ('requirement' in selection) {
              const reqSel = selection.requirement;
              selectedReq = accepts.find((a) =>
                a.scheme === reqSel.scheme &&
                a.network === reqSel.network &&
                a.maxAmountRequired === reqSel.maxAmountRequired &&
                a.payTo === reqSel.payTo &&
                a.asset === reqSel.asset
              );
            }
          }
        }
      }

      // Default or fallback selection - prefer Cronos networks
      const req = selectedReq ?? (
        accepts.find((a) => a?.scheme === "exact" && supportedNetworks.includes(a.network as string))
        ?? accepts.find((a) => a?.scheme === "exact")
        ?? accepts[0]
      );

      if (!req || req.scheme !== "exact") {
        return res;
      }

      // Verify it's a Cronos network
      if (!isCronosNetwork(req.network as string)) {
        return {
          isError: true,
          content: [
            {
              type: "text",
              text: `Unsupported network: ${req.network}. Only Cronos networks are supported.`
            }
          ]
        };
      }

      const maxAmountRequired = BigInt(req.maxAmountRequired);
      if (maxAmountRequired > maxPaymentValue) {
        return {
          isError: true,
          content: [
            {
              type: "text",
              text: `Payment exceeds client cap: ${maxAmountRequired} > ${maxPaymentValue}`
            }
          ]
        };
      }

      // Create Cronos payment header (EIP-3009 authorization)
      const token = await createCronosPaymentHeader(
        { evm: signer.evm } as any, // Cast to satisfy the function signature
        version ?? 1,
        req as any // Cast to PaymentRequirements
      );

      // Call the tool with the payment token
      const paidRes = await _callTool(
        {
          ...params,
          _meta: {
            ...(params._meta ?? {}),
            "x402/payment": token
          }
        },
        resultSchema,
        options
      );
      return paidRes;
    }

    return res;
  };

  const _client = client as X402AugmentedClient & T;
  _client.listTools = listTools;
  Object.defineProperty(_client, "callTool", {
    value: callToolWithPayment,
    writable: false,
    enumerable: false,
    configurable: true
  });

  return _client;
}
