/** RPC error code the load-balanced endpoint documents for event reads that hit a lagging node. */
export const RPC_LAGGING = -32014;

/** The endpoint rate-limits bursts of getLogs with -32005 (seen 2026-10-05 at 4 parallel chunks). Back off and try again. */
export const RPC_RATE_LIMITED = -32005;

function errorCode(e: unknown): number | undefined {
  let cur: any = e;
  for (let i = 0; i < 6 && cur; i++, cur = cur.cause) {
    if (typeof cur.code === "number") return cur.code;
    const m = /-32014/.exec(String(cur.message ?? ""));
    if (m) return RPC_LAGGING;
  }
  return undefined;
}

export const isRetryable = (e: unknown) => errorCode(e) === RPC_LAGGING || errorCode(e) === RPC_RATE_LIMITED || /rate limit/i.test(String((e as any)?.message ?? e)) || /timeout|fetch failed|HTTP request failed/i.test(String((e as any)?.message ?? e));

export async function withRetry<T>(fn: () => Promise<T>, opts: { tries?: number; baseMs?: number; sleep?: (ms: number) => Promise<void> } = {}): Promise<T> {
  const { tries = 6, baseMs = 300, sleep = (ms) => new Promise((r) => setTimeout(r, ms)) } = opts;
  let last: unknown;
  for (let i = 0; i < tries; i++) {
    try {
      return await fn();
    } catch (e) {
      last = e;
      if (!isRetryable(e) || i === tries - 1) throw e;
      await sleep(baseMs * 2 ** i);
    }
  }
  throw last;
}
