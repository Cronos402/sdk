/**
 * Cronos402 Handler Exports
 * Re-export handler utilities for building paid MCP servers
 */

// Server creation exports
export {
  createMcpPaidHandler as createMcpHandler,
  type PaidServerOptions,
  type PaidServerInitialize,
  type X402Config,
  type X402AugmentedServer,
  type RecipientWithTestnet,
} from "./handler/server/templates/x402-server.js";

// Base handler for non-paid MCP servers
export { default as createBaseMcpHandler } from "./handler/server/index.js";

// Proxy and hooks exports
export { withProxy } from "./handler/proxy/index.js";
export type {
  Hook,
  RequestExtra,
  CallToolResponseHookResult,
  ToolCallResponseHookResult, // Backwards compatibility alias
  CallToolRequestWithContext,
} from "./handler/proxy/hooks.js";
export { LoggingHook } from "./handler/proxy/hooks/logging-hook.js";
export { AnalyticsHook } from "./handler/proxy/hooks/analytics-hook.js";
export { AuthHeadersHook } from "./handler/proxy/hooks/auth-headers-hook.js";
export { X402MonetizationHook, type PaymentSettledEvent } from "./handler/proxy/hooks/x402-hook.js";
