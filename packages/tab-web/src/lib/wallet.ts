import { arcMainnet, assertEoa } from "@tab/chain";
import type { Address } from "@tab/core";
import { useSyncExternalStore } from "react";
import { createWalletClient, custom, type WalletClient } from "viem";
import { pub } from "./chain";

interface Eip1193 {
  request(args: { method: string; params?: unknown[] | object }): Promise<unknown>;
  on?(event: string, cb: (...args: unknown[]) => void): void;
}
declare global {
  interface Window {
    ethereum?: Eip1193;
  }
}

export type WalletState =
  | { status: "idle" }
  | { status: "connecting" }
  | { status: "connected"; address: Address; client: WalletClient }
  | { status: "error"; message: string };

let state: WalletState = { status: "idle" };
const listeners = new Set<() => void>();
const set = (s: WalletState) => {
  state = s;
  listeners.forEach((l) => l());
};

export const hasWallet = () => typeof window !== "undefined" && !!window.ethereum;

const CHAIN_HEX = "0x" + arcMainnet.id.toString(16);

/** Plain words for the errors a person can actually hit. */
export function walletMessage(e: unknown): string {
  const err = e as { code?: number; shortMessage?: string; message?: string; name?: string; cause?: { code?: number } };
  const code = err?.code ?? err?.cause?.code;
  if (code === 4001 || /user rejected|user denied/i.test(err?.message ?? "")) return "Signature rejected. Nothing was sent.";
  if (err?.name === "WalletTypeError") return err.message ?? "This wallet type cannot call Memo.";
  if (code === -32002) return "The wallet already has a request open. Check the wallet window.";
  return err?.shortMessage ?? err?.message ?? "Something went wrong.";
}

async function ensureArc(eth: Eip1193) {
  const current = (await eth.request({ method: "eth_chainId" })) as string;
  if (current.toLowerCase() === CHAIN_HEX) return;
  try {
    await eth.request({ method: "wallet_switchEthereumChain", params: [{ chainId: CHAIN_HEX }] });
  } catch (e) {
    if ((e as { code?: number }).code !== 4902) throw e;
    await eth.request({
      method: "wallet_addEthereumChain",
      params: [
        {
          chainId: CHAIN_HEX,
          chainName: "Arc",
          nativeCurrency: arcMainnet.nativeCurrency,
          rpcUrls: arcMainnet.rpcUrls.default.http,
          blockExplorerUrls: [arcMainnet.blockExplorers.default.url],
        },
      ],
    });
  }
}

export async function connect(): Promise<void> {
  const eth = window.ethereum;
  if (!eth) return set({ status: "error", message: "No browser wallet found. Install MetaMask, Rabby or Coinbase Wallet." });
  set({ status: "connecting" });
  try {
    const accounts = (await eth.request({ method: "eth_requestAccounts" })) as string[];
    const address = accounts[0]?.toLowerCase() as Address | undefined;
    if (!address) throw new Error("The wallet returned no account.");
    await ensureArc(eth);
    await assertEoa(pub, address);
    const client = createWalletClient({ account: address, chain: arcMainnet, transport: custom(eth) });
    set({ status: "connected", address, client });
  } catch (e) {
    set({ status: "error", message: walletMessage(e) });
  }
}

export function disconnect() {
  set({ status: "idle" });
}

let wired = false;
/** Follow account and network changes made inside the wallet. Called once from App. */
export function wireWalletEvents() {
  if (wired || !window.ethereum?.on) return;
  wired = true;
  window.ethereum.on("accountsChanged", () => {
    if (state.status === "connected") void connect();
  });
  window.ethereum.on("chainChanged", () => {
    if (state.status === "connected") void connect();
  });
}

export function useWallet(): WalletState {
  return useSyncExternalStore(
    (cb) => {
      listeners.add(cb);
      return () => listeners.delete(cb);
    },
    () => state,
    () => state,
  );
}
