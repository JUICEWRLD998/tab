import { buildLedger, decodeMemoLog, groupMemoId, MEMO_ADDRESS, memoAbi, type Ledger, type LedgerEntry } from "@tab/core";
import type { Hex, PublicClient } from "viem";
import { withRetry } from "./retry";

/** The RPC rejects ranges over 10,000 blocks (-32012 "requested range too large", measured 2026-10-05). Stay well under. */
export const LOG_CHUNK = 5_000n;

export interface ReadOptions {
  /** First block to scan. Required for an old group; a group created now can pass its creation block. */
  fromBlock: bigint;
  toBlock?: bigint;
  chunk?: bigint;
}

export async function fetchMemoEntries(client: PublicClient, groupId: string, opts: ReadOptions): Promise<LedgerEntry[]> {
  const memoId = groupMemoId(groupId);
  const head = opts.toBlock ?? (await withRetry(() => client.getBlockNumber()));
  const chunk = opts.chunk ?? LOG_CHUNK;
  if (opts.fromBlock > head) return [];
  const event = memoAbi.find((x) => x.type === "event" && x.name === "Memo")!;
  const out: LedgerEntry[] = [];
  for (let from = opts.fromBlock; from <= head; from += chunk) {
    const to = from + chunk - 1n > head ? head : from + chunk - 1n;
    const logs = await withRetry(() => client.getLogs({ address: MEMO_ADDRESS, event, args: { memoId }, fromBlock: from, toBlock: to }));
    for (const l of logs) {
      const d = decodeMemoLog({ topics: l.topics as Hex[], data: l.data });
      out.push({ sender: d.sender, target: d.target, callDataHash: d.callDataHash, memoData: d.memoData, blockNumber: l.blockNumber, logIndex: l.logIndex, txHash: l.transactionHash });
    }
  }
  return out;
}

export async function readLedger(client: PublicClient, groupId: string, opts: ReadOptions): Promise<Ledger | null> {
  return buildLedger(groupId, await fetchMemoEntries(client, groupId, opts));
}
