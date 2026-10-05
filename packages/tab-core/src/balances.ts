import { normalize, splitOf, type Address, type Expense } from "./expense";
import type { Amount } from "./money";

/** Net balance per address: positive = is owed money, negative = owes money. Sums to zero. */
export function foldBalances(expenses: Expense[]): Map<Address, Amount> {
  const bal = new Map<Address, Amount>();
  const add = (a: Address, v: Amount) => bal.set(a, (bal.get(a) ?? 0n) + v);
  for (const e of expenses) {
    add(normalize(e.payer), e.amount);
    for (const [p, share] of splitOf(e)) add(p, -share);
  }
  for (const [k, v] of bal) if (v === 0n) bal.delete(k);
  return bal;
}
