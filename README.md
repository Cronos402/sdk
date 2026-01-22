![Cronos402 Logo](https://raw.githubusercontent.com/Cronos402/assets/main/Cronos402-logo-light.svg)

# Cronos402 SDK & CLI

**The first MCP payment gateway built exclusively for Cronos blockchain.**

[![npm version](https://img.shields.io/npm/v/cronos402.svg)](https://www.npmjs.com/package/cronos402)
[![npm downloads](https://img.shields.io/npm/dm/cronos402.svg)](https://www.npmjs.com/package/cronos402)

A TypeScript SDK and CLI for connecting to MCP (Model Context Protocol) servers with payment capabilities via the x402 protocol on Cronos. Build AI agents and MCP servers that accept payments in USDC.e and CRO.

**Package**: [npmjs.com/package/cronos402](https://www.npmjs.com/package/cronos402)

## Features

- **Cronos-native**: Built exclusively for Cronos Mainnet and Testnet
- **Multi-server Proxy**: Connect to multiple MCP servers at once
- **USDC.e Support**: Gasless payments via Cronos facilitator (EIP-3009)
- **Native CRO**: Direct CRO payments with user-controlled gas
- **402 Payment Required**: Automatic payment handling via x402 protocol
- **MCP Integration**: Full Model Context Protocol server and client support
- **Programmatic APIs**: For both clients and servers
- **Easy SDK**: Simple `paidTool` API for building paid tools
- **Type-safe**: Full TypeScript support with viem

## Quick Start

Install the CLI globally or use `npx`:

```bash
npm i -g cronos402
# or
npx cronos402 connect -u "https://api.example.com/mcp" -a "<YOUR_API_KEY>"
```

Start a payment-aware stdio proxy to one or more MCP servers:

```bash
# Using a Cronos private key (Payment transport)
cronos402 connect -u "https://api.example.com/mcp" -k 0x1234... -n cronos-testnet

# Using an API key only (HTTP transport)
cronos402 connect -u "https://api.example.com/mcp" -a "$API_KEY"
```

Tip: You can pass multiple URLs: `-u "https://api1/mcp,https://api2/mcp"`.

## Installation

### SDK (project dependency)

```bash
npm i cronos402
# or
pnpm i cronos402
# or
yarn add cronos402
```

### CLI (global tool)

```bash
npm i -g cronos402
# or use npx
npx cronos402 connect --help
```

## CLI Usage

### Commands

- `cronos402 connect` – start an MCP stdio proxy to remote servers with payment capabilities
- `cronos402 version` – show version information

### Examples

```bash
# Basic (env vars)
export SERVER_URLS="https://api.example.com/mcp"
export CRONOS_PRIVATE_KEY="0x1234..."
cronos402 connect -u "$SERVER_URLS"

# Multiple servers + API key header forwarded to remotes
cronos402 connect -u "https://api1/mcp,https://api2/mcp" -a "$API_KEY"

# Using Cronos wallet with specific network
cronos402 connect -u "https://api.example.com/mcp" -k 0x1234... -n cronos-mainnet

# Set maximum payment amount
cronos402 connect -u "https://api.example.com/mcp" -k 0x1234... --max-atomic 1000000
```

### Options

| Option | Description | Default |
|--------|-------------|---------|
| `-u, --urls <urls>` | Comma-separated list of MCP server URLs | Required |
| `-a, --api-key <key>` | API key for authentication | `API_KEY` env |
| `-k, --private-key <key>` | Cronos private key (0x...) | `CRONOS_PRIVATE_KEY` env |
| `-n, --network <network>` | Cronos network (cronos-testnet, cronos-mainnet) | `cronos-testnet` |
| `--max-atomic <value>` | Max payment in atomic units | `X402_MAX_ATOMIC` env |

Behavior:
- If `-k` or `--private-key` is provided, the proxy uses Payment transport (x402) and can settle 402 challenges automatically.
- If only `-a` or `--api-key` is provided, the proxy uses standard HTTP transport and forwards the bearer token.
- API keys work with any proxy endpoint, not just specific domains.

## MCP Client Integration

Connect to AI assistants like Claude Desktop, Cursor, and Windsurf.

### Configuration for Claude Desktop

#### Using API Key (Recommended)

Add this to your `claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "Cronos Weather API": {
      "command": "npx",
      "args": [
        "cronos402",
        "connect",
        "--urls",
        "https://your-server.com/mcp",
        "--api-key",
        "your_api_key_here"
      ]
    }
  }
}
```

#### Using Cronos Private Key (Alternative)

Use a wallet private key for direct on-chain payments:

```json
{
  "mcpServers": {
    "Cronos Weather API": {
      "command": "npx",
      "args": [
        "cronos402",
        "connect",
        "--urls",
        "https://your-server.com/mcp",
        "--private-key",
        "0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef",
        "--network",
        "cronos-testnet"
      ]
    }
  }
}
```

### Configuration for Cursor

Same configuration format as Claude Desktop. Add to your Cursor MCP settings:

```json
{
  "mcpServers": {
    "Cronos AI Service": {
      "command": "npx",
      "args": [
        "cronos402",
        "connect",
        "--urls",
        "https://your-server.com/mcp",
        "--private-key",
        "0xYOUR_PRIVATE_KEY",
        "--network",
        "cronos-testnet"
      ]
    }
  }
}
```

### Direct CLI Connection

```bash
# Using API Key
npx cronos402 connect --urls https://your-server.com/mcp --api-key your_api_key_here

# Using Cronos Private Key
npx cronos402 connect --urls https://your-server.com/mcp --private-key 0xYOUR_PRIVATE_KEY --network cronos-testnet
```

## SDK Usage - Building Paid MCP Servers

### Protecting Your MCP Server with Payments

Use `createMcpHandler` to require valid payment before your tools run. Works in serverless/edge-compatible runtimes.

```typescript
import { createMcpHandler } from 'cronos402';
import { z } from 'zod';

const handler = createMcpHandler(
  async (server) => {
    server.paidTool(
      'get_weather',
      'Get current weather for any city',
      '0.01', // Price in USD (1 cent per call)
      {
        city: z.string().describe('City name'),
      },
      {},
      async ({ city }) => {
        const weather = await fetchWeather(city);
        return {
          content: [{ type: 'text', text: `Weather in ${city}: ${weather}` }],
        };
      }
    );
  },
  {
    recipient: {
      'cronos-testnet': '0x1234567890abcdef1234567890abcdef12345678',
      'cronos-mainnet': '0x1234567890abcdef1234567890abcdef12345678'
    },
    facilitator: {
      url: "https://facilitator.cronoslabs.org/v2/x402"
    }
  }
);

// Use with Node.js server
import { serve } from '@hono/node-server';
serve({ fetch: handler, port: 3000 });

// Or with Next.js (route handlers)
export { handler as GET, handler as POST };
```

Notes:
- `server.paidTool` accepts a price in USD and recipient addresses for different Cronos networks.
- When no valid payment is provided, the handler returns structured payment requirements that clients (like `withX402Client`) can satisfy automatically.
- The facilitator configuration connects to Cronos facilitator services for payment verification and settlement.

### Programmatic Stdio Proxy

```typescript
import { startStdioServer, ServerType } from 'cronos402';
import { createSigner } from 'x402/types';

// Create signer for Cronos network
const cronosSigner = await createSigner('cronos-testnet', '0x123...');

const serverConnections = [{
  url: 'https://api.example.com/mcp',
  serverType: ServerType.HTTPStream
}];

const x402Config = {
  wallet: { evm: cronosSigner },
  maxPaymentValue: BigInt(1000000) // 1 USDC max payment (6 decimals)
};

await startStdioServer({
  serverConnections,
  x402ClientConfig: x402Config
});
```

### Client: X402 Payment Wrapper

Wrap any MCP client with automatic 402 payment handling:

```typescript
import { withX402Client } from 'cronos402/client';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import { createSigner } from 'x402/types';

// Create Cronos signer
const cronosSigner = await createSigner('cronos-testnet', '0x123...');

// Initialize MCP client
const client = new Client(
  { name: 'my-app', version: '1.0.0' },
  { capabilities: {} }
);

const transport = new StreamableHTTPClientTransport(
  new URL('https://api.example.com/mcp')
);
await client.connect(transport);

// Wrap with payment capabilities
const paymentClient = withX402Client(client, {
  wallet: { evm: cronosSigner },
  maxPaymentValue: BigInt(1000000) // 1 USDC max (6 decimals)
});

// Use tools with automatic payment handling
const tools = await paymentClient.listTools();
const result = await paymentClient.callTool({
  name: 'get_weather',
  arguments: { city: 'Tokyo' }
});
// Payment is handled automatically on 402 response
```

### Direct API Integration (JavaScript/TypeScript SDK)

```typescript
import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js'
import { withX402Client } from 'cronos402/client'
import { createSigner } from 'x402/types'

// Initialize signer from private key (Cronos testnet)
const cronosSigner = await createSigner('cronos-testnet', '0x1234567890abcdef...')
const url = new URL('https://your-server.com/mcp')

// Create transport
const transport = new StreamableHTTPClientTransport(url)

// Initialize MCP client
const client = new Client(
  { name: 'my-mcp-client', version: '1.0.0' },
  { capabilities: {} }
)

await client.connect(transport)

// Wrap client with X402 payment capabilities
const paymentClient = withX402Client(client, {
  wallet: { evm: cronosSigner },
  maxPaymentValue: BigInt(1000000), // 1 USDC max payment (6 decimals)
})

// Use tools with automatic payment handling
const tools = await paymentClient.listTools()
console.log('Available tools:', tools)
```

## Payment Flow

### USDC.e (Gasless via Facilitator)

1. **Client**: User signs EIP-3009 `transferWithAuthorization` permit
2. **Client**: Submits payment proof in `X-PAYMENT` header
3. **Server**: Verifies payment via Cronos facilitator
4. **Facilitator**: Executes transfer on-chain (pays gas)
5. **Server**: Executes tool and returns result

### Native CRO (Direct Transaction)

1. **Client**: User sends CRO transaction to server address
2. **Client**: Waits for 2 block confirmations
3. **Client**: Submits transaction hash as payment proof
4. **Server**: Verifies transaction on-chain
5. **Server**: Executes tool after verification

## Token Support

### USDC.e (Bridged USDC Stargate)

- **Mainnet**: `0xf951eC28187D9E5Ca673Da8FE6757E6f0Be5F77C`
- **Testnet**: `0xc01efAaF7C5C61bEbFAeb358E1161b537b8bC0e0`
- **Decimals**: 6
- **Payment Method**: Gasless (EIP-3009 via facilitator)

### CRO (Native Token)

- **Address**: `0x0000000000000000000000000000000000000000` (zero address)
- **Decimals**: 18
- **Payment Method**: Direct transaction (user pays gas)

## Network Details

### Cronos Testnet

- **Chain ID**: 338
- **RPC**: `https://evm-t3.cronos.org`
- **Explorer**: `https://testnet.cronoscan.com`
- **Faucet**: `https://cronos.org/faucet` (TCRO)
- **Faucet**: `https://faucet.cronos.org` (devUSDC.e)

### Cronos Mainnet

- **Chain ID**: 25
- **RPC**: `https://evm.cronos.org`
- **Explorer**: `https://cronoscan.com`

## API Reference

### Server: `createMcpHandler(initialize, x402Config, serverOptions?)`

Creates an MCP server handler with payment support.

**Parameters:**
- `initialize`: Function to register tools and resources
- `x402Config`: Payment configuration
  - `recipient`: Payment recipient addresses per network
  - `facilitator`: Cronos facilitator configuration
- `serverOptions`: Optional MCP server options

**Returns:** `(request: Request) => Promise<Response>`

### Server: `server.paidTool(name, description, price, schema, annotations, handler)`

Register a tool that requires payment.

**Parameters:**
- `name`: Tool name
- `description`: Tool description
- `price`: Price in USD (e.g., "0.01")
- `schema`: Zod schema for tool parameters
- `annotations`: Tool annotations
- `handler`: Tool execution function

### Client: `withX402Client(client, config)`

Wrap an MCP client with automatic payment handling.

**Parameters:**
- `client`: MCP Client instance
- `config`: X402 client configuration
  - `wallet`: Wallet configuration with EVM signer
  - `maxPaymentValue`: Maximum payment amount in atomic units
  - `confirmationCallback`: Optional payment confirmation callback

**Returns:** Wrapped client with payment capabilities

## Environment Variables

CLI:
- `CRONOS_PRIVATE_KEY`: Hex private key for Cronos x402 signing
- `SERVER_URLS`: Comma-separated MCP endpoints
- `API_KEY`: Optional, forwarded as authentication to remotes
- `X402_MAX_ATOMIC`: Maximum payment amount in atomic units
- `CRONOS_NETWORK`: Cronos network (cronos-testnet, cronos-mainnet)

## Utilities

### Price Conversion

```typescript
import { priceToAtomicAmount } from 'cronos402';

// Convert USD price to atomic units
const { maxAmountRequired, asset } = priceToAtomicAmount(
  '0.01', // $0.01
  'cronos-testnet',
  'USDC.e' // or 'CRO'
);

console.log(maxAmountRequired); // 10000n (6 decimals)
console.log(asset.symbol); // 'devUSDC.e'
```

### Network Detection

```typescript
import { isCronosNetwork, getCronosNetworkFromChainId } from 'cronos402';

if (isCronosNetwork('cronos-testnet')) {
  console.log('Valid Cronos network');
}

const network = getCronosNetworkFromChainId(338);
console.log(network); // 'cronos-testnet'
```

### Facilitator Client

```typescript
import { createCronosFacilitator } from 'cronos402';

const facilitator = createCronosFacilitator();

// Verify payment
const verification = await facilitator.verify(paymentPayload, requirements);

// Settle payment
const settlement = await facilitator.settle(paymentPayload, requirements);

// Get supported networks
const supported = await facilitator.supported();
```

## Payment Protocol (x402)

On a `402 Payment Required` response, Cronos402 will:
1. Parse the server-provided payment requirements
2. Create and sign an authorization with your Cronos wallet
3. Retry the original request with `X-PAYMENT` header

Supported networks:
- **Cronos Testnet** (Chain ID: 338)
- **Cronos Mainnet** (Chain ID: 25)

USDC.e addresses are built-in per network for gasless payments via the Cronos facilitator.

## Troubleshooting

### "Payment amount exceeds maximum allowed"

Increase `maxPaymentValue` in your `x402ClientConfig`.

### Wrong chain/network

Ensure your wallet/client network matches the server requirement (cronos-testnet or cronos-mainnet).

### Invalid private key

Ensure Cronos keys are 0x-prefixed 64-character hex strings.

### API key errors

API keys work with any proxy endpoint. For direct on-chain payments, use `--private-key` instead.

### "PAYMENT_REQUIRED" Error

The tool requires payment. Ensure you're passing a payment token in `_meta['x402/payment']` or using the CLI/client wrapper that handles this automatically.

### "UNSUPPORTED_NETWORK" Error

Only Cronos Mainnet and Testnet are supported. Check your network configuration.

### "INVALID_PAYMENT" Error

Payment verification failed. Common causes:
- Expired authorization (check `validBefore`)
- Invalid signature
- Incorrect recipient address
- Wrong token amount

### "SETTLEMENT_FAILED" Error

Payment settlement on-chain failed. Common causes:
- Insufficient USDC.e balance
- Invalid EIP-3009 authorization
- Network congestion

## Development

```bash
pnpm i
pnpm run build
# Dev watch
pnpm run dev
```

## Dependencies

- `@modelcontextprotocol/sdk` - MCP protocol implementation
- `x402` - Payment protocol implementation
- `x402-fetch` - Fetch integration for x402
- `viem` - EVM blockchain interactions (Cronos)
- `commander` - CLI framework
- `zod` - Schema validation

## Security

- Never commit private keys. Prefer environment variables and scoped, low-value keys for development.
- Use the `maxPaymentValue` guard in clients and per-tool pricing in servers.
- Store private keys securely using environment variables or secure key management systems.

## Resources

- **npm Package**: [npmjs.com/package/cronos402](https://www.npmjs.com/package/cronos402)
- **Documentation**: [docs.cronos402.dev](https://docs.cronos402.dev)
- **GitHub**: [github.com/Cronos402/sdk](https://github.com/Cronos402/sdk)
- [Cronos x402 Facilitator Docs](https://docs.cronos.org/cronos-x402-facilitator)
- [Model Context Protocol](https://modelcontextprotocol.io)
- [EIP-3009: Transfer With Authorization](https://eips.ethereum.org/EIPS/eip-3009)
- [Cronos Documentation](https://docs.cronos.org)

## License

MIT

## Contributing

Issues and PRs are welcome.

## Support

Please open an issue in the repository.
