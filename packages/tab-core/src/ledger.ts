import type { Hex } from "viem";
import { foldBalances } from "./balances";
import { normalize, type Address, type Expense } from "./expense";
import { settleCallDataHash, USDC_ADDRESS, decodeTabMemo } from "./memo";
import type { Amount } from "./money";

/** One decoded Memo log under the group's memoId, in chain order. */
export interface LedgerEntry {
  sender: Address;
  target: Address;
  callDataHash: Hex;
  memoData: Hex;
  blockNumber: bigint;
  logIndex: number;
  txHash: Hex;
}

export interface SettledLeg {
  from: Address;
  to: Address;
  amount: Amount;
  txHash: Hex;
}

export interface Ledger {
  groupId: string;
  name: string;
  members: Address[];
  creator: Address;
  expenses: Expense[];
  settled: SettledLeg[];
  /** Net balance after expenses AND settled legs. Zero for everyone when the group is square. */
  balances: Map<Address, Amount>;
  rejected: { entry: LedgerEntry; reason: string }[];
}

/**
 * Rebuild a group from its Memo logs alone. Memos under a memoId are public, so anyone can post into any group.
 * Trust rules, all enforced here:
 *  - the first well-formed group memo (chain order) defines the member list; its sender is the creator and must be a member
 *  - every other memo must come from a member
 *  - an expense must have sender == payer and every participant a member
 *  - a settle leg must have sender == from, both parties members, target == USDC, and callDataHash == keccak(USDC.transfer(to, amount)),
 *    so the memo cannot claim a payment the chain did not execute
 * Returns null if the group was never created.
 */
export function buildLedger(groupId: string, entries: LedgerEntry[]): Ledger | null {
  const sorted = [...entries].sort((a, b) => (a.blockNumber === b.blockNumber ? a.logIndex - b.logIndex : a.blockNumber < b.blockNumber ? -1 : 1));
  let name = "";
  let creator: Address | null = null;
  let members = new Set<Address>();
  const expenses: Expense[] = [];
  const settled: SettledLeg[] = [];
  const rejected: Ledger["rejected"] = [];
  const seen = new Set<string>();

  for (const e of sorted) {
    const key = `${e.txHash}:${e.logIndex}`;
    if (seen.has(key)) continue;
    seen.add(key);
    const m = decodeTabMemo(e.memoData);
    if (!m) { rejected.push({ entry: e, reason: "not a Tab memo" }); continue; }
    const sender = e.sender.toLowerCase() as Address;

    if (m.kind === "group") {
      if (creator) { rejected.push({ entry: e, reason: "group already created" }); continue; }
      const list = m.members.map(normalize);
      if (list.length < 2 || !list.includes(sender)) { rejected.push({ entry: e, reason: "creator must be a member of a 2+ member group" }); continue; }
      creator = sender; name = m.name; members = new Set(list);
      continue;
    }
    if (!creator) { rejected.push({ entry: e, reason: "group not created yet" }); continue; }
    if (!members.has(sender)) { rejected.push({ entry: e, reason: "sender is not a member" }); continue; }

    if (m.kind === "expense") {
      if (m.payer !== sender) { rejected.push({ entry: e, reason: "payer must be the sender" }); continue; }
      if (m.amount <= 0n || m.participants.length === 0 || !m.participants.every((p) => members.has(p))) { rejected.push({ entry: e, reason: "invalid participants or amount" }); continue; }
      expenses.push({ groupId, payer: m.payer, amount: m.amount, participants: m.participants, label: m.label });
    } else if (m.kind === "settle") {
      if (m.from !== sender) { rejected.push({ entry: e, reason: "settle from must be the sender" }); continue; }
      if (!members.has(m.to) || m.to === m.from || m.amount <= 0n) { rejected.push({ entry: e, reason: "invalid settle parties or amount" }); continue; }
      if (e.target.toLowerCase() !== USDC_ADDRESS.toLowerCase() || e.callDataHash !== settleCallDataHash(m.to, m.amount)) { rejected.push({ entry: e, reason: "callDataHash does not match a USDC transfer of this memo" }); continue; }
      settled.push({ from: m.from, to: m.to, amount: m.amount, txHash: e.txHash });
    }
  }
  if (!creator) return null;

  const balances = foldBalances(expenses);
  for (const s of settled) {
    balances.set(s.from, (balances.get(s.from) ?? 0n) + s.amount);
    balances.set(s.to, (balances.get(s.to) ?? 0n) - s.amount);
  }
  for (const [k, v] of balances) if (v === 0n) balances.delete(k);
  return { groupId, name, members: [...members].sort(), creator, expenses, settled, balances, rejected };
}
