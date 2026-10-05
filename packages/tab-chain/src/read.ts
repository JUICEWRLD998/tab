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
  /** Wait until the RPC head reaches this block before reading. The load-balanced endpoint can serve a head behind a receipt you just got (seen live 2026-10-05), so pass the block of your last write. */
  minHead?: bigint;
}

export async function waitForHead(client: PublicClient, minHead: bigint, opts: { timeoutMs?: number; pollMs?: number } = {}): Promise<bigint> {
  const { timeoutMs = 15_000, pollMs = 250 } = opts;
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    const head = await withRetry(() => client.getBlockNumber());
    if (head >= minHead) return head;
    if (Date.now() > deadline) throw new Error(`RPC head ${head} did not reach block ${minHead} within ${timeoutMs}ms`);
    await new Promise((r) => setTimeout(r, pollMs));
  }
}

/** Chunks run a few at a time: a day of Arc is about 170k blocks, so a serial scan is slow in a browser. */
const PARALLEL = 2;

export async function fetchMemoEntriesById(client: PublicClient, memoId: Hex, opts: ReadOptions): Promise<LedgerEntry[]> {
  if (opts.minHead !== undefined) await waitForHead(client, opts.minHead);
  const head = opts.toBlock ?? (await withRetry(() => client.getBlockNumber()));
  const chunk = opts.chunk ?? LOG_CHUNK;
  if (opts.fromBlock > head) return [];
  const event = memoAbi.find((x) => x.type === "event" && x.name === "Memo")!;
  const ranges: [bigint, bigint][] = [];
  for (let from = opts.fromBlock; from <= head; from += chunk) ranges.push([from, from + chunk - 1n > head ? head : from + chunk - 1n]);
  const out: LedgerEntry[] = [];
  for (let i = 0; i < ranges.length; i += PARALLEL) {
    const batch = await Promise.all(
      ranges.slice(i, i + PARALLEL).map(([from, to]) => withRetry(() => client.getLogs({ address: MEMO_ADDRESS, event, args: { memoId }, fromBlock: from, toBlock: to }))),
    );
    for (const logs of batch)
      for (const l of logs) {
        const d = decodeMemoLog({ topics: l.topics as Hex[], data: l.data });
        out.push({ sender: d.sender, target: d.target, callDataHash: d.callDataHash, memoData: d.memoData, blockNumber: l.blockNumber, logIndex: l.logIndex, txHash: l.transactionHash });
      }
  }
  return out;
}

export function fetchMemoEntries(client: PublicClient, groupId: string, opts: ReadOptions): Promise<LedgerEntry[]> {
  return fetchMemoEntriesById(client, groupMemoId(groupId), opts);
}

export async function readLedger(client: PublicClient, groupId: string, opts: ReadOptions): Promise<Ledger | null> {
  return buildLedger(groupId, await fetchMemoEntries(client, groupId, opts));
}
