import { formatUsdc } from "@tab/core";

export const shortAddr = (a: string) => `${a.slice(0, 6)}…${a.slice(-4)}`;
export const shortHash = (h: string) => `${h.slice(0, 8)}…${h.slice(-6)}`;

/** "0.075" -> "0.075"; "3.2" -> "3.20". Always the 6-decimal USDC view, never the 18-decimal native one. */
export const usdc = (amount: bigint) => formatUsdc(amount);

export const plural = (n: number, one: string, many = one + "s") => `${n} ${n === 1 ? one : many}`;

export const isHash = (s: string): s is `0x${string}` => /^0x[0-9a-fA-F]{64}$/.test(s);
export const isAddress = (s: string): s is `0x${string}` => /^0x[0-9a-fA-F]{40}$/.test(s);

/** A random, URL-safe group id. The id is only a label that hashes to the memoId; it is not a secret. */
export function newGroupId(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(5));
  return "tab-" + Array.from(bytes, (b) => b.toString(36).padStart(2, "0")).join("").slice(0, 8);
}

/** Pull every 0x address out of free text (paste a list, a chat export, one per line). Order kept, duplicates dropped, case folded. */
export function extractAddresses(text: string): `0x${string}`[] {
  const seen = new Set<string>();
  const out: `0x${string}`[] = [];
  for (const m of text.matchAll(/0x[0-9a-fA-F]{40}/g)) {
    const a = m[0].toLowerCase() as `0x${string}`;
    if (!seen.has(a)) {
      seen.add(a);
      out.push(a);
    }
  }
  return out;
}
