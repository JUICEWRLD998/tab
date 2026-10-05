import { useSyncExternalStore } from "react";
import { shortAddr } from "./format";

/** Nicknames live only in this browser (localStorage). They never go on chain: a name is a label for the viewer, not part of the ledger. */
const KEY = "tab.names.v1";
type NameMap = Record<string, string>;

let cache: NameMap | null = null;
const listeners = new Set<() => void>();

function load(): NameMap {
  if (cache) return cache;
  try {
    const raw = localStorage.getItem(KEY);
    const parsed = raw ? (JSON.parse(raw) as unknown) : {};
    cache = parsed && typeof parsed === "object" ? (parsed as NameMap) : {};
  } catch {
    cache = {};
  }
  return cache;
}

export function setName(address: string, name: string) {
  const next = { ...load() };
  const clean = name.trim().slice(0, 24);
  if (clean) next[address.toLowerCase()] = clean;
  else delete next[address.toLowerCase()];
  cache = next;
  try {
    localStorage.setItem(KEY, JSON.stringify(next));
  } catch {
    /* private mode or blocked storage: the name lasts for this tab only */
  }
  listeners.forEach((l) => l());
}

export function useNames(): NameMap {
  return useSyncExternalStore(
    (cb) => {
      listeners.add(cb);
      return () => listeners.delete(cb);
    },
    load,
    () => ({}),
  );
}

/** "You" for the connected wallet, else the viewer's nickname, else a shortened address. */
export function labelFor(address: string, names: NameMap, me?: string | null): string {
  const a = address.toLowerCase();
  if (me && a === me.toLowerCase()) return "You";
  return names[a] ?? shortAddr(a);
}
