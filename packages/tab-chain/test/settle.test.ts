import { decodeTabMemo, groupMemoId, settleCallData, USDC_ADDRESS, MULTICALL3FROM_ADDRESS, type Transfer } from "@tab/core";
import { describe, expect, it } from "vitest";
import { buildSettleBatch, decodeSettleBatch, legsFor } from "../src/settle";

const a = (n: number) => `0x${n.toString(16).padStart(40, "0")}` as `0x${string}`;
const plan: Transfer[] = [
  { from: a(1), to: a(2), amount: 75_000n },
  { from: a(1), to: a(3), amount: 75_000n },
  { from: a(1), to: a(4), amount: 75_000n },
  { from: a(5), to: a(2), amount: 10n },
];

describe("settle batch", () => {
  it("legsFor returns only the debtor's legs", () => {
    expect(legsFor(plan, a(1))).toHaveLength(3);
    expect(legsFor(plan, a(5))).toHaveLength(1);
    expect(legsFor(plan, a(9))).toHaveLength(0);
  });
  it("planted control: a 3-leg batch decodes to 3 legs with the right target, memoId and memo per leg", () => {
    const legs = legsFor(plan, a(1));
    const tx = buildSettleBatch("trip", legs);
    expect(tx.to).toBe(MULTICALL3FROM_ADDRESS);
    const calls = decodeSettleBatch(tx.data);
    expect(calls).toHaveLength(3);
    calls.forEach((c, i) => {
      expect(c.memoId).toBe(groupMemoId("trip"));
      expect(c.callData).toBe(settleCallData(legs[i]!.to, legs[i]!.amount));
      expect(decodeTabMemo(c.memoData)).toEqual({ kind: "settle", from: legs[i]!.from, to: legs[i]!.to, amount: legs[i]!.amount });
    });
    expect(USDC_ADDRESS).toBeTruthy();
  });
  it("refuses an empty batch", () => {
    expect(() => buildSettleBatch("trip", [])).toThrow();
  });
});
