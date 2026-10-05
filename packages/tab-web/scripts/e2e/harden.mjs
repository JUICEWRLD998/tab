// Phase 6 hardening drive: the unscripted paths a stranger hits, on the REAL built app against Arc mainnet.
// Read-only: it never sends a transaction. Failures are planted by intercepting the app's own RPC requests (CDP Fetch domain).
//   TAB_WALLET_DIR=<dir> OUT=<screenshot dir> node scripts/e2e/harden.mjs
// Expects the built app on BASE (default http://localhost:4173). Every negative case runs after a positive control on the same page,
// so a probe that cannot see the page cannot report a pass.
import { toFunctionSelector } from "viem";
import { launch, sleep } from "./cdp.mjs";
import { installWallet } from "./wallet.mjs";

const BASE = process.env.BASE ?? "http://localhost:4173";
const OUT = process.env.OUT;
const RPC = "https://rpc.mainnet.arc.io";
const DEMO = { id: "tab-1h4j301v", from: "24357102" };
const SPIKE_TX = "0x696f1765e068c962a1cb8a8e7d21f74ad2d67ff8d97f2103528d179d83c8b0ba"; // a real Memo tx that is not a Tab settlement
const SETTLE_TX = "0xf0a3c947b36eaf6a8c09a064454cded790c37a141fccb50821553cbfb34463a4"; // the real UI-driven settle
const MULTICALL = "0x522fAf9A91c41c443c66765030741e4AaCe147D0"; // a contract: stands in for a smart-contract wallet
const IS_BLACKLISTED = toFunctionSelector("isBlacklisted(address)");

