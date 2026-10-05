import { createPublicClient, defineChain, fallback, http, type PublicClient } from "viem";

/** Arc mainnet. Native currency is USDC with 18 decimals; the ERC-20 view at 0x3600…0000 uses 6. Never mix them. */
export const arcMainnet = defineChain({
  id: 5042,
  name: "Arc",
  nativeCurrency: { name: "USDC", symbol: "USDC", decimals: 18 },
  rpcUrls: { default: { http: ["https://rpc.mainnet.arc.io"] } },
  blockExplorers: { default: { name: "Arc Explorer", url: "https://explorer.arc.io" } },
});

/** Documented floor: maxFeePerGas must be at least 20 gwei. */
export const MIN_FEE_PER_GAS = 20_000_000_000n;

export const txUrl = (hash: string) => `${arcMainnet.blockExplorers.default.url}/tx/${hash}`;
export const addressUrl = (a: string) => `${arcMainnet.blockExplorers.default.url}/address/${a}`;

export function makePublicClient(rpcUrls: string[] = arcMainnet.rpcUrls.default.http as unknown as string[]): PublicClient {
  const transports = rpcUrls.map((u) => http(u, { retryCount: 2, retryDelay: 400, timeout: 15_000 }));
  return createPublicClient({
    chain: arcMainnet,
    transport: transports.length > 1 ? fallback(transports) : transports[0]!,
  }) as PublicClient;
}
