import { findLedger, waitForHead, withRetry } from "@tab/chain";
import { groupMemoId, netTransfers, pairwiseDebts, type Ledger, type Transfer } from "@tab/core";
import { useRef } from "react";
import { pub } from "./chain";
import { useAsync, type Async } from "./useAsync";

export interface LoadedGroup {
  ledger: Ledger;
  scannedFrom: bigint;
  head: bigint;
}

/**
 * Read a group from chain logs. `from` is the creation block carried by a share link; without it the reader scans back from the head.
 * `minHead` is the block of a write the caller just made: the load-balanced RPC can serve a head behind a fresh receipt, so wait for it.
 * Returns null when no creation memo is found in the scanned range.
 */
export async function loadGroup(id: string, from: bigint | undefined, onProgress: (msg: string) => void, minHead?: bigint): Promise<LoadedGroup | null> {
  onProgress("reading the chain");
  if (minHead !== undefined) await waitForHead(pub, minHead);
  const head = await withRetry(() => pub.getBlockNumber());
  const { ledger, scannedFrom } = await findLedger(pub, groupMemoId(id), { anchor: head, fromBlock: from, onProgress });
  return ledger ? { ledger, scannedFrom, head } : null;
}

/** The "before" side: open pairwise debts as a group chat would count them. */
export const debtsOf = (l: Ledger): Transfer[] => pairwiseDebts(l.expenses, l.settled);
/** The "after" side: at most N-1 transfers that square everyone. */
export const planOf = (l: Ledger): Transfer[] => netTransfers(l.balances);

/**
 * Load a group for a screen. `reload(minHead)` re-reads after a write; pass the write's block so the RPC head catches up first.
 */
export function useGroup(id: string, from: bigint | undefined): [Async<LoadedGroup | null>, (minHead?: bigint) => void] {
  const minHead = useRef<bigint | undefined>(undefined);
  const [state, reload] = useAsync(`${id}|${from ?? ""}`, (progress) => {
    const m = minHead.current;
    minHead.current = undefined;
    return loadGroup(id, from, progress, m);
  });
  return [
    state,
    (mh) => {
      minHead.current = mh;
      reload();
    },
  ];
}
