import { describe, expect, it } from "vitest";
import { netTransfers } from "../src/netting";
import { buildLedger, type LedgerEntry } from "../src/ledger";
import { encodeExpenseMemo, encodeGroupMemo, encodeSettleMemo, settleCallDataHash, USDC_ADDRESS } from "../src/memo";
import { addr } from "./helpers";

const [A, B, C, EVIL] = [addr(1), addr(2), addr(3), addr(99)];
let n = 0;
const entry = (sender: string, memoData: `0x${string}`, over: Partial<LedgerEntry> = {}): LedgerEntry => ({
  sender: sender as LedgerEntry["sender"],
  target: USDC_ADDRESS.toLowerCase() as LedgerEntry["target"],
  callDataHash: ("0x" + "00".repeat(32)) as `0x${string}`,
  memoData,
  blockNumber: BigInt(100 + n),
  logIndex: 0,
  txHash: `0x${(++n).toString(16).padStart(64, "0")}` as `0x${string}`,
  ...over,
});
/** Stamp block numbers by array position so test order is chain order regardless of construction order. */
const chain = (...es: LedgerEntry[]): LedgerEntry[] => es.map((e, i) => ({ ...e, blockNumber: BigInt(1000 + i) }));
const create = () => entry(A, encodeGroupMemo({ name: "Trip", members: [A, B, C] }));
const spend = (payer: string, amt: bigint, who = [A, B, C]) => entry(payer, encodeExpenseMemo({ payer: payer as never, amount: amt, participants: who, label: "x" }));

describe("buildLedger", () => {
  it("planted control: a valid group yields exact balances and a known transfer count", () => {
    const l = buildLedger("g", chain(create(), spend(A, 300n), spend(B, 90n)))!;
    expect(l.expenses).toHaveLength(2);
    expect(l.balances.get(A)).toBe(300n - 130n);
    expect(l.balances.get(C)).toBe(-130n);
    expect(netTransfers(l.balances).length).toBe(2);
    expect(l.rejected).toHaveLength(0);
  });
  it("returns null when the group was never created", () => {
    expect(buildLedger("g", chain(spend(A, 5n)))).toBeNull();
  });
  it("ignores expenses posted before the group exists", () => {
    const early = spend(A, 5n);
    const l = buildLedger("g", chain(early, create()))!;
    expect(l.expenses).toHaveLength(0);
    expect(l.rejected[0]!.reason).toBe("group not created yet");
  });
  it("rejects an outsider posting an expense that makes members owe them", () => {
    const l = buildLedger("g", chain(create(), spend(EVIL, 1_000_000n, [A, B, C])))!;
    expect(l.expenses).toHaveLength(0);
    expect(l.rejected[0]!.reason).toBe("sender is not a member");
  });
  it("rejects a member claiming someone else paid", () => {
    const forged = entry(B, encodeExpenseMemo({ payer: A, amount: 50n, participants: [A, B, C], label: "x" }));
    const l = buildLedger("g", chain(create(), forged))!;
    expect(l.expenses).toHaveLength(0);
    expect(l.rejected[0]!.reason).toBe("payer must be the sender");
  });
  it("rejects participants outside the member list", () => {
    const l = buildLedger("g", chain(create(), spend(A, 50n, [A, EVIL])))!;
    expect(l.expenses).toHaveLength(0);
  });
  it("a second group memo cannot hijack the member list", () => {
    const hijack = entry(EVIL, encodeGroupMemo({ name: "Mine", members: [EVIL, A] }));
    const l = buildLedger("g", chain(create(), hijack))!;
    expect(l.creator).toBe(A);
    expect(l.members).toEqual([A, B, C]);
  });
  it("a group memo whose sender is not a member is not a creator", () => {
    const l = buildLedger("g", [entry(EVIL, encodeGroupMemo({ name: "x", members: [A, B] }))]);
    expect(l).toBeNull();
  });
  it("counts a settle leg only when callDataHash proves the USDC transfer", () => {
    const good = entry(C, encodeSettleMemo({ from: C, to: A, amount: 100n }), { callDataHash: settleCallDataHash(A, 100n) });
    const lie = entry(C, encodeSettleMemo({ from: C, to: A, amount: 30n }), { callDataHash: settleCallDataHash(A, 1n) });
    const l = buildLedger("g", chain(create(), spend(A, 300n), good, lie))!;
    expect(l.settled).toHaveLength(1);
    expect(l.balances.has(C)).toBe(false); // C owed 100 and paid 100, so C is square and dropped from the map
    expect(l.rejected.map((r) => r.reason)).toEqual(["callDataHash does not match a USDC transfer of this memo"]);
  });
  it("settling every leg squares the group", () => {
    const l0 = buildLedger("g", chain(create(), spend(A, 300n), spend(B, 90n)))!;
    const legs = netTransfers(l0.balances).map((t) => entry(t.from, encodeSettleMemo(t), { callDataHash: settleCallDataHash(t.to, t.amount) }));
    const l1 = buildLedger("g", chain(create(), spend(A, 300n), spend(B, 90n), ...legs))!;
    expect(l1.balances.size).toBe(0);
  });
  it("skips foreign memo data and duplicate logs", () => {
    const dup = create();
    const l = buildLedger("g", chain(dup, dup, entry(A, "0x1234")))!;
    expect(l.rejected).toHaveLength(1);
  });
});
