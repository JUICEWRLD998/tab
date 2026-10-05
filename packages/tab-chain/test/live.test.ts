import { readFileSync } from "node:fs";
import { createWalletClient, http } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { describe, expect, it } from "vitest";
import { buildLedger, formatUsdc, netTransfers, parseUsdc } from "@tab/core";
import { arcMainnet, assertEoa, createGroup, isBlocklisted, legsFor, logExpense, makePublicClient, planSettlement, preflightSettle, readLedger, settle } from "../src";

/** Live smoke test against Arc mainnet. Costs about 0.005 USDC. Run: LIVE=1 TAB_WALLET_DIR=<dir> vitest run test/live.test.ts */
const live = process.env.LIVE === "1";
const dir = process.env.TAB_WALLET_DIR ?? "";
const key = (f: string) => JSON.parse(readFileSync(`${dir}/${f}`, "utf8")).data[0].private_key as `0x${string}`;

describe.skipIf(!live)("live: Arc mainnet", () => {
  const pub = makePublicClient();
  const mk = (f: string) => {
    const account = privateKeyToAccount(key(f));
    return createWalletClient({ account, chain: arcMainnet, transport: http(arcMainnet.rpcUrls.default.http[0], { retryCount: 5, retryDelay: 500, timeout: 20_000 }) });
  };

  it("guards: EOA passes, USDC contract is rejected, a clean address is not blocklisted", async () => {
    const a = mk("deploy.json").account.address.toLowerCase() as `0x${string}`;
    await assertEoa(pub, a);
    await expect(assertEoa(pub, "0x522faf9a91c41c443c66765030741e4aace147d0")).rejects.toThrow(/cannot call Memo/);
    expect(await isBlocklisted(pub, a)).toBe(false);
  }, 60_000);

  it("creates a group, logs two expenses, reads them back, rebuilds balances", async () => {
    const A = mk("deploy.json"), B = mk("w2.json"), C = mk("w3.json");
    const addrs = [A, B, C].map((w) => w.account.address.toLowerCase() as `0x${string}`);
    const groupId = `smoke-${Date.now()}`;
    const created = await createGroup(pub, A, groupId, "Smoke", addrs);
    const e1 = await logExpense(pub, A, groupId, { amount: parseUsdc("0.30"), participants: addrs, label: "lunch" });
    const e2 = await logExpense(pub, B, groupId, { amount: parseUsdc("0.09"), participants: addrs, label: "taxi" });
    console.log("LIVE", groupId, created.hash, e1.hash, e2.hash);

    const ledger = (await readLedger(pub, groupId, { fromBlock: created.blockNumber - 1n, minHead: e2.blockNumber }))!;
    expect(ledger).not.toBeNull();
    expect(ledger.expenses).toHaveLength(2);
    expect(ledger.rejected).toHaveLength(0);
    expect(ledger.balances.get(addrs[0]!)).toBe(parseUsdc("0.30") - parseUsdc("0.13"));
    expect(ledger.balances.get(addrs[2]!)).toBe(-parseUsdc("0.13"));
    const t = netTransfers(ledger.balances);
    expect(t.length).toBe(2);
    console.log("LIVE transfers", t.map((x) => `${x.from.slice(0, 8)}->${x.to.slice(0, 8)} ${formatUsdc(x.amount)}`));
    expect(buildLedger(groupId, [])).toBeNull();
  }, 120_000);

  it("settles: one debtor, three creditors, one signature, per-leg memos, group ends square", async () => {
    const A = mk("deploy.json"), B = mk("w2.json"), C = mk("w3.json"), D = mk("w4.json");
    const addrs = [A, B, C, D].map((w) => w.account.address.toLowerCase() as `0x${string}`);
    const groupId = `settle-${Date.now()}`;
    const created = await createGroup(pub, A, groupId, "Settle", addrs);
    let last = created.blockNumber;
    for (const w of [B, C, D]) last = (await logExpense(pub, w, groupId, { amount: parseUsdc("0.30"), participants: addrs, label: "round" })).blockNumber;

    const before = (await readLedger(pub, groupId, { fromBlock: created.blockNumber - 1n, minHead: last }))!;
    const plan = planSettlement(before);
    const legs = legsFor(plan, addrs[0]!);
    expect(plan).toHaveLength(3);
    expect(legs).toHaveLength(3);

    const pf = await preflightSettle(pub, addrs[0]!, groupId, legs);
    expect(pf.ok).toBe(true);
    console.log("LIVE preflight gas", pf.gas, "fee USDC", formatUsdc(pf.feeUsdc));

    const tx = await settle(pub, A, groupId, legs);
    console.log("LIVE SETTLE", groupId, tx.hash);
    const after = (await readLedger(pub, groupId, { fromBlock: created.blockNumber - 1n, minHead: tx.blockNumber }))!;
    expect(after.settled).toHaveLength(3);
    expect(after.rejected).toHaveLength(0);
    expect(after.balances.size).toBe(0);
  }, 180_000);
});
