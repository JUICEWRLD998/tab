/** RPC error code the load-balanced endpoint documents for event reads that hit a lagging node. */
export const RPC_LAGGING = -32014;

function errorCode(e: unknown): number | undefined {
  let cur: any = e;
  for (let i = 0; i < 6 && cur; i++, cur = cur.cause) {
    if (typeof cur.code === "number") return cur.code;
    const m = /-32014/.exec(String(cur.message ?? ""));
    if (m) return RPC_LAGGING;
  }
  return undefined;
}

export const isRetryable = (e: unknown) => errorCode(e) === RPC_LAGGING || /timeout|fetch failed|HTTP request failed/i.test(String((e as any)?.message ?? e));

export async function withRetry<T>(fn: () => Promise<T>, opts: { tries?: number; baseMs?: number; sleep?: (ms: number) => Promise<void> } = {}): Promise<T> {
  const { tries = 5, baseMs = 250, sleep = (ms) => new Promise((r) => setTimeout(r, ms)) } = opts;
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
