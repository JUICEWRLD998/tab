import { useCallback, useEffect, useRef, useState } from "react";

export type Async<T> = { status: "loading"; progress?: string } | { status: "ok"; data: T } | { status: "error"; error: Error };

/**
 * Run an async loader when `key` changes. A stale run never writes state (the newer key wins), and `reload` re-runs the same key.
 * The loader gets a `progress` callback so slow chain scans can say what they are doing.
 */
export function useAsync<T>(key: string, load: (progress: (msg: string) => void) => Promise<T>): [Async<T>, () => void] {
  const [state, setState] = useState<Async<T>>({ status: "loading" });
  const [tick, setTick] = useState(0);
  const loadRef = useRef(load);
  loadRef.current = load;

  useEffect(() => {
    let live = true;
    setState({ status: "loading" });
    loadRef
      .current((progress) => live && setState({ status: "loading", progress }))
      .then((data) => live && setState({ status: "ok", data }))
      .catch((e: unknown) => live && setState({ status: "error", error: e instanceof Error ? e : new Error(String(e)) }));
    return () => {
      live = false;
    };
  }, [key, tick]);

  return [state, useCallback(() => setTick((t) => t + 1), [])];
}
