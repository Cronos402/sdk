// Server and stdio exports
export {
    startStdioServer,
    createServerConnections,
    ServerType,
    type ServerConnection
} from './server/stdio/start-stdio-server.js';

export { proxyServer } from './server/stdio/proxy-server.js';

// MCP Handler exports - For building paid MCP servers
export {
  createMcpHandler,
  createBaseMcpHandler,
  type PaidServerOptions,
  type PaidServerInitialize,
  type X402Config,
  type X402AugmentedServer,
  type RecipientWithTestnet,
} from './handler.js';

// Proxy and hooks exports
export {
  withProxy,
  LoggingHook,
  AnalyticsHook,
  AuthHeadersHook,
  X402MonetizationHook,
  type Hook,
  type RequestExtra,
  type CallToolResponseHookResult,
  type ToolCallResponseHookResult,
  type CallToolRequestWithContext,
} from './handler.js';

// Cronos network constants
export {
  CRONOS_NETWORK,
  SUPPORTED_CRONOS_NETWORKS,
  CRONOS_CHAIN_ID,
  CRONOS_RPC_URL,
  USDC_ADDRESS,
  USDC_METADATA,
  CRO_ADDRESS,
  CRO_METADATA,
  CRONOS_FACILITATOR,
  CRONOS_EXPLORER,
  CRONOS_FAUCET,
  getUsdcAddress,
  getChainId,
  getRpcUrl,
  getExplorerUrl,
  normalizeNetwork,
  getUsdcEip712Domain,
  DEFAULT_NETWORK,
  type CronosNetworkId,
} from './constants/cronos.js';

// Cronos-specific utilities
export {
  type CronosNetwork,
  type CronosAssetConfig,
  CronosChainIds,
  ChainIdToCronosNetwork,
  CronosUSDCeAddresses,
  CRO_NATIVE_ADDRESS,
  CronosAssets,
  CRONOS_FACILITATOR_URL,
  getCronosChain,
  isCronosNetwork,
  getCronosAsset,
  priceToAtomicAmount,
  isCronosChainId,
  getCronosNetworkFromChainId,
} from './utils/cronos-x402.js';

// Cronos facilitator client
export {
  CronosFacilitatorClient,
  createCronosFacilitator,
  useCronosFacilitator,
  type CronosFacilitatorVerifyRequest,
  type CronosFacilitatorVerifyResponse,
  type CronosFacilitatorSettleRequest,
  type CronosFacilitatorSettleResponse,
  type CronosFacilitatorSupportedResponse,
} from './utils/cronos-facilitator.js';

// Cronos payment decoding utilities
export {
  decodeCronosPayment,
  encodeCronosPayment,
  findMatchingCronosRequirements,
  toPaymentPayload,
} from './utils/cronos-decode.js';

// Cronos payment header creation
export {
  createCronosPaymentHeader,
  isNetworkSupportedForCronosPayment,
} from './utils/cronos-payment-header.js';

// Cronos-specific types (replaces x402 types)
export type {
  CronosPaymentRequirements,
  CronosEip3009Payload,
  CronosPaymentHeader,
  PaymentPayload,
  CronosSigner,
  MultiNetworkSigner,
  Price,
  PaymentScheme,
  FacilitatorConfig,
  FacilitatorVerifyResponse,
  FacilitatorSettleResponse,
  FacilitatorSupportedResponse,
} from './types/index.js';

// Signer utilities (replaces x402's createSigner)
export {
  createSigner,
  createSignerFromViemAccount,
  cronosTestnet,
  cronos,
  type SignerWallet,
} from './utils/signer.js';

// Re-export commonly used types from dependencies
export type { Account, WalletClient, Chain, Transport } from 'viem';
export type { Client } from '@modelcontextprotocol/sdk/client/index.js';
export type { Server } from '@modelcontextprotocol/sdk/server/index.js';

// Re-export zod for examples to use (ensures type compatibility)
export { z } from 'zod';
