// End-to-end on Arc MAINNET through the real UI: create a group, log expenses from four wallets, settle, verify.
// Real transactions with throwaway wallets (a few tenths of a cent each). Usage:
//   TAB_WALLET_DIR=<dir> OUT=<screenshot dir> node scripts/e2e/mainnet.mjs [demo|settle|all]
// Expects the built app on BASE (default http://localhost:4173, `npm run build && npx vite preview`).
import { launch, sleep } from "./cdp.mjs";
import { installWallet } from "./wallet.mjs";

const BASE = process.env.BASE ?? "http://localhost:4173";
const OUT = process.env.OUT;
const MODE = process.argv[2] ?? "all";
const KEYS = { A: "deploy.json", B: "w2.json", C: "w3.json", D: "w4.json" };
const short = (a) => `${a.slice(0, 6)}…${a.slice(-4)}`;

const { cdp, close } = await launch();
const log = (...a) => console.log(new Date().toISOString().slice(11, 19), ...a);
const shot = async (name) => (OUT ? cdp.shot(`${OUT}/${name}.png`) : null);

try {
  await cdp.viewport(1280, 900);
  await cdp.media({ scheme: "dark" });
  const wallet = await installWallet(cdp, KEYS);

  const connectAs = async (who) => {
    await wallet.use(who);
    const me = wallet.address(who);
    await cdp.waitFor(`!!document.querySelector('[title="${me}"]')`, { label: `header shows ${who}` });
  };

  async function buildGroup(name) {
    await wallet.use("A");
    await cdp.goto(`${BASE}/#/new`);
    await cdp.waitFor(`document.querySelector('h1')?.innerText === 'Start a group'`);
    await cdp.clickText("Connect", { exact: false });
    await connectAs("A");
    await cdp.fill("Group name", name);
    await cdp.fill("Everyone else", ["B", "C", "D"].map((k) => wallet.address(k)).join("\n"));
    await cdp.waitFor(`document.body.innerText.includes('4 people')`);
    await shot(`new-${name.replace(/\W+/g, "-")}`);
    await cdp.clickText("Create group");
    await cdp.waitFor(`location.hash.indexOf('#/g/') === 0`, { timeout: 90000, label: "navigate to the new group" });
    const hash = await cdp.eval("location.hash");
    const id = decodeURIComponent(hash.split("?")[0].split("/")[2]);
    const from = hash.split("from=")[1];
    log("created", name, id, "block", from);
    await cdp.waitFor(`document.querySelector('h1')?.innerText === ${JSON.stringify(name)}`, { timeout: 60000, label: "group page loaded" });

    const logAs = async (who, label, amount, uncheck = []) => {
      await connectAs(who);
      await cdp.fill("What was it for", label);
      await cdp.fill("Amount you paid", amount);
      for (const k of uncheck) {
        const want = k === who ? "You" : short(wallet.address(k));
        const hit = await cdp.eval(`(() => { const l = [...document.querySelectorAll('label')].find((x) => x.querySelector('input[type=checkbox]') && x.innerText.trim().startsWith(${JSON.stringify(want)})); if (!l) return false; l.click(); return true; })()`);
        if (!hit) throw new Error(`no checkbox for ${k}`);
      }
      await cdp.clickText("Log expense");
      await cdp.waitFor(`document.body.innerText.includes(${JSON.stringify(label)}) && document.body.innerText.includes('Logged and final')`, { timeout: 120000, label: `expense ${label} visible` });
      log("logged", label, "by", who);
    };
    await logAs("A", "Dinner at Alfama", "0.40");
    await logAs("B", "Taxi to the hotel", "0.24");
    await logAs("C", "Museum tickets", "0.30", ["B"]);
    await logAs("D", "Coffee and pastries", "0.08", ["A", "C"]);
    await cdp.waitFor(`document.body.innerText.includes('5 debts') && document.body.innerText.includes('3 transfers')`, { timeout: 60000, label: "5 debts -> 3 transfers" });
    await shot(`group-${name.replace(/\W+/g, "-")}`);
    return { id, from, url: `${BASE}/${hash}` };
  }

  const results = { sent: wallet.state.sent };

  if (MODE === "demo" || MODE === "all") {
    results.demo = await buildGroup("Lisbon weekend");
    log("LISBON GROUP", results.demo.id, results.demo.from);
  }

  if (MODE === "settle" || MODE === "all") {
    // GROUP_ID and GROUP_FROM reuse a group a previous run already built, so a failed run does not pay for it twice.
    const g = process.env.GROUP_ID ? { id: process.env.GROUP_ID, from: process.env.GROUP_FROM } : await buildGroup("E2E check");
    results.e2e = g;
    await wallet.use("D");
    await cdp.goto(`${BASE}/#/g/${encodeURIComponent(g.id)}/settle?from=${g.from}`);
    await cdp.waitFor(`document.querySelector('h1')?.innerText === 'Settle up'`, { timeout: 90000 });
    if (!(await cdp.eval(`!!document.querySelector('[title^="0x"]')`))) await cdp.clickText("Connect");
    await connectAs("D");
    await cdp.waitFor(`document.querySelector('h1')?.innerText === 'Settle up'`, { timeout: 90000 });
    await cdp.waitFor(`document.body.innerText.includes('Settle my 3 transfers')`, { timeout: 60000 });
    await cdp.waitFor(`document.body.innerText.includes('Network fee about')`, { timeout: 60000, label: "fee estimate shown before signing" });
    await shot("settle-before");
    // A rejected signature must send nothing and leave the page usable.
    wallet.rejectNext();
    const sentBefore = wallet.state.sent.length;
    await cdp.clickText("Settle my 3 transfers");
    await cdp.waitFor(`document.body.innerText.includes('Signature rejected. Nothing was sent.')`, { timeout: 60000, label: "rejection message" });
    if (wallet.state.sent.length !== sentBefore) throw new Error("a rejected signature still sent a transaction");
    await shot("settle-rejected");
    log("rejection handled, nothing sent");
    await cdp.clickText("Try again");
    await cdp.waitFor(`document.body.innerText.includes('Settled and final')`, { timeout: 180000, label: "settled" });
    await sleep(600);
    await shot("settle-done");
    const settleTx = wallet.state.sent.at(-1).hash;
    results.settleTx = settleTx;
    log("SETTLED", settleTx);
    await cdp.clickText("Verify this settlement");
    await cdp.waitFor(`document.body.innerText.includes('Verified:')`, { timeout: 120000, label: "verdict Verified" });
    await sleep(600);
    await shot("verify-done");
    const verdict = await cdp.eval("document.querySelector('[aria-labelledby=verdict-h] h2')?.innerText");
    log("VERDICT", verdict);
    results.verdict = verdict;
  }

  console.log(JSON.stringify({ ...results, sent: wallet.state.sent }, null, 2));
} catch (e) {
  console.error("FAILED:", e.message);
  if (OUT) await cdp.shot(`${OUT}/FAILED.png`).catch(() => {});
  process.exitCode = 1;
} finally {
  close();
}
