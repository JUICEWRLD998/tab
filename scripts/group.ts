// Read a Tab group from the chain in a terminal: members, expenses, balances, and the netted plan. No wallet, read-only.
//   npm run group -- tab-1h4j301v 24357102
// The second argument is the block the group was created in (a share link carries it). Without it the reader walks back from the head.
import { findLedger, makePublicClient } from "@tab/chain";
import { formatUsdc, groupMemoId, netTransfers, pairwiseDebts } from "@tab/core";

const id = process.argv[2];
if (!id) {
  console.error("usage: npm run group -- <group id> [creation block]");
  process.exit(2);
}
const fromBlock = process.argv[3] ? BigInt(process.argv[3]) : undefined;
const client = makePublicClient();
const short = (a: string) => `${a.slice(0, 6)}…${a.slice(-4)}`;

try {
  const head = await client.getBlockNumber();
  const { ledger, scannedFrom } = await findLedger(client, groupMemoId(id), { anchor: head, fromBlock, onProgress: (m) => console.error(`  … ${m}`) });
  if (!ledger) {
    console.log(`No group "${id}" found from block ${scannedFrom} to ${head}. Check the id, or pass the creation block.`);
    process.exit(1);
  }
  console.log(`group     "${ledger.name}"   id ${ledger.groupId}   created in block ${ledger.created.blockNumber} (tx ${ledger.created.txHash})`);
  console.log(`members   ${ledger.members.map(short).join(", ")}`);
  console.log(`expenses  ${ledger.expenses.length}`);
  for (const e of ledger.expenses) console.log(`  ${short(e.payer)} paid ${formatUsdc(e.amount)} for ${e.participants.length} people: ${e.label}`);
  console.log(`settled   ${ledger.settled.length} legs`);
  for (const s of ledger.settled) console.log(`  ${short(s.from)} -> ${short(s.to)}  ${formatUsdc(s.amount)}  (tx ${s.txHash})`);
  const debts = pairwiseDebts(ledger.expenses, ledger.settled);
  const plan = netTransfers(ledger.balances);
  console.log(`open      ${debts.length} pairwise debts -> ${plan.length} transfers after netting`);
  for (const t of plan) console.log(`  ${short(t.from)} -> ${short(t.to)}  ${formatUsdc(t.amount)} USDC`);
  console.log(`rejected  ${ledger.rejected.length} memos failed the trust rules`);
} catch (e) {
  console.error(`could not read the group: ${(e as Error).message.split("\n")[0]}`);
  process.exit(3);
}
