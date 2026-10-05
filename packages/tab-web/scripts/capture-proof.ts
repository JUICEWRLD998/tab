// Captures the Phase 3 mainnet settle into src/data/proof.json using the same verifyTx the Verify page runs.
// The landing receipt is this real tx, not typed-in numbers. Usage: npx vite-node scripts/capture-proof.ts [txHash]
import { writeFileSync } from "node:fs";
import { makePublicClient, verifyTx } from "@tab/chain";

const hash = (process.argv[2] ?? "0x42a23d78ca8e4ee7a16975b27d5c18ab303edb67359412aadc5f5b184936eec8") as `0x${string}`;
const v = await verifyTx(makePublicClient(), hash, { onProgress: (m) => console.log(m) });
if (!v.legs.length || !v.legs.every((l) => l.hashMatches && l.transferSeen) || v.legsInLedger !== v.legs.length) {
  throw new Error("refusing to capture a tx that does not verify");
}
const out = {
  hash: v.hash,
  blockNumber: v.blockNumber.toString(),
  signer: v.signer,
  memoId: v.memoIds[0],
  groupName: v.ledger?.name ?? "",
  members: v.ledger?.members.length ?? 0,
  expenses: v.ledger?.expenses.length ?? 0,
  createdBlock: v.ledger?.created.blockNumber.toString() ?? null,
  legs: v.legs.map((l) => ({ from: l.from, to: l.to, amount: l.amount.toString() })),
  capturedAt: new Date().toISOString(),
};
writeFileSync(new URL("../src/data/proof.json", import.meta.url), JSON.stringify(out, null, 2) + "\n");
console.log(out);
