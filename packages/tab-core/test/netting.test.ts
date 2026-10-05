import { describe, expect, it } from "vitest";
import { foldBalances } from "../src/balances";
import { applyTransfers, netTransfers } from "../src/netting";
import { addr, randomExpenses } from "./helpers";

describe("planted positive control", () => {
  // Fixture: A paid 100, B 80, C 40, split four ways (55 each). Net: A +45, B +25, C -15, D -55.
  // A known non-empty result, so an empty scan cannot pass as correct.
  it("4 people, 3 payers, collapses to exactly 3 transfers", () => {
    const [A, B, C, D] = [addr(1), addr(2), addr(3), addr(4)];
    const all = [A, B, C, D];
    const bal = foldBalances([
      { groupId: "g", payer: A, amount: 100n, participants: all, label: "a" },
      { groupId: "g", payer: B, amount: 80n, participants: all, label: "b" },
      { groupId: "g", payer: C, amount: 40n, participants: all, label: "c" },
    ]);
    expect(bal.get(A)).toBe(100n - 55n);
    const t = netTransfers(bal);
    expect(t.length).toBeGreaterThan(0);
    expect(t.length).toBeLessThanOrEqual(3);
    expect([...applyTransfers(bal, t).values()].every((v) => v === 0n)).toBe(true);
  });
});

describe("netTransfers properties (seeded)", () => {
  it("balances sum to 0, transfers zero every balance, legs <= N-1, no zero legs, no self legs", () => {
    let checked = 0;
    for (let seed = 1; seed <= 300; seed++) {
      const people = 2 + (seed % 19);
      const bal = foldBalances(randomExpenses(seed, people, 1 + (seed % 25)));
      expect([...bal.values()].reduce((a, b) => a + b, 0n)).toBe(0n);
      const t = netTransfers(bal);
      expect(t.length).toBeLessThanOrEqual(Math.max(0, bal.size - 1));
      for (const x of t) {
        expect(x.amount).toBeGreaterThan(0n);
        expect(x.from).not.toBe(x.to);
        expect(x.to).not.toBe("0x0000000000000000000000000000000000000000");
      }
      for (const v of applyTransfers(bal, t).values()) expect(v).toBe(0n);
      checked++;
    }
    expect(checked).toBe(300);
  });
  it("is deterministic", () => {
    const bal = foldBalances(randomExpenses(7, 10, 20));
    expect(netTransfers(bal)).toEqual(netTransfers(new Map(bal)));
  });
  it("rejects balances that do not sum to zero", () => {
    expect(() => netTransfers(new Map([[addr(1), 5n]]))).toThrow();
  });
  it("empty and settled groups need no transfers", () => {
    expect(netTransfers(new Map())).toEqual([]);
  });
});
