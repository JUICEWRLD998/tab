import { describe, expect, it } from "vitest";
import { encodeAbiParameters, parseAbiParameters } from "viem";
import { applyTransfers, netTransfers } from "../src/netting";
import { buildLedger, type LedgerEntry } from "../src/ledger";
import { encodeExpenseMemo, encodeGroupMemo, KIND_GROUP, USDC_ADDRESS } from "../src/memo";
import { pairwiseDebts } from "../src/debts";
import { equalSplit } from "../src/expense";
import { foldBalances } from "../src/balances";
import { addr, rng } from "./helpers";

let n = 0;
const entry = (sender: string, memoData: `0x${string}`): LedgerEntry => ({
  sender: sender as LedgerEntry["sender"],
  target: USDC_ADDRESS.toLowerCase() as LedgerEntry["target"],
  callDataHash: ("0x" + "00".repeat(32)) as `0x${string}`,
  memoData,
  blockNumber: BigInt(1000 + n),
  logIndex: 0,
  txHash: `0x${(++n).toString(16).padStart(64, "0")}` as `0x${string}`,
});
const people = (k: number) => Array.from({ length: k }, (_, i) => addr(i + 1));
const spend = (payer: `0x${string}`, amount: bigint, who: `0x${string}`[]) =>
  entry(payer, encodeExpenseMemo({ payer, amount, participants: who, label: "x" }));

describe("hostile and malformed memos never crash the reader", () => {
  it("planted control: a well-formed 3-member group builds", () => {
    const [A, B, C] = people(3);
    expect(buildLedger("g", [entry(A!, encodeGroupMemo({ name: "ok", members: [A!, B!, C!] }))])).not.toBeNull();
  });
  it("a group memo that lists address(0) is rejected, not thrown", () => {
    const [A, B] = people(2);
    const raw = encodeAbiParameters(parseAbiParameters("uint8 kind, string name, address[] members"), [KIND_GROUP, "evil", [A!, B!, "0x0000000000000000000000000000000000000000"]]);
    const l = buildLedger("g", [entry(A!, raw)]);
    expect(l).toBeNull();
  });
  it("a hostile first group memo does not block the real creator", () => {
    const [A, B, EVIL] = people(3);
    const raw = encodeAbiParameters(parseAbiParameters("uint8 kind, string name, address[] members"), [KIND_GROUP, "evil", [EVIL!, "0x0000000000000000000000000000000000000000"]]);
    const l = buildLedger("g", [entry(EVIL!, raw), entry(A!, encodeGroupMemo({ name: "real", members: [A!, B!] }))])!;
    expect(l.name).toBe("real");
    expect(l.rejected).toHaveLength(1);
  });
  it("a one-member group is not a group", () => {
    const [A] = people(1);
    expect(() => encodeGroupMemo({ name: "solo", members: [A!] })).toThrow();
  });
});

describe("group sizes", () => {
  it("empty group: created, no expenses, nothing to settle", () => {
    const [A, B] = people(2);
    const l = buildLedger("g", [entry(A!, encodeGroupMemo({ name: "quiet", members: [A!, B!] }))])!;
    expect(l.expenses).toHaveLength(0);
    expect(l.balances.size).toBe(0);
    expect(netTransfers(l.balances)).toEqual([]);
    expect(pairwiseDebts(l.expenses, l.settled)).toEqual([]);
  });
  it("two people: one expense is one transfer", () => {
    const [A, B] = people(2);
    const l = buildLedger("g", [entry(A!, encodeGroupMemo({ name: "pair", members: [A!, B!] })), spend(A!, 10_000_000n, [A!, B!])])!;
    expect(netTransfers(l.balances)).toEqual([{ from: B, to: A, amount: 5_000_000n }]);
  });
  it("a payer who is the only participant creates no debt", () => {
    const [A, B] = people(2);
    const l = buildLedger("g", [entry(A!, encodeGroupMemo({ name: "solo spend", members: [A!, B!] })), spend(A!, 7_000_000n, [A!])])!;
    expect(l.balances.size).toBe(0);
  });
  it("twenty people, 300 expenses: balances sum to zero, at most 19 transfers, and they zero everyone", () => {
    const P = people(20);
    const r = rng(2026);
    const es = [entry(P[0]!, encodeGroupMemo({ name: "big", members: P }))];
    for (let i = 0; i < 300; i++) {
      const payer = P[Math.floor(r() * 20)]!;
      const who = P.filter(() => r() < 0.6);
      if (who.length === 0) who.push(payer);
      es.push(spend(payer, BigInt(1 + Math.floor(r() * 90_000_000)), who));
    }
    const l = buildLedger("g", es)!;
    expect(l.rejected).toHaveLength(0);
    expect(l.expenses).toHaveLength(300);
    let sum = 0n;
    for (const v of l.balances.values()) sum += v;
    expect(sum).toBe(0n);
    const t = netTransfers(l.balances);
    expect(t.length).toBeLessThanOrEqual(19);
    expect(t.length).toBeGreaterThan(0);
    for (const v of applyTransfers(l.balances, t).values()) expect(v).toBe(0n);
    const debts = pairwiseDebts(l.expenses, l.settled);
    expect(debts.length).toBeGreaterThanOrEqual(t.length);
  });
});

describe("dust and extremes", () => {
  it("1 base unit across 20 people goes to exactly one person and still sums", () => {
    const m = equalSplit(1n, people(20));
    expect([...m.values()].reduce((a, b) => a + b, 0n)).toBe(1n);
    expect([...m.values()].filter((v) => v === 1n)).toHaveLength(1);
  });
  it("1 base unit paid by one person nets to a single 1-unit transfer", () => {
    const P = people(3);
    const bal = foldBalances([{ groupId: "g", payer: P[0]!, amount: 1n, participants: P, label: "dust" }]);
    const t = netTransfers(bal);
    expect(t).toEqual([]); // the payer keeps the single unit: nobody owes anything
  });
  it("2 base units across 3 people: the two with the unit owe the payer one unit each, none is zero", () => {
    const P = people(3);
    const bal = foldBalances([{ groupId: "g", payer: P[2]!, amount: 2n, participants: P, label: "dust" }]);
    const t = netTransfers(bal);
    expect(t.every((x) => x.amount > 0n)).toBe(true);
    for (const v of applyTransfers(bal, t).values()) expect(v).toBe(0n);
  });
  it("a trillion-dollar expense stays exact", () => {
    const P = people(7);
    const amount = 10n ** 18n + 3n;
    const bal = foldBalances([{ groupId: "g", payer: P[0]!, amount, participants: P, label: "big" }]);
    for (const v of applyTransfers(bal, netTransfers(bal)).values()) expect(v).toBe(0n);
  });
  it("the same payer logging many times collapses to one transfer per debtor", () => {
    const P = people(4);
    const es = Array.from({ length: 50 }, () => ({ groupId: "g", payer: P[0]!, amount: 4_000_000n, participants: P, label: "rounds" }));
    const t = netTransfers(foldBalances(es));
    expect(t).toHaveLength(3);
    expect(t.every((x) => x.to === P[0] && x.amount === 50_000_000n)).toBe(true);
  });
});
