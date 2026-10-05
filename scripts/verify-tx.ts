// Verify a Tab settlement from a transaction hash alone, in a terminal. No wallet, no key, read-only.
//   npm run verify -- 0xf0a3c947b36eaf6a8c09a064454cded790c37a141fccb50821553cbfb34463a4
// Same code path as the Verify page (verifyTx). Exit code 0 only if every leg is confirmed and accepted by the rebuilt group.
import { makePublicClient, NotTabTxError, verifyTx } from "@tab/chain";
import { formatUsdc } from "@tab/core";

const hash = process.argv[2] as `0x${string}` | undefined;
if (!hash || !/^0x[0-9a-fA-F]{64}$/.test(hash)) {
  console.error("usage: npm run verify -- <0x…64-hex transaction hash> [creation block]");
  process.exit(2);
}
const fromBlock = process.argv[3] ? BigInt(process.argv[3]) : undefined;

try {
  const v = await verifyTx(makePublicClient(), hash, { fromBlock, onProgress: (m) => console.error(`  … ${m}`) });
  const short = (a: string) => `${a.slice(0, 6)}…${a.slice(-4)}`;
  console.log(`tx        ${v.hash}`);
  console.log(`block     ${v.blockNumber}   signer ${v.signer}`);
  console.log(`group     ${v.ledger ? `"${v.ledger.name}", ${v.ledger.members.length} members, created in block ${v.ledger.created.blockNumber}` : "not found in the scanned range"}`);
  console.log(`legs      ${v.legs.length} in this transaction`);
  v.legs.forEach((l) => {
    const accepted = !!v.ledger?.settled.some((s) => s.txHash === v.hash && s.from === l.from && s.to === l.to && s.amount === l.amount);
    const ok = l.hashMatches && l.transferSeen && accepted;
    console.log(`  ${ok ? "OK  " : "FAIL"} ${short(l.from)} -> ${short(l.to)}  ${formatUsdc(l.amount)} USDC   memo-hash ${l.hashMatches ? "match" : "MISMATCH"}, transfer ${l.transferSeen ? "seen" : "MISSING"}, group ${!v.ledger ? "not found (pass the creation block as a second argument)" : accepted ? "accepts" : "REJECTS"}`);
  });
  const verified = v.legs.length > 0 && !!v.ledger && v.legs.every((l) => l.hashMatches && l.transferSeen) && v.legsInLedger === v.legs.length;
  if (v.ledger) {
    const open = [...v.ledger.balances.values()].filter((b) => b !== 0n).length;
    console.log(`balances  ${open === 0 ? "every member is square (zero)" : `${open} members still have a non-zero balance`}; ${v.ledger.rejected.length} memos rejected by the trust rules`);
  }
  console.log(verified ? `\nVERIFIED: ${v.legs.length} transfers, one signature.` : "\nNOT VERIFIED.");
  process.exit(verified ? 0 : 1);
} catch (e) {
  if (e instanceof NotTabTxError) {
    console.error(`NOT A TAB TRANSACTION: ${e.message}`);
    process.exit(1);
  }
  console.error(`could not verify: ${(e as Error).message.split("\n")[0]}`);
  process.exit(3);
}
