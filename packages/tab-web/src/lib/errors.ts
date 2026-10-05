/** One plain sentence for a failed chain read. Raw transport text such as "HTTP request failed." tells a person nothing. */
export function readMessage(e: unknown): string {
  const text = String((e as { shortMessage?: string; message?: string })?.shortMessage ?? (e as Error)?.message ?? e);
  if (/HTTP request failed|fetch failed|Failed to fetch|NetworkError|timed? ?out|timeout/i.test(text)) return "Could not reach the Arc RPC (rpc.mainnet.arc.io). Check your connection and try again.";
  if (/rate limit|exceeds defined limit|-32005|429/i.test(text)) return "The Arc RPC is rate limiting this browser. Wait a few seconds and try again.";
  return text.split("\n")[0] ?? "Something went wrong reading the chain.";
}
