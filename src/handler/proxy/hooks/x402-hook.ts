/**
 * X402 Monetization Hook for Cronos Networks Only
 * Supports: cronos (mainnet) and cronos-testnet
 *
 * Uses Cronos-specific facilitator for payment verification and settlement.
 * The payload format differs from standard x402 - it uses a flat structure
 * as expected by the Cronos facilitator.
 */
import type { CallToolRequest, CallToolResult, TextContent, ListToolsResult } from "@modelcontextprotocol/sdk/types.js";
import { getAddress } from "viem";
import type { Hook, RequestExtra, ListToolsRequestWithContext } from "../hooks.js";
import {
    priceToAtomicAmount as cronosPriceToAtomicAmount,
    isCronosNetwork,
    type CronosNetwork,
    CRONOS_FACILITATOR_URL
} from "../../../utils/cronos-x402.js";
import { useCronosFacilitator } from "../../../utils/cronos-facilitator.js";
import {
    decodeCronosPayment,
    findMatchingCronosRequirements,
    toPaymentPayload,
} from "../../../utils/cronos-decode.js";
import type {
    CronosPaymentRequirements as PaymentRequirements,
    CronosPaymentHeader,
    PaymentPayload,
    Price,
    FacilitatorConfig,
} from "../../../types/index.js";

// Supported networks - Cronos only
const SupportedCronosNetworks = ['cronos', 'cronos-testnet'] as const;

export type RecipientWithTestnet = { address: string; isTestnet?: boolean };

// Payment settled event data
export interface PaymentSettledEvent {
    toolName: string;
    transactionHash?: string;
    network: string;
    payer?: string;
    amount: string;
    status: 'completed' | 'failed';
}

export type X402ProxyConfig = {
    recipient: Partial<Record<string, string>> | Partial<Record<"evm", RecipientWithTestnet>>;
    facilitator?: FacilitatorConfig;
    version?: number;
    prices: Record<string, Price>; // toolName -> Price
    onPaymentSettled?: (event: PaymentSettledEvent) => void | Promise<void>; // Callback for payment tracking
};

export class X402MonetizationHook implements Hook {
    name = "x402-monetization";
    private readonly cfg: X402ProxyConfig;
    private readonly verify: ReturnType<typeof useCronosFacilitator>["verify"];
    private readonly settle: ReturnType<typeof useCronosFacilitator>["settle"];
    private readonly x402Version: number;

    constructor(cfg: X402ProxyConfig) {
        this.cfg = cfg;
        // Use Cronos-specific facilitator instead of generic x402 facilitator
        const facilitatorUrl = cfg.facilitator?.url || CRONOS_FACILITATOR_URL;
        const { verify, settle } = useCronosFacilitator({ url: facilitatorUrl });
        this.verify = verify;
        this.settle = settle;
        this.x402Version = cfg.version ?? 1;
    }

    private normalizeRecipients(r: X402ProxyConfig["recipient"]): Partial<Record<string, string>> {
        if (!r || typeof r !== "object") return {};
        const out: Partial<Record<string, string>> = {};

        const isTestnetNetwork = (network: string): boolean =>
            network.includes("testnet");

        // Handle the evm format: { evm: { address: "0x...", isTestnet: true } }
        const maybeFamily = r as Partial<Record<"evm", RecipientWithTestnet>>;
        if (maybeFamily.evm?.address) {
            const useTestnet = maybeFamily.evm.isTestnet;
            // Only add Cronos networks based on testnet flag
            for (const net of SupportedCronosNetworks) {
                if (useTestnet === undefined || isTestnetNetwork(net) === !!useTestnet) {
                    out[net] = maybeFamily.evm.address;
                }
            }
        }

        // Handle direct network format: { "cronos-testnet": "0x..." }
        for (const [key, value] of Object.entries(r as Record<string, unknown>)) {
            if (typeof value === "string" && isCronosNetwork(key)) {
                out[key] = value;
            }
        }

        return out;
    }

    /**
     * Extract numeric USD value from x402 Price type
     * Price can be: string, number, or ERC20TokenAmount object
     */
    private extractPriceValue(price: Price): number {
        if (typeof price === 'string') {
            return parseFloat(price.replace(/[^0-9.]/g, ''));
        }
        if (typeof price === 'number') {
            return price;
        }
        // Handle ERC20TokenAmount object - extract the amount field
        if (typeof price === 'object' && price !== null) {
            const priceObj = price as { amount?: string | number; value?: string | number };
            const val = priceObj.amount ?? priceObj.value;
            if (typeof val === 'string') return parseFloat(val);
            if (typeof val === 'number') return val;
        }
        return 0;
    }

