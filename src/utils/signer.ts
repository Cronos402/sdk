import { Account, Chain, Client, PublicActions, RpcSchema, Transport, WalletActions, Hex } from "viem";
import { createWalletClient, http } from "viem";
import { publicActions } from "viem";
import { privateKeyToAccount } from "viem/accounts";

export type SignerWallet<
  chain extends Chain = Chain,
  transport extends Transport = Transport,
  account extends Account = Account,
> = Client<
  transport,
  chain,
  account,
  RpcSchema,
  PublicActions<transport, chain, account> & WalletActions<chain, account>
>;

// Cronos Testnet (Chain ID 338)
export const cronosTestnet: Chain = {
  id: 338,
  name: 'Cronos Testnet',
  nativeCurrency: {
    decimals: 18,
    name: 'Cronos',
    symbol: 'TCRO',
  },
  rpcUrls: {
    default: {
      http: ['https://evm-t3.cronos.org'],
    },
    public: {
      http: ['https://evm-t3.cronos.org'],
    },
  },
  blockExplorers: {
    default: { name: 'Cronos Explorer', url: 'https://explorer.cronos.org/testnet' },
  },
  testnet: true,
};

// Cronos Mainnet (Chain ID 25)
export const cronos: Chain = {
  id: 25,
  name: 'Cronos',
  nativeCurrency: {
    decimals: 18,
    name: 'Cronos',
    symbol: 'CRO',
  },
  rpcUrls: {
    default: {
      http: ['https://evm.cronos.org'],
    },
    public: {
      http: ['https://evm.cronos.org'],
    },
  },
  blockExplorers: {
    default: { name: 'Cronos Explorer', url: 'https://explorer.cronos.org' },
  },
  testnet: false,
};

function getChainFromNetwork(network: string | undefined): Chain {
    if (!network) {
      throw new Error("NETWORK environment variable is not set");
    }

    switch (network) {
      case "cronos-testnet":
        return cronosTestnet;
      case "cronos-mainnet":
        return cronos;
      default:
        throw new Error(`Unsupported network: ${network}. Only cronos-testnet and cronos-mainnet are supported.`);
    }
  }

export function createSignerFromViemAccount(network: string, account: Account): SignerWallet<Chain> {
    const chain = getChainFromNetwork(network);
    return createWalletClient({
      chain,
      transport: http(),
      account: account,
    }).extend(publicActions);
  }

/**
 * Create a signer from a private key string
 * Replaces x402's createSigner function
 *
 * @param network - Cronos network ("cronos-testnet" or "cronos-mainnet")
 * @param privateKey - Private key as 0x-prefixed hex string
 * @returns Wallet client ready for signing
 */
export async function createSigner(network: string, privateKey: string): Promise<SignerWallet<Chain>> {
  const chain = getChainFromNetwork(network);
  const account = privateKeyToAccount(privateKey as Hex);

  return createWalletClient({
    chain,
    transport: http(),
    account,
  }).extend(publicActions);
}