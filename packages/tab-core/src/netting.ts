import { normalize, type Address } from "./expense";
import type { Amount } from "./money";

export interface Transfer {
  from: Address;
  to: Address;
  amount: Amount;
}

/**
 * Greedy min-cash-flow: repeatedly match the largest debtor with the largest creditor.
 * Produces at most N-1 transfers for N non-zero balances. Deterministic (ties break by address).
 */
export function netTransfers(balances: Map<Address, Amount>): Transfer[] {
  let total = 0n;
  const debtors: { a: Address; v: Amount }[] = [];
  const creditors: { a: Address; v: Amount }[] = [];
  for (const [raw, v] of balances) {
    const a = normalize(raw);
    total += v;
    if (v < 0n) debtors.push({ a, v: -v });
    else if (v > 0n) creditors.push({ a, v });
  }
  if (total !== 0n) throw new Error(`balances do not sum to zero (off by ${total})`);
  const byBig = (x: { a: string; v: bigint }, y: { a: string; v: bigint }) => (x.v === y.v ? (x.a < y.a ? -1 : 1) : x.v > y.v ? -1 : 1);
  const out: Transfer[] = [];
  while (debtors.length && creditors.length) {
    debtors.sort(byBig);
    creditors.sort(byBig);
    const d = debtors[0]!;
    const c = creditors[0]!;
    const amt = d.v < c.v ? d.v : c.v;
    out.push({ from: d.a, to: c.a, amount: amt });
    d.v -= amt;
    c.v -= amt;
    if (d.v === 0n) debtors.shift();
    if (c.v === 0n) creditors.shift();
  }
  return out;
}

/** Apply transfers to balances; a correct settlement leaves every balance at zero. */
export function applyTransfers(balances: Map<Address, Amount>, transfers: Transfer[]): Map<Address, Amount> {
  const out = new Map(balances);
  for (const t of transfers) {
    out.set(t.from, (out.get(t.from) ?? 0n) + t.amount);
    out.set(t.to, (out.get(t.to) ?? 0n) - t.amount);
  }
  return out;
}
