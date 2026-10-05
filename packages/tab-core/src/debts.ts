import { normalize, splitOf, type Address, type Expense } from "./expense";
import type { SettledLeg } from "./ledger";
import type { Amount } from "./money";
import type { Transfer } from "./netting";

/**
 * Open pairwise debts, the way a spreadsheet or a group chat counts them: every participant of every expense owes the payer their share,
 * and each pair's debts net against each other. Settled legs pay the debt they name down (and flip it if overpaid).
 * Sorted by (from, to). This is the "before" side of "N debts became M transfers"; netTransfers over the balances is the "after".
 */
export function pairwiseDebts(expenses: Expense[], settled: Pick<SettledLeg, "from" | "to" | "amount">[]): Transfer[] {
  // net[a][b] > 0 means a owes b, with a < b so each pair has one key.
  const net = new Map<string, Amount>();
  const owe = (from: Address, to: Address, v: Amount) => {
    if (from === to || v === 0n) return;
    const flip = from > to;
    const key = flip ? `${to}|${from}` : `${from}|${to}`;
    net.set(key, (net.get(key) ?? 0n) + (flip ? -v : v));
  };
  for (const e of expenses) {
    const payer = normalize(e.payer);
    for (const [p, share] of splitOf(e)) owe(p, payer, share);
  }
  for (const s of settled) owe(normalize(s.to), normalize(s.from), s.amount);
  const out: Transfer[] = [];
  for (const [key, v] of net) {
    if (v === 0n) continue;
    const [lo, hi] = key.split("|") as [Address, Address];
    out.push(v > 0n ? { from: lo, to: hi, amount: v } : { from: hi, to: lo, amount: -v });
  }
  return out.sort((x, y) => (x.from === y.from ? (x.to < y.to ? -1 : 1) : x.from < y.from ? -1 : 1));
}
