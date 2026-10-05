import raw from "./proof.json";

/** The Phase 3 mainnet settle, captured by scripts/capture-proof.ts through the same verifyTx the Verify page runs. */
export const proof = {
  hash: raw.hash as `0x${string}`,
  blockNumber: BigInt(raw.blockNumber),
  signer: raw.signer as `0x${string}`,
  groupName: raw.groupName,
  members: raw.members,
  expenses: raw.expenses,
  createdBlock: raw.createdBlock ? BigInt(raw.createdBlock) : undefined,
  legs: raw.legs.map((l) => ({ from: l.from as `0x${string}`, to: l.to as `0x${string}`, amount: BigInt(l.amount) })),
  capturedAt: raw.capturedAt,
};

/** A real, unsettled group on Arc mainnet, built through this UI (scripts/e2e/mainnet.mjs): 5 open debts that net to 3 transfers, all owed by one wallet. Anyone can open it and preview the netting. */
export const demo = { id: "tab-1h4j301v", from: 24357102n };
