import type { Amount } from "./money";

export type Address = `0x${string}`;

export interface Expense {
  groupId: string;
  payer: Address;
  amount: Amount;
  /** Everyone who shares the cost, payer included if they share it. */
  participants: Address[];
  label: string;
  /** Custom split in base units per participant. Must sum to amount. Omit for an equal split. */
  shares?: Map<Address, Amount>;
}

const ZERO = "0x0000000000000000000000000000000000000000";

export function normalize(a: string): Address {
  if (!/^0x[0-9a-fA-F]{40}$/.test(a)) throw new Error(`invalid address: ${a}`);
  const lower = a.toLowerCase() as Address;
  if (lower === ZERO) throw new Error("address(0) is not allowed");
  return lower;
}

/** Equal split. The remainder (amount mod n) goes one base unit at a time to the first participants, in sorted order, so the result is deterministic and sums exactly. */
export function equalSplit(amount: Amount, participants: Address[]): Map<Address, Amount> {
  if (amount <= 0n) throw new Error("amount must be positive");
  const unique = [...new Set(participants.map(normalize))].sort();
  if (unique.length === 0) throw new Error("no participants");
  const n = BigInt(unique.length);
  const base = amount / n;
  let rem = amount % n;
  const out = new Map<Address, Amount>();
  for (const p of unique) {
    out.set(p, base + (rem > 0n ? 1n : 0n));
    if (rem > 0n) rem -= 1n;
  }
  return out;
}

export function customSplit(amount: Amount, shares: Map<Address, Amount>): Map<Address, Amount> {
  if (amount <= 0n) throw new Error("amount must be positive");
  const out = new Map<Address, Amount>();
  let sum = 0n;
  for (const [addr, v] of shares) {
    if (v < 0n) throw new Error("negative share");
    out.set(normalize(addr), (out.get(normalize(addr)) ?? 0n) + v);
    sum += v;
  }
  if (sum !== amount) throw new Error(`shares sum ${sum} != amount ${amount}`);
  return out;
}

export function splitOf(e: Expense): Map<Address, Amount> {
  return e.shares ? customSplit(e.amount, e.shares) : equalSplit(e.amount, e.participants);
}
