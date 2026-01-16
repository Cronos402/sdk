#!/usr/bin/env node

import { Command } from "commander";
import { config } from "dotenv";
import { createSigner } from "../utils/signer.js";
import packageJson from '../../package.json' with { type: 'json' };
import type { X402ClientConfig } from "../client/with-x402-client.js";
import { ServerType, startStdioServer } from '../server/stdio/start-stdio-server.js';

config();

// Cronos-only supported networks
const SupportedCronosNetworks = ['cronos-testnet', 'cronos-mainnet'] as const;
type CronosNetwork = typeof SupportedCronosNetworks[number];

interface ServerOptions {
  urls: string;
  apiKey?: string;
  x402MaxAtomic?: string;
  evm?: string;
  network?: string;
}

const program = new Command();

program
  .name('cronos402')
  .description('Cronos402 CLI - MCP payment gateway for Cronos blockchain')
  .version(packageJson.version);

program
  .command('connect')
  .description('Connect to paid MCP servers on Cronos')
  .requiredOption('-u, --urls <urls>', 'Comma-separated list of MCP server URLs')
  .option('-a, --api-key <key>', 'API key for authentication (env: API_KEY)')
  .option('--max-atomic <value>', 'Max payment in atomic units (e.g. 1000000 for 1 USDC). Env: X402_MAX_ATOMIC')
  .option('-e, --evm <key>', 'Cronos EVM wallet private key (0x...) (env: CRONOS_PRIVATE_KEY)')
  .option('-n, --network <network>', 'Cronos network: cronos-testnet or cronos-mainnet. Default: cronos-testnet (env: CRONOS_NETWORK)')
  .action(async (options: ServerOptions) => {
    try {
      const apiKey = options.apiKey || process.env.API_KEY;
      const maxAtomicArg = options.x402MaxAtomic || process.env.X402_MAX_ATOMIC;
      const privateKey = options.evm || process.env.CRONOS_PRIVATE_KEY;
      const network = (options.network || process.env.CRONOS_NETWORK || 'cronos-testnet') as CronosNetwork;

      if (!apiKey && !privateKey) {
        console.error('Error: Provide either --api-key or --evm (or env API_KEY/CRONOS_PRIVATE_KEY).');
        process.exit(1);
      }

      // Validate Cronos network
      if (privateKey && !SupportedCronosNetworks.includes(network)) {
        console.error(`Error: Invalid network '${network}'. Supported: ${SupportedCronosNetworks.join(', ')}`);
        process.exit(1);
      }

      const serverType = ServerType.HTTPStream;

      const serverUrls = options.urls.split(',').map((url: string) => url.trim());

      if (serverUrls.length === 0) {
        console.error('Error: At least one server URL is required.');
        process.exit(1);
      }

      // Determine if we're using proxy mode or direct mode
      // API keys can be used with any proxy endpoint
      const isProxyMode = apiKey && serverUrls.some(url =>
        url.includes('/v1/mcp') || url.includes('cronos402') || url.includes('proxy')
      );

      // API key can only be used with proxy mode
      if (apiKey && !isProxyMode) {
        console.error('Error: API key can only be used with proxy URLs (containing /v1/mcp, cronos402, or proxy). Use --evm for direct payments to other servers.');
        process.exit(1);
      }

      // Create individual server connections with appropriate transport options
      // Only apply API key authentication to proxy URLs
      const serverConnections = serverUrls.map(url => {
        const isProxyUrl = url.includes('/v1/mcp') || url.includes('cronos402') || url.includes('proxy');
        
        let transportOptions: any = undefined;
        if (apiKey && isProxyUrl) {
          // Only apply API key to proxy URLs
          transportOptions = {
            requestInit: {
              credentials: 'include',
              headers: new Headers({
                'x-api-key': apiKey
              })
            }
          };
        }
        
        return {
          url,
          serverType,
          transportOptions
        };
      });

      // Optional X402 client configuration (only when not using API key)
      let x402ClientConfig: X402ClientConfig | undefined = undefined;
      if (!apiKey && privateKey) {
        const pk = privateKey.trim();
        if (!pk.startsWith('0x') || pk.length !== 66) {
          console.error('Error: Invalid private key. Must be 0x-prefixed 64-character hex string.');
          process.exit(1);
        }

        let cronosSigner;
        try {
          cronosSigner = await createSigner(network, pk);
        } catch (error) {
          console.error(`Error: Failed to create Cronos signer for ${network}:`, error instanceof Error ? error.message : String(error));
          process.exit(1);
        }

        const maybeMax = maxAtomicArg ? (() => { try { return BigInt(maxAtomicArg); } catch { return undefined; } })() : undefined;

        x402ClientConfig = {
          wallet: { evm: cronosSigner } as X402ClientConfig['wallet'],
          ...(maybeMax !== undefined ? { maxPaymentValue: maybeMax } : {}),
          confirmationCallback: async (payments) => {
            // Display first payment option (Cronos network)
            const payment = payments[0];
            if (payment) {
              console.log(`\n💰 Payment Required:`);
              console.log(`   Network: ${payment.network}`);
              console.log(`   Max Amount: ${payment.maxAmountRequired}`);
              if ('payTo' in payment) {
                console.log(`   Recipient: ${payment.payTo}`);
              }
              console.log();
            }
            return true; // Accept first payment option
          }
        };
      }

      await startStdioServer({
        serverConnections,
        x402ClientConfig,
      });

    } catch (error) {
      console.error('Failed to start server:', error);
      process.exit(1);
    }
  });

program
  .command('version')
  .description('Show version information')
  .action(() => {
    console.log('cronos402 version ' + packageJson.version);
  });

// Parse command line arguments
program.parse();

// If no command was provided, show help
if (!process.argv.slice(2).length) {
  program.outputHelp();
} 