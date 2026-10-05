# DECISIONS

Dated, with the tx hash or command that settled each one.

## 2026-10-05 Phase 0: on-chain proof (Arc mainnet, chain id 5042)

Deploy wallet (throwaway, key held off-repo): `0xe874C32569a28B2D0bCa07Ef25F0ec0B68BeeDD0`, funded with 0.9605 USDC.

### D1. A real `Memo.memo` tx emits a decodable Memo event (closes the "UNVERIFIED" item)
- Tx: `0x696f1765e068c962a1cb8a8e7d21f74ad2d67ff8d97f2103528d179d83c8b0ba` (block 0x1738962, status 1, 55,959 gas ≈ 0.0011 USDC at the 20 gwei floor).
- Call: `Memo.memo(USDC, transfer(self, 0), keccak("tab:spike"), 0x1234)` on `0x5294E9927c3306DcBaDb03fe70b92e01cCede505`.
- Logs, in order: `BeforeMemo(uint256 index)` topic0 `0xb252e055…1501`; USDC `Transfer(self, self, 0)`; then
  `Memo(address indexed sender, address indexed target, bytes32 indexed memoId, bytes32 callDataHash, bytes memoData, uint256 index)`
  topic0 `0xeb15ee720798341c37739df41be53acfbbf70ae6802dade35457beec6e47a5e4`.
- Signature checked with `cast sig-event` (matches topic0) and by decoding the data: word0 equals `keccak(calldata)` of the target call, word1 is the offset to `memoData`, word2 is the index (0x318), then the bytes.
- Parameter names for the last three fields are inferred from the data layout, not from published source. The types and order are proven by the topic0 hash.
- Branch taken: **YES**. Expenses log through Memo. No logger contract needed.

### D2. `Multicall3From.aggregate3` preserves `msg.sender` through Memo to USDC
- Tx: `0x788a3abbe97f603fdbd5d561d4d034e6022d6ae6a5e8c1ce7c9ed5d03c3f26e0` (status 1, 155,662 gas ≈ 0.0031 USDC).
- Two legs, each `Memo.memo(USDC, transfer(to, 0.01), id, data)`. Both recipients hold exactly 10000 base units afterwards.
- Every `Transfer.from` and every `Memo.sender` is the EOA. Sender is preserved end to end.
- Note: one signature moves value **only from the signer**. Settle legs are therefore the signer's own debts. See D4.

### D3. Which log the indexer reads
- Each USDC transfer emits **two** `Transfer` logs: one from the ERC-20 interface `0x3600…0000` (value in 6 decimals) and one from the system emitter `0xfffffffffffffffffffffffffffffffffffffffe` (value in 18 decimals: 0.01 USDC logs as `0x2386f26fc10000` = 1e16). Counting both would double every amount and mix decimals.
- Decision: the ledger reads **Memo events only** (they carry `memoId`, the call-data hash and our data). It never sums raw `Transfer` logs. The verify page matches a settle leg to its transfer by `callDataHash` and reads amounts from the 6-decimal `0x3600…0000` log only.

### D4. Settlement shape: each debtor signs their own batch
- D2 shows one signature moves value only from the signer. A single signature therefore cannot pay the whole group.
- Decision: netting produces the group-wide transfer list (N debts become at most N-1 transfers). Each debtor then signs one `aggregate3` batch holding **their own** legs. A debtor who owes several creditors still pays them all in one signature.
- The demo script is cut around one debtor with 2+ legs. The settle screen shows the whole group plan and marks each leg as paid or open, rebuilt from Memo events.

### D5. Read-after-write lag and log range (measured 2026-10-05)
- `eth_getLogs` rejects ranges over 10,000 blocks (`-32012 requested range too large`; 9,999 passed). The reader chunks at 5,000.
- The load-balanced RPC can serve a head **behind a receipt you just got**. A live test read two expenses right after writing them and saw one. Re-reading 30 s later saw both. The reader takes `minHead` and polls until the head reaches the last written block.
- Live smoke test passed: group `smoke-1791182815935`, create `0x1549b149…fb95`, expenses `0x7443433b…abba` and `0xb2290abc…756c`, rebuilt balances matched.

