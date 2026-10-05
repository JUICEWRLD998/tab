# CLAIMS

Every README claim, mapped to a command or tx hash that reproduces it. Status words: LIVE / NEXT / NOT LIVE.

| Claim | Status | Reproduce |
|---|---|---|
| A real `Memo.memo` tx emits a decodable `Memo` event | LIVE | tx `0x696f1765e068c962a1cb8a8e7d21f74ad2d67ff8d97f2103528d179d83c8b0ba`; `cast receipt <tx> --rpc-url https://rpc.mainnet.arc.io`; decoded in `packages/tab-core/test/memo.test.ts` |
| One signature settles 3 legs, each with its own memo, sender preserved | LIVE | tx `0x42a23d78ca8e4ee7a16975b27d5c18ab303edb67359412aadc5f5b184936eec8` (DECISIONS.md D7) |
| The ledger rebuilds from chain data alone | LIVE | `LIVE=1 TAB_WALLET_DIR=<dir> npx vitest run packages/tab-chain/test/live.test.ts` (needs a funded wallet) |
| Outsiders cannot forge expenses or settle claims | LIVE | `packages/tab-core/test/ledger.test.ts` (planted attacker cases) |
| Netting gives at most N-1 transfers and zeroes every balance | LIVE | `packages/tab-core/test/netting.test.ts` (300 seeded cases) |
| A tx hash alone reproduces a settle: legs, per-leg transfer, rebuilt group | LIVE | `LIVE=1 npx vitest run packages/tab-chain/test/verify.live.test.ts` (read-only, no wallet); DECISIONS.md D8 |
| The web app creates a group, logs expenses, settles and verifies on mainnet through a browser wallet | LIVE | `TAB_WALLET_DIR=<dir> OUT=<dir> node packages/tab-web/scripts/e2e/mainnet.mjs all` (spends about 0.03 USDC from throwaway wallets); settle tx `0xf0a3c947b36eaf6a8c09a064454cded790c37a141fccb50821553cbfb34463a4`; DECISIONS.md D9 |
| Open debts collapse to fewer transfers (demo: 5 to 3) | LIVE | open group `tab-1h4j301v` from block 24357102 in the app, press "Preview the netting"; `packages/tab-core/test/debts.test.ts` |
| A wallet that cannot fund a batch is told so before signing | LIVE | `packages/tab-chain/test/preflight.test.ts` |
| Hostile and malformed input does not crash the reader or the app (zero-address group memo, hostile id, RPC down, contract wallet, wrong network, blocklisted recipient, bad forms) | LIVE | `npm test`; `TAB_WALLET_DIR=<dir> OUT=<dir> node packages/tab-web/scripts/e2e/harden.mjs` (read-only, 20 checks, needs the built app on :4173); DECISIONS.md D10 |
| A Memo transaction that is not Tab's is refused before any log scan | LIVE | `npm run verify -- 0x696f1765e068c962a1cb8a8e7d21f74ad2d67ff8d97f2103528d179d83c8b0ba` exits 1 with NOT A TAB TRANSACTION; `packages/tab-chain/test/verify.test.ts` |
| A settlement can be verified from a terminal with no wallet | LIVE | `npm run verify -- 0xf0a3c947b36eaf6a8c09a064454cded790c37a141fccb50821553cbfb34463a4` exits 0 with VERIFIED |
| An open group can be read from a terminal | LIVE | `npm run group -- tab-1h4j301v 24357102` |
| The app works under a sub-path | LIVE | build, serve `dist` under `/tab/`, run `BASE=http://127.0.0.1:<port>/tab node packages/tab-web/scripts/e2e/harden.mjs`; DECISIONS.md D11 |
| Landing page ships without viem (entry 119 kB gzip) | LIVE | `npm run build:web`, read the chunk sizes |
| Landing page Lighthouse 100/100/100/100, LCP 390 ms, CLS 0.01 (local, unthrottled) | LIVE | build, `npx vite preview`, run Lighthouse and a performance trace in Chrome DevTools on http://localhost:4173/; DECISIONS.md D11 |
| Hosted app at https://juicewrld998.github.io/tab/ | NOT LIVE | needs Pages switched on (Settings, Pages, Source: GitHub Actions); then `curl -I` the URL |
| npm packages `@tab/core`, `@tab/chain` | NOT LIVE | not published; DECISIONS.md D11 |
