import { describe, expect, it } from "vitest";
import { formatUsdc, parseUsdc } from "../src/money";

describe("parseUsdc", () => {
  it("parses whole and fractional amounts to 6 decimals", () => {
    expect(parseUsdc("1")).toBe(1_000_000n);
    expect(parseUsdc("0.01")).toBe(10_000n);
    expect(parseUsdc("12.345678")).toBe(12_345_678n);
    expect(parseUsdc(" 5.5 ")).toBe(5_500_000n);
  });
  it("rejects 7 decimals, signs, and junk", () => {
    for (const bad of ["1.1234567", "-1", "+1", "1e6", "", ".5", "abc", "1,5"]) {
      expect(() => parseUsdc(bad)).toThrow();
    }
  });
});

describe("formatUsdc", () => {
  it("round-trips", () => {
    for (const v of ["0.01", "1", "12.345678", "100.5"]) {
      expect(parseUsdc(formatUsdc(parseUsdc(v)))).toBe(parseUsdc(v));
    }
  });
  it("shows at least 2 decimals, more only when needed", () => {
    expect(formatUsdc(1_000_000n)).toBe("1.00");
    expect(formatUsdc(10_000n)).toBe("0.01");
    expect(formatUsdc(12_345_678n)).toBe("12.345678");
  });
  it("handles negatives and zero", () => {
    expect(formatUsdc(-2_500_000n)).toBe("-2.50");
    expect(formatUsdc(0n)).toBe("0.00");
  });
});
