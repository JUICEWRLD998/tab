import { describe, expect, it } from "vitest";
import { readMessage } from "../src/lib/errors";

describe("readMessage", () => {
  it("planted control: transport failures become a sentence naming the RPC", () => {
    expect(readMessage(new Error("HTTP request failed."))).toMatch(/Could not reach the Arc RPC/);
    expect(readMessage(new TypeError("Failed to fetch"))).toMatch(/Could not reach the Arc RPC/);
  });
  it("rate limits say to wait", () => {
    expect(readMessage(new Error("Request exceeds defined limit."))).toMatch(/rate limiting/);
  });
  it("anything else keeps its first line and never throws on odd values", () => {
    expect(readMessage(new Error("first\nsecond"))).toBe("first");
    expect(readMessage(undefined)).toBe("undefined");
    expect(readMessage({ shortMessage: "short" })).toBe("short");
  });
});
