import { decodeAbiParameters, decodeEventLog, encodeAbiParameters, keccak256, parseAbi, parseAbiParameters, stringToBytes, type Hex } from "viem";
import { normalize, type Address } from "./expense";
import type { Amount } from "./money";

/** Arc mainnet predeploys (live bytecode checked 2026-10-01, see DECISIONS.md). */
export const MEMO_ADDRESS = "0x5294E9927c3306DcBaDb03fe70b92e01cCede505" as const;
export const MULTICALL3FROM_ADDRESS = "0x522fAf9A91c41c443c66765030741e4AaCe147D0" as const;
export const USDC_ADDRESS = "0x3600000000000000000000000000000000000000" as const;

/** Event ABI proven by a real mainnet tx (DECISIONS.md D1). topic0 is checked in tests. */
export const memoAbi = parseAbi([
  "function memo(address target, bytes data, bytes32 memoId, bytes memoData)",
  "event BeforeMemo(uint256 index)",
  "event Memo(address indexed sender, address indexed target, bytes32 indexed memoId, bytes32 callDataHash, bytes memoData, uint256 index)",
]);
export const MEMO_TOPIC0 = "0xeb15ee720798341c37739df41be53acfbbf70ae6802dade35457beec6e47a5e4" as const;

export const KIND_EXPENSE = 1;
export const KIND_SETTLE = 2;

export function groupMemoId(groupId: string): Hex {
  if (!groupId) throw new Error("groupId is empty");
  return keccak256(stringToBytes("tab:" + groupId));
}

const expenseParams = parseAbiParameters("uint8 kind, address payer, uint256 amount, address[] participants, string label");
const settleParams = parseAbiParameters("uint8 kind, address from, address to, uint256 amount");

export interface ExpenseMemo {
  kind: "expense";
  payer: Address;
  amount: Amount;
  participants: Address[];
  label: string;
}
export interface SettleMemo {
  kind: "settle";
  from: Address;
  to: Address;
  amount: Amount;
}
export type TabMemo = ExpenseMemo | SettleMemo;

export function encodeExpenseMemo(m: Omit<ExpenseMemo, "kind">): Hex {
  if (m.amount <= 0n) throw new Error("amount must be positive");
  const participants = [...new Set(m.participants.map(normalize))].sort();
  return encodeAbiParameters(expenseParams, [KIND_EXPENSE, normalize(m.payer), m.amount, participants, m.label]);
}

export function encodeSettleMemo(m: Omit<SettleMemo, "kind">): Hex {
  if (m.amount <= 0n) throw new Error("amount must be positive");
  return encodeAbiParameters(settleParams, [KIND_SETTLE, normalize(m.from), normalize(m.to), m.amount]);
}

/** Returns null for memoData that is not a Tab memo, so foreign memos under the same id never crash the reader. */
export function decodeTabMemo(memoData: Hex): TabMemo | null {
  try {
    const kind = Number(decodeAbiParameters(parseAbiParameters("uint8 kind"), memoData.slice(0, 66) as Hex)[0]);
    if (kind === KIND_EXPENSE) {
      const [, payer, amount, participants, label] = decodeAbiParameters(expenseParams, memoData);
      return { kind: "expense", payer: payer.toLowerCase() as Address, amount, participants: participants.map((p) => p.toLowerCase() as Address), label };
    }
    if (kind === KIND_SETTLE) {
      const [, from, to, amount] = decodeAbiParameters(settleParams, memoData);
      return { kind: "settle", from: from.toLowerCase() as Address, to: to.toLowerCase() as Address, amount };
    }
    return null;
  } catch {
    return null;
  }
}

export interface MemoLog {
  sender: Address;
  target: Address;
  memoId: Hex;
  callDataHash: Hex;
  memoData: Hex;
  index: bigint;
}

export function decodeMemoLog(log: { topics: readonly Hex[]; data: Hex }): MemoLog {
  if (log.topics[0] !== MEMO_TOPIC0) throw new Error("not a Memo log");
  const d = decodeEventLog({ abi: memoAbi, eventName: "Memo", topics: log.topics as [Hex, ...Hex[]], data: log.data });
  const a = d.args;
  return { sender: a.sender.toLowerCase() as Address, target: a.target.toLowerCase() as Address, memoId: a.memoId, callDataHash: a.callDataHash, memoData: a.memoData, index: a.index };
}
