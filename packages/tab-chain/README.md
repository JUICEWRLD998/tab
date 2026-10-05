# @tab/chain

The Arc mainnet layer of [Tab](https://github.com/JUICEWRLD998/tab), built on viem.

- `arcMainnet`, `makePublicClient`: chain 5042 with a retrying, rate-limit-aware transport.
- `fetchMemoEntriesById`, `findLedger`: read a group's `Memo` logs in 5,000-block chunks (two in flight) and rebuild it, walking back from a head or from a known creation block.
- `createGroup`, `logExpense`: write a memo through `Memo.memo`, with the 20 gwei fee floor.
- `planSettlement`, `legsFor`, `buildSettleBatch`, `preflightSettle`, `settle`: a `Multicall3From.aggregate3` batch with one `Memo.memo(USDC.transfer(...))` leg per creditor. Preflight checks the USDC blocklist, the signer's balance and the fee before a wallet prompt.
- `assertEoa`, `isBlocklisted`: guards for Arc's EOA-only predeploys and the USDC blocklist.
- `verifyTx`: rebuild a group from a settlement transaction hash and check every leg against the transfers that transaction made. It throws `NotTabTxError` for a transaction with no Tab memo.

```ts
import { makePublicClient, verifyTx } from "@tab/chain";
const v = await verifyTx(makePublicClient(), "0xf0a3c947b36eaf6a8c09a064454cded790c37a141fccb50821553cbfb34463a4");
console.log(v.legs.every((l) => l.hashMatches && l.transferSeen), v.legsInLedger);
```

Tests: `npm test -w @tab/chain` (29 tests, plus 5 that read mainnet when `LIVE=1`). Status: not published to npm. The package points at TypeScript source, so it is used inside this monorepo.
