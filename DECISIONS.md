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
