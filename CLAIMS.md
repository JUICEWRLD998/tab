# CLAIMS

Every README claim, mapped to a command or tx hash that reproduces it. Status words: LIVE / NEXT / NOT LIVE.

| Claim | Status | Reproduce |
|---|---|---|
| A real `Memo.memo` tx emits a decodable `Memo` event | LIVE | tx `0x696f1765e068c962a1cb8a8e7d21f74ad2d67ff8d97f2103528d179d83c8b0ba`; `cast receipt <tx> --rpc-url https://rpc.mainnet.arc.io`; decoded in `packages/tab-core/test/memo.test.ts` |
| One signature settles 3 legs, each with its own memo, sender preserved | LIVE | tx `0x42a23d78ca8e4ee7a16975b27d5c18ab303edb67359412aadc5f5b184936eec8` (DECISIONS.md D7) |
| The ledger rebuilds from chain data alone | LIVE | `LIVE=1 TAB_WALLET_DIR=<dir> npx vitest run packages/tab-chain/test/live.test.ts` (needs a funded wallet) |
| Outsiders cannot forge expenses or settle claims | LIVE | `packages/tab-core/test/ledger.test.ts` (planted attacker cases) |
| Netting gives at most N-1 transfers and zeroes every balance | LIVE | `packages/tab-core/test/netting.test.ts` (300 seeded cases) |
| Verify page, web app | NOT LIVE | Phase 4 and 5 |
