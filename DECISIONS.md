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
- Each USDC transfer emits **two** `Transfer` logs: one from the ERC-20 interface `0x3600…0000` and one from a system emitter `0xffff…fffE`-style address (`0xffffffffffffffffffffffffffffffffffffffff` prefix seen in the tx). Counting both would double every amount.
- Decision: the ledger reads **Memo events only** (they carry `memoId`, the call-data hash and our data). It never sums raw `Transfer` logs. The verify page matches a settle leg to its transfer by `callDataHash`.
