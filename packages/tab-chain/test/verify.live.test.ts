import { describe, expect, it } from "vitest";
import { makePublicClient, verifyTx } from "../src";

/** Read-only, costs nothing. Run: LIVE=1 vitest run test/verify.live.test.ts */
const live = process.env.LIVE === "1";
const SETTLE_TX = "0x42a23d78ca8e4ee7a16975b27d5c18ab303edb67359412aadc5f5b184936eec8" as const;

describe.skipIf(!live)("live: verify the Phase 3 settle from the tx hash alone", () => {
  it("reproduces 3 legs, all confirmed, and rebuilds a squared group", async () => {
    const v = await verifyTx(makePublicClient(), SETTLE_TX);
    expect(v.legs).toHaveLength(3);
    expect(v.legs.every((l) => l.hashMatches && l.transferSeen)).toBe(true);
    expect(v.legs.every((l) => l.amount === 75_000n)).toBe(true);
    expect(v.memoIds).toHaveLength(1);
    expect(new Set(v.legs.map((l) => l.from)).size).toBe(1);
    expect(v.legs[0]!.from).toBe(v.signer);
    expect(v.ledger).not.toBeNull();
    expect(v.legsInLedger).toBe(3);
    expect(v.ledger!.rejected).toHaveLength(0);
    expect(v.ledger!.balances.size).toBe(0);
  }, 120_000);

  it("planted control: an unknown tx hash is refused", async () => {
    await expect(verifyTx(makePublicClient(), "0x1111111111111111111111111111111111111111111111111111111111111111")).rejects.toThrow();
  }, 60_000);
});
