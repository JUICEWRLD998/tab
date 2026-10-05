import { useSyncExternalStore } from "react";

/** Hash routes, so the app is a static file with no server rewrite rules. A group link carries its creation block (?from=) so a reader scans one range, not the whole chain. */
export type Route =
  | { name: "home" }
  | { name: "new" }
  | { name: "group"; id: string; from?: bigint }
  | { name: "settle"; id: string; from?: bigint }
  | { name: "verify"; hash?: string; from?: bigint }
  | { name: "notfound"; path: string };

function parseFrom(q: URLSearchParams): bigint | undefined {
  const v = q.get("from");
  return v && /^\d{1,12}$/.test(v) ? BigInt(v) : undefined;
}

export function parseRoute(hash: string): Route {
  const raw = hash.replace(/^#/, "") || "/";
  const [path = "/", query = ""] = raw.split("?");
  const q = new URLSearchParams(query);
  const parts = path.split("/").filter(Boolean);
  if (parts.length === 0) return { name: "home" };
  if (parts[0] === "new" && parts.length === 1) return { name: "new" };
  if (parts[0] === "g" && parts[1]) {
    let id: string;
    try {
      id = decodeURIComponent(parts[1]);
    } catch {
      return { name: "notfound", path };
    }
    if (parts.length === 2) return { name: "group", id, from: parseFrom(q) };
    if (parts.length === 3 && parts[2] === "settle") return { name: "settle", id, from: parseFrom(q) };
  }
  if (parts[0] === "v" && parts.length <= 2) return { name: "verify", hash: parts[1], from: parseFrom(q) };
  return { name: "notfound", path };
}

const suffix = (from?: bigint) => (from !== undefined ? `?from=${from}` : "");
export const href = {
  home: () => "#/",
  new: () => "#/new",
  group: (id: string, from?: bigint) => `#/g/${encodeURIComponent(id)}${suffix(from)}`,
  settle: (id: string, from?: bigint) => `#/g/${encodeURIComponent(id)}/settle${suffix(from)}`,
  verify: (hash?: string, from?: bigint) => `#/v${hash ? "/" + hash : ""}${suffix(from)}`,
};

function subscribe(cb: () => void) {
  window.addEventListener("hashchange", cb);
  return () => window.removeEventListener("hashchange", cb);
}

/** The route changes only when the hash string does, so the snapshot is the string and parsing happens after. */
export function useHash(): string {
  return useSyncExternalStore(subscribe, () => window.location.hash, () => "");
}

export const navigate = (to: string) => {
  window.location.hash = to.replace(/^#/, "");
};
