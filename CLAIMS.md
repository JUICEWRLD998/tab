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
| Live URL | NOT LIVE | Phase 7 (deploy) |
