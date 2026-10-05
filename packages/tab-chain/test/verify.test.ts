import { describe, expect, it } from "vitest";
import { encodeAbiParameters, encodeEventTopics, parseAbi, toHex, type Hex } from "viem";
import { encodeSettleMemo, groupMemoId, memoAbi, MEMO_ADDRESS, settleCallDataHash, USDC_ADDRESS } from "@tab/core";
import type { PublicClient } from "viem";
import { analyzeLogs, checkLegs, NotTabTxError, verifyTx } from "../src/verify";

const A = "0x00000000000000000000000000000000000000a1" as const;
const B = "0x00000000000000000000000000000000000000b2" as const;
const C = "0x00000000000000000000000000000000000000c3" as const;
const transferAbi = parseAbi(["event Transfer(address indexed from, address indexed to, uint256 value)"]);

function memoLog(sender: Hex, memoData: Hex, callDataHash: Hex, index: number) {
  const topics = encodeEventTopics({ abi: memoAbi, eventName: "Memo", args: { sender, target: USDC_ADDRESS, memoId: groupMemoId("g") } });
  const data = encodeAbiParameters([{ type: "bytes32" }, { type: "bytes" }, { type: "uint256" }], [callDataHash, memoData, BigInt(index)]);
  return { address: MEMO_ADDRESS as string, topics: topics as Hex[], data, logIndex: index * 2 };
}
function transferLog(from: Hex, to: Hex, value: bigint, logIndex: number, address: string = USDC_ADDRESS) {
  const topics = encodeEventTopics({ abi: transferAbi, eventName: "Transfer", args: { from, to } });
  return { address, topics: topics as Hex[], data: toHex(value, { size: 32 }), logIndex };
}
const leg = (from: Hex, to: Hex, amount: bigint, i: number, hash?: Hex) => memoLog(from, encodeSettleMemo({ from, to, amount }), hash ?? settleCallDataHash(to, amount), i);

describe("verify: receipt analysis", () => {
  it("planted control: two honest legs are both confirmed", () => {
    const f = analyzeLogs([leg(A, B, 5n, 0), transferLog(A, B, 5n, 1), leg(A, C, 7n, 1), transferLog(A, C, 7n, 3)]);
    expect(f.memos).toHaveLength(2);
    const legs = checkLegs(f);
    expect(legs).toHaveLength(2);
    expect(legs.every((l) => l.hashMatches && l.transferSeen)).toBe(true);
  });
  it("a memo that claims a payment with no transfer is flagged", () => {
    expect(checkLegs(analyzeLogs([leg(A, B, 5n, 0)]))[0]!.transferSeen).toBe(false);
  });
  it("a wrong callDataHash is flagged", () => {
    const legs = checkLegs(analyzeLogs([leg(A, B, 5n, 0, settleCallDataHash(B, 4n)), transferLog(A, B, 5n, 1)]));
    expect(legs[0]!.hashMatches).toBe(false);
  });
  it("one transfer cannot satisfy two identical legs", () => {
    const legs = checkLegs(analyzeLogs([leg(A, B, 5n, 0), leg(A, B, 5n, 1), transferLog(A, B, 5n, 1)]));
    expect(legs.map((l) => l.transferSeen)).toEqual([true, false]);
  });
  it("the system emitter 18-decimal twin is not counted", () => {
    const sys = "0xfffffffffffffffffffffffffffffffffffffffe";
    const legs = checkLegs(analyzeLogs([leg(A, B, 5n, 0), transferLog(A, B, 5n * 10n ** 12n, 1, sys)]));
    expect(legs[0]!.transferSeen).toBe(false);
  });
  it("ignores memos from other contracts", () => {
    const l = leg(A, B, 5n, 0);
    expect(analyzeLogs([{ ...l, address: "0x0000000000000000000000000000000000001234" }]).memos).toHaveLength(0);
  });
});

describe("verifyTx on a tx that is not Tab's", () => {
  const client = (logs: ReturnType<typeof memoLog>[], calls: string[]) =>
    ({
      getTransactionReceipt: async () => ({ status: "success", blockNumber: 100n, from: A, logs }),
      getBlockNumber: async () => 100n,
      getLogs: async () => { calls.push("getLogs"); return []; },
    }) as unknown as PublicClient;
  const tx = ("0x" + "ab".repeat(32)) as Hex;
  it("planted control: a tx with a real Tab settle leg is not refused", async () => {
    const calls: string[] = [];
    const c = client([leg(A, B, 5n, 0), transferLog(A, B, 5n, 1)], calls);
    await verifyTx(c, tx, { fromBlock: 90n }).catch((e) => expect(e).not.toBeInstanceOf(NotTabTxError));
    expect(calls).toContain("getLogs");
  });
  it("a Memo with foreign data is refused at once, without scanning logs", async () => {
    const calls: string[] = [];
    const c = client([memoLog(A, "0x1234", ("0x" + "00".repeat(32)) as Hex, 0)], calls);
    await expect(verifyTx(c, tx)).rejects.toBeInstanceOf(NotTabTxError);
    expect(calls).toEqual([]);
  });
  it("a tx with no Memo event is refused the same way", async () => {
    await expect(verifyTx(client([], []), tx)).rejects.toThrow(/not a Tab transaction/);
  });
});
