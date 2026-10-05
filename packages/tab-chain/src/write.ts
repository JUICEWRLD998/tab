import { encodeFunctionData, type Hex, type PublicClient, type WalletClient } from "viem";
import { encodeExpenseMemo, encodeGroupMemo, erc20TransferAbi, groupMemoId, MEMO_ADDRESS, memoAbi, normalize, USDC_ADDRESS, type Address, type Amount } from "@tab/core";
import { MIN_FEE_PER_GAS } from "./chain";

/** A call Memo can wrap that moves no value and always succeeds: USDC.transfer(self, 0). Proven on mainnet (DECISIONS.md D1). */
export function noopTarget(self: Address): { target: Address; data: Hex } {
  return { target: USDC_ADDRESS, data: encodeFunctionData({ abi: erc20TransferAbi, functionName: "transfer", args: [normalize(self), 0n] }) };
}

export function memoCall(self: Address, groupId: string, memoData: Hex, wrapped?: { target: Address; data: Hex }) {
  const t = wrapped ?? noopTarget(self);
  return { address: MEMO_ADDRESS, abi: memoAbi, functionName: "memo" as const, args: [t.target, t.data, groupMemoId(groupId), memoData] as const };
}

export async function feeOverrides(client: PublicClient): Promise<{ maxFeePerGas: bigint; maxPriorityFeePerGas: bigint }> {
  const gp = await client.getGasPrice();
  return { maxFeePerGas: gp > MIN_FEE_PER_GAS ? gp : MIN_FEE_PER_GAS, maxPriorityFeePerGas: 0n };
}

async function send(pub: PublicClient, wallet: WalletClient, call: ReturnType<typeof memoCall>) {
  const account = wallet.account!;
  const fees = await feeOverrides(pub);
  const { request } = await pub.simulateContract({ ...call, account, ...fees });
  const hash = await wallet.writeContract(request);
  const receipt = await pub.waitForTransactionReceipt({ hash });
  if (receipt.status !== "success") throw new Error(`tx reverted: ${hash}`);
  return { hash, blockNumber: receipt.blockNumber };
}

export async function createGroup(pub: PublicClient, wallet: WalletClient, groupId: string, name: string, members: Address[]) {
  return send(pub, wallet, memoCall(normalize(wallet.account!.address), groupId, encodeGroupMemo({ name, members })));
}

export async function logExpense(pub: PublicClient, wallet: WalletClient, groupId: string, e: { amount: Amount; participants: Address[]; label: string }) {
  const payer = normalize(wallet.account!.address);
  return send(pub, wallet, memoCall(payer, groupId, encodeExpenseMemo({ payer, ...e })));
}