    private async buildRequirements(toolName: string, description: string, price: Price) {
        const recipientsByNetwork = this.normalizeRecipients(this.cfg.recipient);
        console.log('[X402Hook] buildRequirements - recipientsByNetwork:', recipientsByNetwork);

        const reqs: PaymentRequirements[] = [];

        const networks = Object.keys(recipientsByNetwork);
        console.log('[X402Hook] buildRequirements - networks to process:', networks);

        for (const network of networks) {
            const payTo = recipientsByNetwork[network];
            console.log('[X402Hook] Processing network:', network, 'payTo:', payTo);
            if (!network || !payTo) continue;

            // Only process Cronos networks
            if (!isCronosNetwork(network)) continue;

            // Use Cronos-specific price conversion
            let atomic;
            try {
                // Map network names: "cronos" -> "cronos-mainnet" for priceToAtomicAmount
                const cronosNet = network === 'cronos' ? 'cronos-mainnet' : network as CronosNetwork;
                // Extract numeric USD value from Price type
                const priceValue = this.extractPriceValue(price);
                atomic = cronosPriceToAtomicAmount(priceValue, cronosNet, "USDC.e");
            } catch {
                // Skip networks where price conversion fails
                continue;
            }

            const { maxAmountRequired, asset } = atomic;

            // Extract EIP-712 domain for USDC.e gasless transfers
            const extra = asset.eip712 as Record<string, unknown> | undefined;
            const normalizedPayTo = getAddress(String(payTo));
            const normalizedAsset = getAddress(String(asset.address));

            reqs.push({
                scheme: "exact" as const,
                network: network as any, // Cast to satisfy x402 types
                maxAmountRequired: maxAmountRequired.toString(), // Convert bigint to string
                payTo: normalizedPayTo,
                asset: normalizedAsset,
                maxTimeoutSeconds: 300,
                resource: `mcp://${toolName}`,
                mimeType: "application/json",
                description,
                extra,
            });
        }

        return reqs;
    }

    private paymentRequired(accepts: PaymentRequirements[], reason: string, extraFields: Record<string, unknown> = {}): CallToolResult {
        const payload = { x402Version: this.x402Version, error: reason, accepts, ...extraFields } as const;
        return {
            isError: true,
            _meta: { "x402/error": payload } as Record<string, unknown>,
            content: [{ type: "text", text: JSON.stringify(payload) }],
        };
    }

    async processCallToolRequest(req: CallToolRequest, extra: RequestExtra) {
        const name = String((req?.params as unknown as { name: string })?.name ?? "");
        console.log('[X402Hook] processCallToolRequest - tool name:', name);

        if (!name) {
            console.log('[X402Hook] No tool name, continuing');
            return { resultType: "continue" as const, request: req };
        }

        const price = this.cfg.prices[name];
        console.log('[X402Hook] Price for tool:', name, '=', price);
        console.log('[X402Hook] Available prices:', Object.keys(this.cfg.prices));

        if (!price) {
            console.log('[X402Hook] No price configured for tool, continuing (free tool)');
            return { resultType: "continue" as const, request: req };
        }

        const description = `Paid access to ${name}`;
        const accepts = await this.buildRequirements(name, description, price);
        console.log('[X402Hook] Built payment requirements:', accepts.length, 'options');

        if (!accepts.length) {
            console.log('[X402Hook] No payment requirements built, returning PRICE_COMPUTE_FAILED');
            return { resultType: "respond" as const, response: this.paymentRequired(accepts, "PRICE_COMPUTE_FAILED") };
        }

        const params = (req.params ?? {}) as Record<string, unknown>;
        const meta = (params._meta as Record<string, unknown> | undefined) ?? {};
        const token = typeof meta["x402/payment"] === "string" ? (meta["x402/payment"] as string) : undefined;
        console.log('[X402Hook] Payment token present:', !!token);

        if (!token) {
            console.log('[X402Hook] No payment token, returning PAYMENT_REQUIRED');
            return { resultType: "respond" as const, response: this.paymentRequired(accepts, "PAYMENT_REQUIRED") };
        }

        // Decode using Cronos format (flat payload, not nested x402 format)
        let decoded: CronosPaymentHeader;
        try {
            decoded = decodeCronosPayment(token);
            console.log('[X402Hook] Decoded Cronos payment header:', JSON.stringify(decoded, null, 2));
        } catch (err) {
            console.error('[X402Hook] Failed to decode payment:', err);
            return { resultType: "respond" as const, response: this.paymentRequired(accepts, "INVALID_PAYMENT") };
        }

        const selected = findMatchingCronosRequirements(accepts, decoded);
        if (!selected) {
            console.log('[X402Hook] No matching requirements found');
            return { resultType: "respond" as const, response: this.paymentRequired(accepts, "UNABLE_TO_MATCH_PAYMENT_REQUIREMENTS") };
        }

        // Convert Cronos format to PaymentPayload for facilitator
        const paymentPayload: PaymentPayload = {
            x402Version: this.x402Version,
            scheme: decoded.scheme,
            network: decoded.network as any,
            payload: decoded.payload as any, // Cronos flat format
        };

        console.log('[X402Hook] Verifying payment with Cronos facilitator...');
        const vr = await this.verify(paymentPayload, selected);
        console.log('[X402Hook] Verify result:', vr);

        if (!vr.isValid) {
            return {
                resultType: "respond" as const,
                response: this.paymentRequired(accepts, vr.invalidReason ?? "INVALID_PAYMENT", { payer: vr.payer }),
            };
        }

        return { resultType: "continue" as const, request: req };
    }

