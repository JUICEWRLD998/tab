# @tab/core

The pure part of [Tab](https://github.com/JUICEWRLD998/tab): everything that needs no network. It runs in Node and in the browser.

- `parseUsdc`, `formatUsdc`: integer base units at 6 decimals. It never touches the 18-decimal native view.
- `equalSplit`, `customSplit`: splits that always sum exactly. The remainder goes one base unit at a time to participants in sorted address order.
- `foldBalances`, `netTransfers`, `applyTransfers`: balances per address, and a greedy min-cash-flow plan with at most N-1 transfers.
- `pairwiseDebts`: the "before" count, as a group chat would tally it.
- `groupMemoId`, `encodeGroupMemo`, `encodeExpenseMemo`, `encodeSettleMemo`, `decodeTabMemo`, `decodeMemoLog`: the Memo payloads and the proven `Memo` event ABI for Arc mainnet.
- `buildLedger`: rebuilds a group from decoded `Memo` logs and enforces the trust rules (member-only senders, payer equals sender, settle legs bound to the USDC transfer by `callDataHash`).

```ts
import { buildLedger, netTransfers } from "@tab/core";
const ledger = buildLedger("tab-1h4j301v", entries);   // entries: decoded Memo logs, any order
const plan = ledger ? netTransfers(ledger.balances) : [];
```

Tests: `npm test -w @tab/core` (54 tests). Status: not published to npm. The package points at TypeScript source, so it is used inside this monorepo.
