import { decodeEventLog, parseAbi, type Hex, type PublicClient } from "viem";
import { buildLedger, decodeMemoLog, decodeTabMemo, MEMO_ADDRESS, MEMO_TOPIC0, settleCallDataHash, USDC_ADDRESS, type Address, type Amount, type Ledger, type TabMemo } from "@tab/core";
import { fetchMemoEntriesById } from "./read";
import { withRetry } from "./retry";

const transferEvent = parseAbi(["event Transfer(address indexed from, address indexed to, uint256 value)"]);

export interface RawLog {
  address: string;
  topics: readonly Hex[];
  data: Hex;
}

export interface TxMemo {
  logIndex: number;
  sender: Address;
  target: Address;
  memoId: Hex;
  callDataHash: Hex;
  memo: TabMemo | null;
}

export interface ReceiptFacts {
  memos: TxMemo[];
  /** Transfers from the 6-decimal ERC-20 interface only. The system emitter's 18-decimal twin is ignored (DECISIONS.md D3). */
  transfers: { from: Address; to: Address; amount: Amount }[];
}

/** Pure: pull the Memo logs and the 6-decimal USDC transfers out of one receipt's logs. */
export function analyzeLogs(logs: (RawLog & { logIndex: number })[]): ReceiptFacts {
  const memos: TxMemo[] = [];
  const transfers: ReceiptFacts["transfers"] = [];
  for (const l of logs) {
    const addr = l.address.toLowerCase();
    if (addr === MEMO_ADDRESS.toLowerCase() && l.topics[0] === MEMO_TOPIC0) {
      const d = decodeMemoLog({ topics: l.topics, data: l.data });
      memos.push({ logIndex: l.logIndex, sender: d.sender, target: d.target, memoId: d.memoId, callDataHash: d.callDataHash, memo: decodeTabMemo(d.memoData) });
    } else if (addr === USDC_ADDRESS.toLowerCase()) {
      try {
        const d = decodeEventLog({ abi: transferEvent, topics: l.topics as [Hex, ...Hex[]], data: l.data });
        transfers.push({ from: d.args.from.toLowerCase() as Address, to: d.args.to.toLowerCase() as Address, amount: d.args.value });
      } catch {
        /* not a Transfer */
      }
    }
  }
  return { memos, transfers };
}

export interface LegCheck {
  logIndex: number;
  from: Address;
  to: Address;
  amount: Amount;
  /** Memo.callDataHash equals keccak(USDC.transfer(to, amount)). */
  hashMatches: boolean;
  /** A USDC Transfer(from, to, amount) log exists in the same tx. Each transfer log satisfies one leg only. */
  transferSeen: boolean;
}

/** Pure: check every settle memo in the tx against the transfers the same tx actually emitted. */
export function checkLegs(facts: ReceiptFacts): LegCheck[] {
  const pool = [...facts.transfers];
  const out: LegCheck[] = [];
  for (const m of facts.memos) {
    if (m.memo?.kind !== "settle") continue;
    const { from, to, amount } = m.memo;
    const i = pool.findIndex((t) => t.from === from && t.to === to && t.amount === amount);
    if (i >= 0) pool.splice(i, 1);
    out.push({ logIndex: m.logIndex, from, to, amount, hashMatches: m.callDataHash === settleCallDataHash(to, amount), transferSeen: i >= 0 });
  }
  return out;
}

export interface TxVerification {
  hash: Hex;
  blockNumber: bigint;
  signer: Address;
  facts: ReceiptFacts;
  legs: LegCheck[];
  memoIds: Hex[];
  /** The group rebuilt from chain data alone, null when its creation memo is outside the scanned window. */
  ledger: Ledger | null;
  scannedFrom: bigint;
  /** Legs of this tx that the rebuilt ledger accepted. */
  legsInLedger: number;
}

export interface VerifyTxOptions {
  fromBlock?: bigint;
  /** Furthest look-back before the tx, in blocks, when fromBlock is not given. */
  lookback?: bigint;
  onProgress?: (msg: string) => void;
}

/** First look 40k blocks back (about 6 hours); if the creation memo is not there, walk back in steps up to this cap. */
export const LOOKBACK_STEP = 40_000n;
export const DEFAULT_LOOKBACK = 400_000n;

export async function verifyTx(client: PublicClient, hash: Hex, opts: VerifyTxOptions = {}): Promise<TxVerification> {
  opts.onProgress?.("reading receipt");
  const receipt = await withRetry(() => client.getTransactionReceipt({ hash }));
  if (receipt.status !== "success") throw new Error(`tx ${hash} did not succeed (status ${receipt.status})`);
  const facts = analyzeLogs(receipt.logs.map((l) => ({ address: l.address, topics: l.topics as Hex[], data: l.data, logIndex: l.logIndex })));
  if (facts.memos.length === 0) throw new Error("this tx has no Memo events");
  const memoIds = [...new Set(facts.memos.map((m) => m.memoId))];
  const legs = checkLegs(facts);
  const cap = opts.lookback ?? DEFAULT_LOOKBACK;
  const floor = (n: bigint) => (n > 0n ? n : 0n);

  // A Tab batch is one group. If a tx mixes memoIds, verify the first and say so through memoIds.length.
  opts.onProgress?.("rebuilding the group from chain logs");
  let scannedFrom = opts.fromBlock ?? floor(receipt.blockNumber - LOOKBACK_STEP);
  let entries = await fetchMemoEntriesById(client, memoIds[0]!, { fromBlock: scannedFrom, minHead: receipt.blockNumber });
  let ledger = buildLedger(memoIds[0]!, entries);
  // Walk further back only when the caller did not pin a start block and the creation memo is still missing.
  while (!ledger && opts.fromBlock === undefined && scannedFrom > 0n && receipt.blockNumber - scannedFrom < cap) {
    const from = floor(scannedFrom - LOOKBACK_STEP);
    opts.onProgress?.(`group not found yet, scanning back to block ${from}`);
    entries = [...(await fetchMemoEntriesById(client, memoIds[0]!, { fromBlock: from, toBlock: scannedFrom - 1n })), ...entries];
    scannedFrom = from;
    ledger = buildLedger(memoIds[0]!, entries);
  }
  const legsInLedger = ledger ? ledger.settled.filter((s) => s.txHash === hash).length : 0;
  return { hash, blockNumber: receipt.blockNumber, signer: receipt.from.toLowerCase() as Address, facts, legs, memoIds, ledger, scannedFrom, legsInLedger };
}