### D6. Memo logs are public, so the ledger enforces trust rules
Anyone can post a Memo under any `memoId`. `buildLedger` counts a memo only if: the first group memo defines members (creator must be a member); the sender is a member; an expense has `payer == sender` and member participants; a settle leg has `from == sender`, target USDC, and `callDataHash == keccak(USDC.transfer(to, amount))`. Each rule has a planted attacker test in `packages/tab-core/test/ledger.test.ts`.

### D7. Phase 3 exit: mainnet settle, 3 legs, per-leg memo (2026-10-05)
- Group `settle-1791182997797`: four members, three of them each paid 0.30 split four ways; the fourth (the deploy wallet) owes three creditors 0.075 each.
- Settle tx: `0x42a23d78ca8e4ee7a16975b27d5c18ab303edb67359412aadc5f5b184936eec8` (block 24350357, status 1, 140,903 gas ≈ 0.0028 USDC).
- Checked from a raw receipt (`cast receipt`, not our code): 3 `Memo` logs under one memoId, 3 USDC transfers of 75000 base units, and every `Transfer.from` is the one signer.
- Re-reading the group with the ledger builder shows 3 settled legs, 0 rejected memos, and every balance at zero.
- A second identical run exists: group `settle-1791183025943`, tx `0x048927dee734bb6386a16c0bc0c2db185ed6f841e32e3f386aff465d72723ccf`.
- The wallet is square after each run only because the creditors are my own throwaway wallets. Real value moved between wallets I hold; nothing left them.

### D8. Verify from a tx hash alone (Phase 4, 2026-10-05)
- `memoId = keccak("tab:" + groupId)` is one-way, so a tx hash gives a memoId, not a group id. The verifier works on the memoId: `verifyTx` reads the receipt, decodes every `Memo` log, and rebuilds the group by scanning `getLogs` on that memoId.
- Per settle leg it checks two things from the receipt itself: `callDataHash == keccak(USDC.transfer(to, amount))`, and that a 6-decimal USDC `Transfer(from, to, amount)` log exists in the same tx. One transfer log satisfies one leg only. The 18-decimal system emitter is ignored (D3).
- The creation memo may be older than the tx. Scan starts 40,000 blocks back (about 6 hours at the measured ~0.5 s block time) and walks back in 40,000-block steps up to 400,000 if the group is still missing. A caller can pin a start block instead. A share link from the app carries the creation block, so it needs no walk.
- RPC: 4 parallel `getLogs` chunks hit `-32005 rate limit exceeded` on mainnet. Parallelism is now 2 and `-32005` is retried with backoff.
- Exit check (LIVE, read-only): `verifyTx` on the Phase 3 tx `0x42a23d78…eec8` returns 3 legs, all hash-matched and transfer-confirmed, 75000 base units each, one signer, 3 legs accepted by the rebuilt ledger, 0 rejected, all balances zero. Test: `packages/tab-chain/test/verify.live.test.ts`. Planted controls: no transfer, wrong hash, double-claimed transfer, 18-decimal twin, foreign emitter (`verify.test.ts`).

