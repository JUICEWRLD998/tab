import { describe, expect, it } from "vitest";
import { customSplit, equalSplit, normalize } from "../src/expense";
import { addr } from "./helpers";

const sum = (m: Map<string, bigint>) => [...m.values()].reduce((a, b) => a + b, 0n);

describe("equalSplit", () => {
  it("sums exactly and spreads the remainder deterministically", () => {
    const m = equalSplit(100n, [addr(3), addr(1), addr(2)]);
    expect(sum(m)).toBe(100n);
    expect([...m.values()].sort()).toEqual([33n, 33n, 34n]);
    expect(m.get(addr(1))).toBe(34n); // lowest sorted address takes the extra unit
  });
  it("dedupes participants", () => {
    expect(equalSplit(10n, [addr(1), addr(1)]).size).toBe(1);
  });
  it("rejects zero amount and empty group", () => {
    expect(() => equalSplit(0n, [addr(1)])).toThrow();
    expect(() => equalSplit(5n, [])).toThrow();
  });
});

describe("customSplit", () => {
  it("accepts shares that sum to the amount", () => {
    expect(customSplit(10n, new Map([[addr(1), 4n], [addr(2), 6n]])).size).toBe(2);
  });
  it("rejects mismatched sums and negatives", () => {
    expect(() => customSplit(10n, new Map([[addr(1), 4n], [addr(2), 5n]]))).toThrow();
    expect(() => customSplit(10n, new Map([[addr(1), 12n], [addr(2), -2n]]))).toThrow();
  });
});

describe("normalize", () => {
  it("lowercases and rejects address(0) and malformed input", () => {
    expect(normalize("0xABCDEFabcdefABCDEFabcdefABCDEFabcdefABCD")).toBe("0xabcdefabcdefabcdefabcdefabcdefabcdefabcd");
    expect(() => normalize("0x0000000000000000000000000000000000000000")).toThrow();
    expect(() => normalize("0x123")).toThrow();
  });
});