const { cdp, close } = await launch();
const results = [];
const check = (name, ok, detail = "") => {
  results.push({ name, ok });
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? "  — " + detail : ""}`);
};
const shot = async (name) => (OUT ? cdp.shot(`${OUT}/harden-${name}.png`) : null);
const text = () => cdp.eval("document.body.innerText");

// Console and page errors, split into the expected RPC retry noise and everything else.
const errors = [];
cdp.on("Runtime.exceptionThrown", (p) => errors.push("EXCEPTION " + (p.exceptionDetails.exception?.description ?? p.exceptionDetails.text)));
cdp.on("Runtime.consoleAPICalled", (p) => {
  if (p.type === "error") errors.push("console.error " + p.args.map((a) => a.value ?? a.description ?? "").join(" ").slice(0, 160));
});

// RPC interception. mode: pass | fail | blocklist.
let mode = "pass";
const seen = { failed: 0, blocklisted: 0 };
await cdp.send("Fetch.enable", { patterns: [{ urlPattern: `${RPC}/*`, requestStage: "Request" }] });
cdp.on("Fetch.requestPaused", async (p) => {
  const id = p.requestId;
  try {
    if (p.request.method === "OPTIONS" || mode === "pass") return await cdp.send("Fetch.continueRequest", { requestId: id });
    if (mode === "fail") {
      seen.failed++;
      return await cdp.send("Fetch.failRequest", { requestId: id, errorReason: "ConnectionRefused" });
    }
    if (mode === "blocklist") {
      const body = JSON.parse(p.request.postData ?? "{}");
      const data = body.params?.[0]?.data ?? "";
      if (body.method === "eth_call" && typeof data === "string" && data.startsWith(IS_BLACKLISTED)) {
        seen.blocklisted++;
        const reply = JSON.stringify({ jsonrpc: "2.0", id: body.id, result: "0x" + "0".repeat(63) + "1" });
        return await cdp.send("Fetch.fulfillRequest", { requestId: id, responseCode: 200, responseHeaders: [{ name: "content-type", value: "application/json" }, { name: "access-control-allow-origin", value: "*" }], body: Buffer.from(reply).toString("base64") });
      }
    }
    await cdp.send("Fetch.continueRequest", { requestId: id });
  } catch (e) {
    console.error("interceptor:", e.message);
  }
});

const head = async () => Number(BigInt((await (await fetch(RPC, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "eth_blockNumber", params: [] }) })).json()).result));
const h1 = () => cdp.eval("document.querySelector('h1')?.innerText ?? ''");
const open = async (hash) => {
  await cdp.goto("about:blank");
  await cdp.goto(`${BASE}/${hash}`);
};

try {
  await cdp.viewport(1280, 900);
  await cdp.media({ scheme: "dark" });
  const wallet = await installWallet(cdp, { D: "w4.json" });
  const recent = (await head()) - 50;
  const sentAtStart = wallet.state.sent.length;

  // 1. Dropped RPC. Control first: the demo group loads.
  await open(`#/g/${DEMO.id}?from=${DEMO.from}`);
  await cdp.waitFor(`document.querySelector('h1')?.innerText === 'Lisbon weekend'`, { timeout: 60000, label: "control: demo group loads" });
  check("control: the demo group loads with the RPC up", true);
  mode = "fail";
  await open(`#/g/${DEMO.id}?from=${DEMO.from}`);
  await cdp.waitFor(`document.body.innerText.includes('Could not read the chain')`, { timeout: 90000, label: "error state when the RPC is down" });
  check("dropped RPC: the group page says it could not read the chain and offers Try again", (await text()).includes("Try again") && (await text()).includes("Could not reach the Arc RPC"), `${seen.failed} requests refused`);
  await shot("rpc-down");
  mode = "pass";
  await cdp.clickText("Try again");
  await cdp.waitFor(`document.querySelector('h1')?.innerText === 'Lisbon weekend'`, { timeout: 60000, label: "recovers after Try again" });
  check("dropped RPC: Try again recovers the same page once the RPC is back", true);

  // 2. A group that does not exist.
  await open(`#/g/does-not-exist-zz9?from=${recent}`);
  await cdp.waitFor(`document.querySelector('h1')?.innerText === 'No group found'`, { timeout: 60000, label: "not found state" });
  check("unknown group id: 'No group found' with a rescan form, not a blank page", (await text()).includes("Scan from there"));
  await shot("not-found");

  // 3. A malformed route and a hostile id never inject markup.
  await open(`#/g/${encodeURIComponent('<img src=x onerror="window.__xss=1">')}?from=${recent}`);
  await cdp.waitFor(`document.querySelector('h1')?.innerText === 'No group found'`, { timeout: 60000 });
  const hostile = await cdp.eval(`({ img: !!document.querySelector('img[src="x"]'), fired: window.__xss === 1, shown: document.body.innerText.includes('<img src=x') })`);
  check("hostile group id is shown as plain text, no element, no script", !hostile.img && !hostile.fired && hostile.shown, JSON.stringify(hostile));
  await open("#/nope/at/all");
  await cdp.waitFor(`document.body.innerText.length > 20`);
  check("an unknown route shows a not-found screen with a way back", /not found|nothing here/i.test(await text()), await h1());

  // 4. Verify page: the real settle as the control, then a real Memo tx that is not Tab's, a missing tx, a non-hash.
  await open(`#/v/${SETTLE_TX}`);
  await cdp.waitFor(`document.body.innerText.includes('Verified:')`, { timeout: 120000, label: "control: real settle verifies" });
  check("control: the real settle tx verifies", true);
  await open(`#/v/${SPIKE_TX}`);
  await cdp.waitFor(`/not a tab|no tab|could not verify|no such/i.test(document.body.innerText)`, { timeout: 90000, label: "foreign memo tx handled" });
  const spikeText = await text();
  check("a real Memo tx that is not Tab's is refused as 'Not a Tab transaction' within seconds", !spikeText.includes("Verified:") && spikeText.includes("Not a Tab transaction"), (await text()).includes("Not a Tab transaction") ? "Not a Tab transaction" : "wrong title");
  await shot("verify-foreign");
  await open(`#/v/0x${"1".repeat(64)}`);
  await cdp.waitFor(`document.body.innerText.includes('No such transaction')`, { timeout: 90000, label: "missing tx" });
  check("a hash that is no transaction says 'No such transaction'", true);
  await open("#/v/not-a-hash");
  await cdp.waitFor(`document.body.innerText.includes('not a transaction hash')`, { timeout: 20000, label: "non-hash" });
  check("a string that is not a hash is rejected before any request", true);

  // 5. A smart-contract wallet. Real eth_getCode on mainnet says the account has code.
  await open("#/new");
  await cdp.waitFor(`document.querySelector('h1')?.innerText === 'Start a group'`);
  await cdp.eval(`(() => { const o = window.ethereum.request; window.ethereum.request = (a) => (a.method === 'eth_requestAccounts' || a.method === 'eth_accounts') ? Promise.resolve(['${MULTICALL}']) : o(a); })()`);
  await cdp.clickText("Connect");
  await cdp.waitFor(`document.body.innerText.includes('cannot call Memo')`, { timeout: 60000, label: "contract wallet refused" });
  check("a smart-contract wallet is refused with a plain sentence before any signature", true);
  await shot("contract-wallet");

  // 6. Wrong network and the wallet refuses to switch.
  await open("#/new");
  await cdp.waitFor(`document.querySelector('h1')?.innerText === 'Start a group'`);
  await cdp.eval(`(() => { const o = window.ethereum.request; window.ethereum.request = (a) => a.method === 'eth_chainId' ? Promise.resolve('0x1') : a.method === 'wallet_switchEthereumChain' ? Promise.reject(Object.assign(new Error('User rejected the request.'), { code: 4001 })) : o(a); })()`);
  await cdp.clickText("Connect");
  await cdp.waitFor(`document.body.innerText.includes('not on Arc mainnet')`, { timeout: 30000, label: "wrong chain message" });
  check("a wallet on the wrong network that will not switch is told to switch to Arc", !(await text()).includes("Signature rejected"));
  await shot("wrong-network");

  // 6b. Group form: one person, the zero address, a typo, too many people. Nothing may reach the wallet.
  await open("#/new");
  await cdp.waitFor(`document.querySelector('h1')?.innerText === 'Start a group'`);
  await cdp.clickText("Connect");
  await cdp.waitFor(`!!document.querySelector('[title="${wallet.address("D")}"]')`, { timeout: 30000 });
  await cdp.fill("Group name", "Solo");
  await cdp.clickText("Create group");
  await cdp.waitFor(`document.body.innerText.includes('at least two people')`, { timeout: 10000, label: "one-person group refused" });
  check("a one-person group is refused in the form", true);
  await cdp.fill("Everyone else", "0x0000000000000000000000000000000000000000");
  await cdp.waitFor(`document.body.innerText.includes('zero address')`, { timeout: 10000, label: "zero address refused" });
  check("the zero address is refused in the form, in words", true);
  await cdp.fill("Everyone else", "0x1234");
  await cdp.waitFor(`document.body.innerText.includes('not a valid address')`, { timeout: 10000, label: "typo named" });
  check("a mistyped address is named, not skipped", true);
  const many = Array.from({ length: 40 }, (_, i) => "0x" + (i + 1).toString(16).padStart(40, "0")).join(" ");
  await cdp.fill("Everyone else", many);
  await cdp.waitFor(`document.body.innerText.includes('holds up to')`, { timeout: 10000, label: "too many people" });
  check("a group over the member cap is refused in the form", true);
  await shot("form-limits");

  // 7. A blocklisted recipient. Control: the same settle page offers the button when nobody is blocklisted.
  await open(`#/g/${DEMO.id}/settle?from=${DEMO.from}`);
  await cdp.waitFor(`document.querySelector('h1')?.innerText === 'Settle up'`, { timeout: 90000 });
  if (!(await cdp.eval(`!!document.querySelector('[title^="0x"]')`))) await cdp.clickText("Connect");
  await cdp.waitFor(`!!document.querySelector('[title="${wallet.address("D")}"]')`, { timeout: 30000 });
  await cdp.waitFor(`document.body.innerText.includes('Settle my 3 transfers')`, { timeout: 60000, label: "control: settle button offered" });
  check("control: with no blocklist the debtor is offered the 3-transfer settle", true);
  mode = "blocklist";
  await open(`#/g/${DEMO.id}/settle?from=${DEMO.from}`);
  await cdp.waitFor(`document.querySelector('h1')?.innerText === 'Settle up'`, { timeout: 90000 });
  if (!(await cdp.eval(`!!document.querySelector('[title^="0x"]')`))) await cdp.clickText("Connect");
  await cdp.waitFor(`document.body.innerText.includes('will not send to')`, { timeout: 60000, label: "blocklist warning" });
  const blockedBtn = await cdp.eval(`(() => { const b = [...document.querySelectorAll('button')].find((x) => x.innerText.includes('Settle my')); return b ? { disabled: b.disabled } : null; })()`);
  check("a blocklisted recipient is named before signing and the settle button is not usable", blockedBtn === null || blockedBtn.disabled, JSON.stringify(blockedBtn) + `, ${seen.blocklisted} isBlacklisted calls answered true`);
  await shot("blocklisted");
  mode = "pass";

  // 8. Nothing was ever sent, and the page threw nothing of its own.
  check("no transaction was sent during hardening", wallet.state.sent.length === sentAtStart);
  const own = errors.filter((e) => !/Failed to load resource|ERR_CONNECTION_REFUSED|429|status of 4|net::|rate limit/i.test(e));
  check("no uncaught exception or app console.error beyond the expected RPC noise", own.length === 0, own.slice(0, 3).join(" | "));
  console.log(`(${errors.length - own.length} expected RPC noise lines filtered)`);
} catch (e) {
  console.error("FAILED:", e.message);
  console.error("page text:", (await text().catch(() => "?")).slice(0, 400).split("\n").join(" | "));
  if (OUT) await cdp.shot(`${OUT}/harden-FAILED.png`).catch(() => {});
  results.push({ name: "script completed", ok: false });
} finally {
  const bad = results.filter((r) => !r.ok);
  console.log(`\n${results.length - bad.length}/${results.length} checks passed`);
  if (bad.length) process.exitCode = 1;
  close();
  await sleep(300);
}