### D9. Phase 5: the web app (2026-10-05)
- **Static app, no backend.** Vite + React + CSS Modules + `motion/react`, hash routes (`#/g/<id>?from=<block>`, `#/g/<id>/settle`, `#/v/<tx>`). A group link carries its creation block so a reader scans one range; without it the reader walks back from the head (D8).
- **Real browser wallet only for writes.** `window.ethereum` (EIP-1193), switch or add chain 5042, `assertEoa` before any write. Account or network changes inside the wallet are followed silently, so forms do not flip to "Connect" while the new session resolves.
- **Look.** Subject vocabulary is the tab and the paper receipt: warm thermal paper on a blue-black slate ground, punched edges, mono figures, a rubber-stamp "Final". One accent (mint, hue 168) is the call-to-action colour. Support hues have jobs: amber is an open debt, sky is money owed to you and links, coral is error. Both themes designed. `scripts/palette.mjs` reads `tokens.css` and measures every pair (all pass in both themes): text contrast, dE76 between role hues at least 38, accent chroma at least 5x surface chroma, surfaces chroma 0.009 to 0.026.
- **Signature moment (Settle).** Beats: t=0 the open debts are struck through, staggered 40 ms; t=320 ms the rows dim and shift toward the receipt and the net transfers print line by line; t about 1100 ms "5 debts → 3 transfers" is on screen as text. After the real signature a rubber stamp lands on the receipt (the one overshoot, 1.5x down to 0.96x then 1x, because a real stamp does that). It never blocks input. Reduced motion lands on the same end state. Filmstrip looked at; not a GPU or phone measurement.
- **Honesty rules in the UI.** The preview of the netting works with no wallet. The batch is per debtor (D4), so the page says who signs which transfers. A receipt is stamped "Final" only for what the wallet actually paid. Fee and blocklist and balance are checked before the wallet prompt (`preflightSettle` now reads the signer's USDC balance first: a batch the signer cannot fund used to fail inside `estimateGas` with "execution reverted for an unknown reason").
- **Bugs the browser found, not the type checker** (each fixed and re-driven): a stamp placed over the tx hash; the connect button disabled when no wallet extension exists; the header 2 px wider than a 320 px screen; the group read returning "no group found" right after creation because the RPC head lagged the receipt (the group reader now waits for the link's creation block); an expense form that kept the previous expense's participant picks; the wallet flipping to "connecting" on every account switch; a hidden stamp adding 1 px of horizontal scroll.
- **End-to-end on mainnet through the real UI** (`packages/tab-web/scripts/e2e/mainnet.mjs`, throwaway wallets, a stand-in wallet bridged to Node that signs and sends real transactions): create group, 4 expenses from 4 wallets, preview, a rejected signature (nothing sent), the settle, verify. Demo group `tab-1h4j301v` (created at block 24357102, left unsettled): 5 open debts net to 3 transfers, all owed by one wallet. Settle run: group `tab-1o6g004y`, settle tx `0xf0a3c947b36eaf6a8c09a064454cded790c37a141fccb50821553cbfb34463a4` (block 24358200, 3 legs, one signature); the Verify page returned "Verified: 3 transfers, one signature".
- **Machine checks, with their limits.** axe-core (serious or critical): 0 on home, new, group, settle and verify-empty at 375 and 1280 in both themes; verify had 1 (a scrollable `pre` without keyboard focus), fixed. No horizontal overflow at 320, 375, 414, 768, 1024, 1280, 1440, 1920 (per-element probe with a planted 400 px control). `ui-score.mjs` (controls passed): home 75, new 72, group 71 with one auto-fail tell, settle 63 before the ghost-line fix. Known misreads, named so they are not "fixed" by gaming: the scorer counts the deep blue-black ground as an accent (44% of the viewport) and counts text-aligned-centre buttons as a centred hero; it has no macrostructure stamp because Hallmark was not used.
- **Not done in this phase (named).** The three-direction prototype exploration was written, not rendered as three prototypes. Hallmark's custom-theme route and the 60-gate slop test were not run. No blind critic, no `better-interface` or `ecc:design-system` pass. No Lighthouse or LCP trace. Images: the receipt is the R1 image on home, settle and verify; group has none (data fills the viewport). The browser console shows RPC 429 lines on the verify page while it retries (the retries succeed).

### D10. Phase 6: hardening (2026-10-05)
- **Bugs found by trying to break it, each now fixed with a test that failed first.**
  - A group memo that lists `address(0)` made `buildLedger` throw, so one hostile memo under a guessable id could crash the reader for that group. It is now rejected with a reason (`packages/tab-core/test/harden.test.ts`).
  - `settle()` reported a balance shortfall as "blocklisted address in batch" with an empty list. It now says what is wrong (`preflightMessage`).
  - The verify page, given a real `Memo` transaction that is not Tab's, started a 400,000-block walk and ended in an RPC rate-limit error. `verifyTx` now throws `NotTabTxError` before any log scan, and the page says "Not a Tab transaction".
  - With the RPC down the group page showed "Reading the chain" for more than 90 seconds, because viem retried inside `withRetry`. The retry budget is now 2 transport retries and 5 attempts, so it fails in about 10 to 20 seconds with "Could not reach the Arc RPC" and a Try again button.
  - The zero address pasted into the member list got a raw error from the encoder. The form now refuses it in words.
  - A wallet that refuses to switch to Arc was told "Signature rejected." It is now told to switch to Arc (chain 5042).
- **Group sizes.** 2 people, 20 people with 300 expenses, a payer who is the only participant, the same payer logging 50 times, one base unit across 20 people, 10^18 base units: balances sum to zero, at most N-1 transfers, every balance zero after applying them.
- **Browser drive, read-only** (`packages/tab-web/scripts/e2e/harden.mjs`, 20 checks against mainnet, each negative case after a positive control on the same page): RPC down and recovery (the app's own RPC requests are refused through the DevTools Fetch domain), unknown group, hostile group id (`<img onerror>` shows as text), unknown route, a real Memo transaction that is not Tab's, a missing transaction, a non-hash, a contract wallet (the Multicall3From address as the connected account, real `eth_getCode`), wrong network that will not switch, one-person group, zero address, a mistyped address, over the member cap, and a blocklisted recipient (the `isBlacklisted` call answered true by interception). No transaction was sent. No uncaught exception.
- **Wallet code review (inline, no key handling).** The app never reads or stores a key. It calls `eth_requestAccounts`, switches or adds chain 5042, checks `eth_getCode`, and asks the wallet to send to one of two constants (the `Memo` and `Multicall3From` addresses) with calldata it built itself. No address from a URL reaches a transaction `to` field. The group id is hashed, and `?from=` is parsed as digits and bounded.
- **Not covered.** A crafted link with `?from=0` makes the reader scan from block 0, which is slow and heavy on the RPC. It only hurts the person who opens it, and the progress line says what it is doing, but there is no cap. A real wallet extension was never used: the wallet in these drives is a stand-in that signs with throwaway keys.

### D11. Phase 7: packaging (2026-10-05)
- **README written for a reader who has never heard of Tab, and for an automated reviewer.** The top answers what it is, what it uses Arc for (by contract address), the status of every part in one vocabulary (LIVE, NEXT, NOT LIVE), and how to check the main claim in two commands without a wallet (`npm run verify`, `npm run group`). Every number in it comes from a receipt or a test run in this session. `llms.txt` carries the same facts in a short form.
- **Terminal tools** (`scripts/verify-tx.ts`, `scripts/group.ts`) use the same `verifyTx` and `findLedger` as the app and exit non-zero when a check fails, so a script or a reviewer can use them as a test.
- **Hosting.** The app is static with relative asset paths and hash routes, so it works under a sub-path. It was driven through a server that only serves `/tab/` and the 20 hardening checks passed. The default URL is GitHub Pages (`https://juicewrld998.github.io/tab/`), published by `.github/workflows/pages.yml`. GitHub Pages needs a one-time switch in the repository settings (Pages, Source: GitHub Actions), which only the repository owner can make. Until then the README says NOT LIVE.
- **Bundle.** The landing page no longer loads viem: the chain screens and the wallet code load on demand. Entry chunk 213 kB to 119 kB gzip. `@tab/core/money` and `@tab/chain/explorer` are subpath exports so the landing page can import a formatter and a link helper without the whole barrel.
- **Wording audit.** The pre-submit grep for `mock|fake|dummy|lorem|0x0000|picsum|randomuser|example.com` found test helpers named `fake` and a browser stand-in named `MOCK`, which a quick reader could take for a mock-up. They are renamed (`scripted`, `INJECTED`). The remaining `0x0000…` hits are the zero-address checks and the on-chain fixture, which are the point of those lines.
- **Packages are not published.** Publishing needs an npm account and a scope the author controls. The `@tab` scope may belong to someone else, which is unchecked. Both libraries carry metadata, a license and a README so that publishing is one command later.
