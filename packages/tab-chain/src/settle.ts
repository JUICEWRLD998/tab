import { decodeFunctionData, encodeFunctionData, parseAbi, type Hex, type PublicClient, type WalletClient } from "viem";
import { encodeSettleMemo, groupMemoId, MEMO_ADDRESS, MULTICALL3FROM_ADDRESS, memoAbi, netTransfers, normalize, settleCallData, USDC_ADDRESS, type Address, type Ledger, type Transfer } from "@tab/core";
import { feeOverrides } from "./write";
import { isBlocklisted } from "./guards";

export const multicallAbi = parseAbi(["function aggregate3((address target, bool allowFailure, bytes callData)[] calls) payable returns ((bool success, bytes returnData)[] returnData)"]);

/** The whole group's plan: N non-zero balances become at most N-1 transfers. */
export function planSettlement(ledger: Ledger): Transfer[] {
  return netTransfers(ledger.balances);
}

/** A single signature moves value only from the signer (DECISIONS.md D4), so each debtor signs the legs they owe. */
export function legsFor(plan: Transfer[], debtor: Address): Transfer[] {
  const d = normalize(debtor);
  return plan.filter((t) => t.from === d);
}

/** Multicall3From.aggregate3 of Memo.memo(USDC.transfer(to, amount), groupMemoId, settleMemo) legs, allowFailure = false. */
export function buildSettleBatch(groupId: string, legs: Transfer[]): { to: Address; data: Hex } {
  if (legs.length === 0) throw new Error("no legs to settle");
  const memoId = groupMemoId(groupId);
  const calls = legs.map((leg) => ({
    target: MEMO_ADDRESS as Address,
    allowFailure: false,
    callData: encodeFunctionData({
      abi: memoAbi,
      functionName: "memo",
      args: [USDC_ADDRESS, settleCallData(leg.to, leg.amount), memoId, encodeSettleMemo(leg)],
    }),
  }));
  return { to: MULTICALL3FROM_ADDRESS, data: encodeFunctionData({ abi: multicallAbi, functionName: "aggregate3", args: [calls] }) };
}

/** Inverse of buildSettleBatch, used by tests and by the verify page to show what a tx would do. */
export function decodeSettleBatch(data: Hex): { target: Address; memoId: Hex; callData: Hex; memoData: Hex }[] {
  const { args } = decodeFunctionData({ abi: multicallAbi, data });
  return args[0].map((c) => {
    const m = decodeFunctionData({ abi: memoAbi, data: c.callData });
    if (m.functionName !== "memo") throw new Error("unexpected call in batch");
    const [, callData, memoId, memoData] = m.args;
    return { target: c.target as Address, memoId, callData, memoData };
  });
}

const balanceAbi = parseAbi(["function balanceOf(address) view returns (uint256)"]);

export interface Preflight {
  legs: Transfer[];
  blocked: Address[];
  /** Set when the signer cannot cover the legs (plus the fee, once it is known). Amounts in 6-decimal USDC base units. */
  short?: { balance: bigint; needed: bigint };
  /** Gas units from eth_estimateGas, and the cost in USDC base units (6 decimals). */
  gas: bigint;
  feeUsdc: bigint;
  ok: boolean;
}

/** Simulate first, show exact legs and cost before the wallet prompt, and drop nothing silently: blocklisted recipients are reported, not sent. */
export async function preflightSettle(pub: PublicClient, signer: Address, groupId: string, legs: Transfer[]): Promise<Preflight> {
  const blocked: Address[] = [];
  for (const addr of new Set([normalize(signer), ...legs.map((l) => l.to)])) if (await isBlocklisted(pub, addr)) blocked.push(addr);
  if (blocked.length) return { legs, blocked, gas: 0n, feeUsdc: 0n, ok: false };
  // A batch the signer cannot fund reverts inside estimateGas with no reason, so check the balance first and say so plainly.
  const total = legs.reduce((a, l) => a + l.amount, 0n);
  const balance = await pub.readContract({ address: USDC_ADDRESS, abi: balanceAbi, functionName: "balanceOf", args: [normalize(signer)] });
  if (balance < total) return { legs, blocked, short: { balance, needed: total }, gas: 0n, feeUsdc: 0n, ok: false };
  const tx = buildSettleBatch(groupId, legs);
  const fees = await feeOverrides(pub);
  const gas = await pub.estimateGas({ account: signer, to: tx.to, data: tx.data, ...fees });
  // native balance and gas price are 18-decimal; the ERC-20 view is 6. Convert once, here.
  const feeUsdc = (gas * fees.maxFeePerGas) / 10n ** 12n;
  if (balance < total + feeUsdc) return { legs, blocked, short: { balance, needed: total + feeUsdc }, gas, feeUsdc, ok: false };
  return { legs, blocked, gas, feeUsdc, ok: true };
}

/** One plain sentence for a failed preflight. Used by settle() so the library never says "blocklisted" about a balance problem. */
export function preflightMessage(pf: Preflight): string {
  if (pf.blocked.length) return `blocklisted address in batch: ${pf.blocked.join(", ")}. Pay that leg manually.`;
  if (pf.short) return `the signer holds ${pf.short.balance} base units of USDC but the batch needs ${pf.short.needed} including the fee.`;
  return "the settle batch failed its preflight.";
}

export async function settle(pub: PublicClient, wallet: WalletClient, groupId: string, legs: Transfer[]): Promise<{ hash: Hex; blockNumber: bigint }> {
  const account = wallet.account!;
  const self = normalize(account.address);
  if (legs.some((l) => l.from !== self)) throw new Error("a wallet can only sign legs it owes (msg.sender is preserved)");
  const pf = await preflightSettle(pub, self, groupId, legs);
  if (!pf.ok) throw new Error(preflightMessage(pf));
  const tx = buildSettleBatch(groupId, legs);
  const fees = await feeOverrides(pub);
  const hash = await wallet.sendTransaction({ account, chain: wallet.chain, to: tx.to, data: tx.data, gas: (pf.gas * 12n) / 10n, ...fees });
  const receipt = await pub.waitForTransactionReceipt({ hash });
  if (receipt.status !== "success") throw new Error(`settle reverted: ${hash}`);
  return { hash, blockNumber: receipt.blockNumber };
}
