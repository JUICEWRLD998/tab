import { describe, expect, it } from "vitest";
import { foldBalances } from "../src/balances";
import { pairwiseDebts } from "../src/debts";
import { netTransfers } from "../src/netting";
import type { Address } from "../src/expense";
import { addr, randomExpenses } from "./helpers";

const [A, B, C] = [addr(1), addr(2), addr(3), addr(4)];
const e = (payer: Address, amount: bigint, participants: Address[]) => ({ groupId: "g", payer, amount, participants, label: "x" });

describe("pairwiseDebts", () => {
  it("planted control: A pays 300 for A,B,C and B pays 90 for A,B,C gives two open debts to A", () => {
    const d = pairwiseDebts([e(A, 300n, [A, B, C]), e(B, 90n, [A, B, C])], []);
    // B owes A 100 and is owed 30 by A: net B->A 70. C owes A 100 and B 30.
    expect(d).toEqual([
      { from: B, to: A, amount: 70n },
      { from: C, to: A, amount: 100n },
      { from: C, to: B, amount: 30n },
    ]);
  });
  it("opposite debts between a pair cancel to nothing", () => {
    expect(pairwiseDebts([e(A, 100n, [A, B]), e(B, 100n, [A, B])], [])).toEqual([]);
  });
  it("a settled leg reduces the debt it paid", () => {
    const d = pairwiseDebts([e(A, 300n, [A, B, C])], [{ from: B, to: A, amount: 100n }]);
    expect(d).toEqual([{ from: C, to: A, amount: 100n }]);
  });
  it("an overpaid settle flips the direction instead of hiding", () => {
    const d = pairwiseDebts([e(A, 200n, [A, B])], [{ from: B, to: A, amount: 150n }]);
    expect(d).toEqual([{ from: A, to: B, amount: 50n }]);
  });
  it("property: debts reproduce the balances, and never need fewer transfers than netting", () => {
    for (let seed = 1; seed <= 200; seed++) {
      const ex = randomExpenses(seed, 2 + (seed % 7), 1 + (seed % 12));
      const debts = pairwiseDebts(ex, []);
      const fromDebts = new Map<Address, bigint>();
      for (const x of debts) {
        expect(x.amount > 0n).toBe(true);
        expect(x.from).not.toBe(x.to);
        fromDebts.set(x.from, (fromDebts.get(x.from) ?? 0n) - x.amount);
        fromDebts.set(x.to, (fromDebts.get(x.to) ?? 0n) + x.amount);
      }
      const bal = foldBalances(ex);
      for (const [k, v] of fromDebts) if (v === 0n) fromDebts.delete(k);
      expect(fromDebts).toEqual(bal);
      expect(netTransfers(bal).length).toBeLessThanOrEqual(debts.length);
    }
  });
  it("planted control: a circle of debts is 3 debts before netting and 0 transfers after", () => {
    // A circle of equal debts: 3 pairwise debts that net to zero transfers, so the "N debts became M" gap is real.
    const tri = [e(A, 30n, [A, B]), e(B, 30n, [B, C]), e(C, 30n, [C, A])];
    const d = pairwiseDebts(tri, []);
    expect(d).toHaveLength(3);
    expect(netTransfers(foldBalances(tri))).toHaveLength(0);
  });
});
