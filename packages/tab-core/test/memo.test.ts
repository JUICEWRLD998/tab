import { encodeFunctionData, keccak256, stringToBytes, toEventSelector } from "viem";
import { describe, expect, it } from "vitest";
import fixture from "./fixtures/memo-spike-log.json";
import { decodeMemoLog, decodeTabMemo, encodeExpenseMemo, encodeSettleMemo, groupMemoId, memoAbi, MEMO_TOPIC0 } from "../src/memo";
import { addr } from "./helpers";

describe("Memo event ABI vs the real mainnet log", () => {
  it("topic0 of our ABI equals the topic0 seen on-chain", () => {
    const sel = toEventSelector(memoAbi.find((x) => x.type === "event" && x.name === "Memo")!);
    expect(sel).toBe(MEMO_TOPIC0);
    expect(fixture.topics[0]).toBe(MEMO_TOPIC0);
  });
  it("decodes the recorded tx 0x696f1765… exactly", () => {
    const m = decodeMemoLog({ topics: fixture.topics as `0x${string}`[], data: fixture.data as `0x${string}` });
    expect(m.sender).toBe("0xe874c32569a28b2d0bca07ef25f0ec0b68beedd0");
    expect(m.target).toBe("0x3600000000000000000000000000000000000000");
    expect(m.memoId).toBe(keccak256(stringToBytes("tab:spike")));
    expect(m.memoData).toBe("0x1234");
    expect(m.index).toBe(0x318n);
  });
  it("rejects a log with a different topic0", () => {
    expect(() => decodeMemoLog({ topics: ["0x" + "11".repeat(32)] as `0x${string}`[], data: "0x" })).toThrow();
  });
});

describe("Tab memo payloads", () => {
  it("round-trips an expense", () => {
    const data = encodeExpenseMemo({ payer: addr(1), amount: 12_340_000n, participants: [addr(3), addr(2), addr(2)], label: "Dinner ☕" });
    expect(decodeTabMemo(data)).toEqual({ kind: "expense", payer: addr(1), amount: 12_340_000n, participants: [addr(2), addr(3)], label: "Dinner ☕" });
  });
  it("round-trips a settle leg", () => {
    const data = encodeSettleMemo({ from: addr(1), to: addr(2), amount: 5n });
    expect(decodeTabMemo(data)).toEqual({ kind: "settle", from: addr(1), to: addr(2), amount: 5n });
  });
  it("returns null for foreign memo data (the spike's 0x1234) and garbage", () => {
    expect(decodeTabMemo("0x1234")).toBeNull();
    expect(decodeTabMemo("0x")).toBeNull();
    expect(decodeTabMemo("0x" + "ff".repeat(70) as `0x${string}`)).toBeNull();
  });
  it("groupMemoId is stable and rejects empty ids", () => {
    expect(groupMemoId("trip")).toBe(groupMemoId("trip"));
    expect(groupMemoId("trip")).not.toBe(groupMemoId("trip2"));
    expect(() => groupMemoId("")).toThrow();
  });
  it("memo() calldata encodes with our ABI", () => {
    expect(encodeFunctionData({ abi: memoAbi, functionName: "memo", args: [addr(9), "0x", groupMemoId("g"), "0x"] }).startsWith("0x")).toBe(true);
  });
});
