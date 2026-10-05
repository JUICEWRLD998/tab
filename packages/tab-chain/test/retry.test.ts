import { describe, expect, it } from "vitest";
import { isRetryable, withRetry } from "../src/retry";

const noSleep = async () => {};

describe("withRetry", () => {
  it("retries -32014 then succeeds", async () => {
    let n = 0;
    const out = await withRetry(async () => {
      if (++n < 3) throw Object.assign(new Error("lagging"), { code: -32014 });
      return "ok";
    }, { sleep: noSleep });
    expect(out).toBe("ok");
    expect(n).toBe(3);
  });
  it("finds -32014 nested in a cause chain and in message text", () => {
    expect(isRetryable(new Error("x", { cause: Object.assign(new Error("y"), { code: -32014 }) }))).toBe(true);
    expect(isRetryable(new Error("RPC returned -32014 block not found"))).toBe(true);
  });
  it("retries a rate limit (-32005)", async () => {
    let n = 0;
    expect(await withRetry(async () => { if (++n < 3) throw Object.assign(new Error("rate limit exceeded"), { code: -32005 }); return "ok"; }, { sleep: noSleep })).toBe("ok");
    expect(isRetryable(new Error("Details: rate limit exceeded"))).toBe(true);
  });
  it("does not retry other errors (planted negative control)", async () => {
    let n = 0;
    await expect(withRetry(async () => { n++; throw new Error("execution reverted"); }, { sleep: noSleep })).rejects.toThrow("reverted");
    expect(n).toBe(1);
  });
  it("gives up after the configured tries", async () => {
    let n = 0;
    await expect(withRetry(async () => { n++; throw Object.assign(new Error("l"), { code: -32014 }); }, { tries: 3, sleep: noSleep })).rejects.toThrow();
    expect(n).toBe(3);
  });
});
