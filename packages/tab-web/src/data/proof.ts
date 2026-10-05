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
