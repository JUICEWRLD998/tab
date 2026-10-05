import { describe, expect, it } from "vitest";
import type { PublicClient } from "viem";
import { preflightSettle } from "../src/settle";

const A = "0x00000000000000000000000000000000000000a1" as const;
const B = "0x00000000000000000000000000000000000000b2" as const;
const C = "0x00000000000000000000000000000000000000c3" as const;

/** Fake client: only the calls preflightSettle makes. `blocked` addresses are blocklisted, `balance` is the signer's USDC. */
function fake(opts: { balance: bigint; blocked?: string[]; gas?: bigint }) {
  const calls: string[] = [];
  const client = {
    readContract: async (p: { functionName: string; args: readonly string[] }) => {
      calls.push(p.functionName);
      if (p.functionName === "isBlacklisted") return (opts.blocked ?? []).includes(p.args[0]!);
      if (p.functionName === "balanceOf") return opts.balance;
      throw new Error("unexpected call " + p.functionName);
    },
    getGasPrice: async () => 20_000_000_000n,
    estimateGas: async () => {
      calls.push("estimateGas");
      return opts.gas ?? 140_000n;
    },
  } as unknown as PublicClient;
  return { client, calls };
}
const legs = [
  { from: A, to: B, amount: 100_000n },
  { from: A, to: C, amount: 120_000n },
];

describe("preflightSettle", () => {
  it("planted control: a funded signer passes with a fee estimate", async () => {
    const { client } = fake({ balance: 1_000_000n });
    const p = await preflightSettle(client, A, "g", legs);
    expect(p.ok).toBe(true);
    expect(p.short).toBeUndefined();
    expect(p.feeUsdc).toBe((140_000n * 20_000_000_000n) / 10n ** 12n); // 2800 base units = 0.0028 USDC
  });
  it("a signer who cannot cover the legs is told so, and gas is never estimated (it would revert with no reason)", async () => {
    const { client, calls } = fake({ balance: 200_000n });
    const p = await preflightSettle(client, A, "g", legs);
    expect(p.ok).toBe(false);
    expect(p.short).toEqual({ balance: 200_000n, needed: 220_000n });
    expect(calls).not.toContain("estimateGas");
  });
  it("covers the legs but not the fee: short by the fee", async () => {
    const { client } = fake({ balance: 221_000n });
    const p = await preflightSettle(client, A, "g", legs);
    expect(p.ok).toBe(false);
    expect(p.short!.needed).toBe(220_000n + p.feeUsdc);
  });
  it("a blocklisted recipient is reported before anything else", async () => {
    const { client, calls } = fake({ balance: 1_000_000n, blocked: [C] });
    const p = await preflightSettle(client, A, "g", legs);
    expect(p.ok).toBe(false);
    expect(p.blocked).toEqual([C]);
    expect(calls).not.toContain("balanceOf");
  });
});
