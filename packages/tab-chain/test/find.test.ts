import { describe, expect, it } from "vitest";
import { encodeAbiParameters, encodeEventTopics, type Hex, type PublicClient } from "viem";
import { encodeExpenseMemo, encodeGroupMemo, groupMemoId, memoAbi, USDC_ADDRESS } from "@tab/core";
import { findLedger } from "../src/read";

const A = "0x00000000000000000000000000000000000000a1" as const;
const B = "0x00000000000000000000000000000000000000b2" as const;
const memoId = groupMemoId("find");

function log(blockNumber: bigint, memoData: Hex, sender: Hex = A) {
  const topics = encodeEventTopics({ abi: memoAbi, eventName: "Memo", args: { sender, target: USDC_ADDRESS, memoId } });
  const data = encodeAbiParameters([{ type: "bytes32" }, { type: "bytes" }, { type: "uint256" }], ["0x" + "00".repeat(32) as Hex, memoData, 0n]);
  return { blockNumber, logIndex: 0, transactionHash: ("0x" + blockNumber.toString(16).padStart(64, "0")) as Hex, topics, data };
}

/** A fake chain: only getBlockNumber and getLogs, which is all the reader uses. Counts the ranges it was asked for. */
function fakeClient(head: bigint, logs: ReturnType<typeof log>[]) {
  const ranges: [bigint, bigint][] = [];
  const client = {
    getBlockNumber: async () => head,
    getLogs: async (p: { fromBlock: bigint; toBlock: bigint }) => {
      ranges.push([p.fromBlock, p.toBlock]);
      return logs.filter((l) => l.blockNumber >= p.fromBlock && l.blockNumber <= p.toBlock);
    },
  } as unknown as PublicClient;
  return { client, ranges };
}

describe("findLedger", () => {
  const create = (b: bigint) => log(b, encodeGroupMemo({ name: "Trip", members: [A, B] }));
  const spend = (b: bigint) => log(b, encodeExpenseMemo({ payer: A, amount: 10n, participants: [A, B], label: "x" }));

  it("planted control: a group created 130k blocks back is found by walking back, with the later expense merged in", async () => {
    const { client, ranges } = fakeClient(300_000n, [create(170_000n), spend(250_000n)]);
    const r = await findLedger(client, memoId, { anchor: 300_000n });
    expect(r.ledger).not.toBeNull();
    expect(r.ledger!.name).toBe("Trip");
    expect(r.ledger!.expenses).toHaveLength(1);
    expect(r.scannedFrom).toBeLessThanOrEqual(170_000n);
    expect(ranges.length).toBeGreaterThan(8);
  });
  it("stops at the cap and reports no group instead of scanning forever", async () => {
    const { client } = fakeClient(1_000_000n, [create(10n)]);
    const r = await findLedger(client, memoId, { anchor: 1_000_000n, lookback: 120_000n });
    expect(r.ledger).toBeNull();
    expect(1_000_000n - r.scannedFrom).toBeLessThanOrEqual(160_000n);
  });
  it("a known fromBlock scans once and never walks back", async () => {
    const { client, ranges } = fakeClient(300_000n, []);
    const r = await findLedger(client, memoId, { anchor: 300_000n, fromBlock: 299_000n });
    expect(r.ledger).toBeNull();
    expect(ranges).toEqual([[299_000n, 300_000n]]);
  });
  it("near genesis the walk stops at block 0", async () => {
    const { client } = fakeClient(50_000n, []);
    const r = await findLedger(client, memoId, { anchor: 50_000n });
    expect(r.scannedFrom).toBe(0n);
  });
});
