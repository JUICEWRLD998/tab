import { normalize, USDC_ADDRESS, type Address } from "@tab/core";
import { parseAbi, type PublicClient } from "viem";
import { withRetry } from "./retry";

const blocklistAbi = parseAbi(["function isBlacklisted(address) view returns (bool)"]);

/** True if USDC would refuse this address. A blocklisted send burns gas without a receipt, so check before signing. */
export async function isBlocklisted(client: PublicClient, a: Address): Promise<boolean> {
  return withRetry(() => client.readContract({ address: USDC_ADDRESS, abi: blocklistAbi, functionName: "isBlacklisted", args: [normalize(a)] }));
}

export class WalletTypeError extends Error {
  constructor(address: string) {
    super(`this wallet type cannot call Memo: ${address} has contract code. Memo and Multicall3From accept EOA callers only.`);
  }
}

/** Memo and Multicall3From reject smart-contract callers (documented). Fail early with a plain message. */
export async function assertEoa(client: PublicClient, a: Address): Promise<void> {
  const code = await withRetry(() => client.getCode({ address: a }));
  // EIP-7702 delegated EOAs carry 0xef0100… code; treat only real contract code as a block.
  if (code && code !== "0x" && !code.toLowerCase().startsWith("0xef0100")) throw new WalletTypeError(a);
}