    async processCallToolResult(res: CallToolResult, original: CallToolRequest, extra: RequestExtra) {
        // Recompute payment context statelessly from the original request
        const name = String((original?.params as unknown as { name: string })?.name ?? "");
        const price = name ? this.cfg.prices[name] : undefined;
        const params = (original.params ?? {}) as Record<string, unknown>;
        const meta = (params._meta as Record<string, unknown> | undefined) ?? {};
        const token = typeof meta["x402/payment"] === "string" ? (meta["x402/payment"] as string) : undefined;

        // If not a paid tool or missing token, pass through
        if (!name || !price || !token) return { resultType: "continue" as const, response: res };

        const failed =
            !!res?.isError ||
            (Array.isArray(res?.content) && res.content.length === 1 && typeof (res.content[0] as any)?.text === "string" &&
                (res.content[0] as any).text.includes("error"));

        if (failed) {
            return { resultType: "continue" as const, response: res };
        }

        try {
            // Rebuild requirements and selected match
            const accepts = await this.buildRequirements(name, `Paid access to ${name}`, price);

            // Decode using Cronos format
            let decoded: CronosPaymentHeader;
            try {
                decoded = decodeCronosPayment(token);
            } catch {
                return { resultType: "continue" as const, response: res };
            }

            const selected = findMatchingCronosRequirements(accepts, decoded);
            if (!selected) {
                return { resultType: "continue" as const, response: res };
            }

            // Convert Cronos format to PaymentPayload for facilitator
            const paymentPayload: PaymentPayload = {
                x402Version: this.x402Version,
                scheme: decoded.scheme,
                network: decoded.network as any,
                payload: decoded.payload as any,
            };

            console.log('[X402Hook] Settling payment with Cronos facilitator...');
            const s = await this.settle(paymentPayload, selected);
            console.log('[X402Hook] Settle result:', s);
            if (s.success) {
                // Call the onPaymentSettled callback if provided
                if (this.cfg.onPaymentSettled) {
                    try {
                        await this.cfg.onPaymentSettled({
                            toolName: name,
                            transactionHash: s.transaction,
                            network: s.network ?? selected.network,
                            payer: s.payer,
                            amount: selected.maxAmountRequired,
                            status: 'completed',
                        });
                    } catch (callbackErr) {
                        console.error('[X402Hook] onPaymentSettled callback error:', callbackErr);
                    }
                }

                const meta = ((res._meta as Record<string, unknown> | undefined) ?? {}) as Record<string, unknown>;
                meta["x402/payment-response"] = {
                    success: true,
                    transaction: s.transaction,
                    network: s.network,
                    payer: s.payer,
                };
                const content = [];
                if (Array.isArray(res.content)) {
                    content.push(...res.content);
                }
                const note = `Payment settled on ${s.network} (tx: ${s.transaction ?? "n/a"}).`;
                content.push({ type: "text", text: note } as TextContent);
                const response: CallToolResult = { ...res, _meta: meta, content };
                return { resultType: "continue" as const, response };
            }
            const response = this.paymentRequired([], s.errorReason ?? "SETTLEMENT_FAILED");
            return { resultType: "continue" as const, response };
        } catch {
            const response = this.paymentRequired([], "SETTLEMENT_FAILED");
            return { resultType: "continue" as const, response };
        }
    }

    async processListToolsResult(result: ListToolsResult, originalRequest: ListToolsRequestWithContext, extra: RequestExtra) {
        // Add payment annotations to tools that have prices configured
        if (result.tools) {
            result.tools = result.tools.map((tool) => {
                const price = this.cfg.prices[tool.name];
                if (!price) {
                    return tool;
                }

                // Build payment network information
                const recipientsByNetwork = this.normalizeRecipients(this.cfg.recipient);
                const paymentNetworks: unknown[] = [];

                const networks = Object.keys(recipientsByNetwork);
                for (const network of networks) {
                    const payTo = recipientsByNetwork[network];
                    if (!network || !payTo) continue;

                    // Only process Cronos networks
                    if (!isCronosNetwork(network)) continue;

                    // Use Cronos-specific price conversion
                    let atomic;
                    try {
                        const cronosNet = network === 'cronos' ? 'cronos-mainnet' : network as CronosNetwork;
                        const priceValue = this.extractPriceValue(price);
                        atomic = cronosPriceToAtomicAmount(priceValue, cronosNet, "USDC.e");
                    } catch {
                        continue;
                    }

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
                        type: 'evm'
                    };

                    paymentNetworks.push(networkInfo);
                }

                return {
                    ...tool,
                    annotations: {
                        ...tool.annotations,
                        paymentHint: true,
                        paymentPriceUSD: price,
                        paymentNetworks,
                        paymentVersion: this.x402Version
                    }
                };
            });
        }

        return { resultType: "continue" as const, response: result };
    }
}
