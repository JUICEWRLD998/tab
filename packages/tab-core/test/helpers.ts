import type { Address, Expense } from "../src/expense";

export const addr = (n: number): Address => `0x${n.toString(16).padStart(40, "0")}` as Address;

/** mulberry32: small seeded PRNG so property tests are reproducible. */
export function rng(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function randomExpenses(seed: number, people: number, count: number): Expense[] {
  const r = rng(seed);
  const out: Expense[] = [];
  for (let i = 0; i < count; i++) {
    const payer = addr(1 + Math.floor(r() * people));
    const k = 1 + Math.floor(r() * people);
    const participants = Array.from({ length: k }, () => addr(1 + Math.floor(r() * people)));
    out.push({ groupId: "g", payer, amount: BigInt(1 + Math.floor(r() * 500_000_000)), participants, label: `e${i}` });
  }
  return out;
}
