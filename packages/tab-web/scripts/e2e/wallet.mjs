// A stand-in for a browser wallet. The page sees a normal EIP-1193 window.ethereum; every request is forwarded to Node,
// which signs with a throwaway key from TAB_WALLET_DIR (outside the repo) and sends to Arc mainnet. Real transactions, real fees.
import { readFileSync } from "node:fs";
import { createPublicClient, createWalletClient, http, defineChain } from "viem";
import { privateKeyToAccount } from "viem/accounts";

const RPC = "https://rpc.mainnet.arc.io";
const arc = defineChain({ id: 5042, name: "Arc", nativeCurrency: { name: "USDC", symbol: "USDC", decimals: 18 }, rpcUrls: { default: { http: [RPC] } } });

const INJECTED = `(() => {
  let n = 0; const pending = new Map(); const listeners = {};
  window.__walletResolve = (id, r) => { const p = pending.get(id); pending.delete(id); if (!p) return; r.ok ? p.res(r.result) : p.rej(Object.assign(new Error(r.message), { code: r.code })); };
  window.ethereum = {
    isTestProvider: true,
    request: ({ method, params }) => new Promise((res, rej) => { const id = ++n; pending.set(id, { res, rej }); window.__walletBridge(JSON.stringify({ id, method, params })); }),
    on: (e, cb) => { (listeners[e] ||= []).push(cb); },
    removeListener: () => {},
  };
  window.__emit = (e, ...a) => (listeners[e] || []).forEach((cb) => cb(...a));
})()`;

/** keys: { name: "file.json" } relative to TAB_WALLET_DIR. The files are `cast wallet new --json` output. */
export async function installWallet(cdp, keys, dir = process.env.TAB_WALLET_DIR) {
  if (!dir) throw new Error("set TAB_WALLET_DIR to the folder with the throwaway wallet json files");
  const accounts = {};
  for (const [name, file] of Object.entries(keys)) accounts[name] = privateKeyToAccount(JSON.parse(readFileSync(`${dir}/${file}`, "utf8")).data[0].private_key);
  const pub = createPublicClient({ chain: arc, transport: http(RPC, { retryCount: 4, retryDelay: 400 }) });
  const state = { current: Object.keys(accounts)[0], reject: 0, sent: [], requests: [] };

  await cdp.send("Runtime.addBinding", { name: "__walletBridge" });
  await cdp.send("Page.addScriptToEvaluateOnNewDocument", { source: INJECTED });
  await cdp.eval(INJECTED); // also install into the page that is already open

  async function handle(method, params) {
    const acct = accounts[state.current];
    switch (method) {
      case "eth_requestAccounts":
      case "eth_accounts":
        return [acct.address];
      case "eth_chainId":
        return "0x13b2";
      case "wallet_switchEthereumChain":
        return null;
      case "eth_sendTransaction": {
        if (state.reject > 0) {
          state.reject--;
          throw Object.assign(new Error("User rejected the request."), { code: 4001 });
        }
        const tx = params[0];
        const wc = createWalletClient({ account: acct, chain: arc, transport: http(RPC, { retryCount: 4, retryDelay: 400 }) });
        const big = (v) => (v === undefined ? undefined : BigInt(v));
        const hash = await wc.sendTransaction({ to: tx.to, data: tx.data, value: big(tx.value), gas: big(tx.gas), maxFeePerGas: big(tx.maxFeePerGas), maxPriorityFeePerGas: big(tx.maxPriorityFeePerGas) });
        state.sent.push({ from: acct.address, hash, to: tx.to });
        return hash;
      }
      default:
        return pub.request({ method, params });
    }
  }

  cdp.on("Runtime.bindingCalled", async ({ name, payload }) => {
    if (name !== "__walletBridge") return;
    const { id, method, params } = JSON.parse(payload);
    state.requests.push(method);
    const t0 = Date.now();
    let out;
    try {
      out = { ok: true, result: await handle(method, params ?? []) };
    } catch (e) {
      out = { ok: false, message: e.shortMessage ?? e.message, code: e.code ?? e.cause?.code ?? -32000 };
    }
    if (method === "eth_sendTransaction") console.log("  wallet:", method, state.current, out.ok ? out.result.slice(0, 12) : "ERR " + out.message, `${Date.now() - t0}ms`);
    await cdp.eval(`window.__walletResolve(${id}, ${JSON.stringify(out)})`);
  });

  return {
    accounts,
    state,
    address: (name = state.current) => accounts[name].address.toLowerCase(),
    /** Switch the active account the way a wallet does: change it, then emit accountsChanged. */
    async use(name) {
      if (!accounts[name]) throw new Error(`no account ${name}`);
      state.current = name;
      await cdp.eval(`window.__emit('accountsChanged', [${JSON.stringify(accounts[name].address)}])`);
    },
    /** Make the next eth_sendTransaction fail the way a user pressing Reject does. */
    rejectNext(n = 1) {
      state.reject = n;
    },
  };
}
