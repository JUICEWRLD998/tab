import { describe, expect, it } from "vitest";
import { extractAddresses, isAddress, isHash, newGroupId, plural, shortAddr } from "../src/lib/format";

const A = "0xe874C32569a28B2D0bCa07Ef25F0ec0B68BeeDD0";
const B = "0xccD52402529766A428597fd02882C832EA3Be658";

describe("extractAddresses", () => {
  it("planted control: pulls two addresses from messy text, lowercased, in order", () => {
    expect(extractAddresses(`ben: ${A},\n  ada ${B}; `)).toEqual([A.toLowerCase(), B.toLowerCase()]);
  });
  it("drops duplicates in any case", () => {
    expect(extractAddresses(`${A} ${A.toLowerCase()} ${B}`)).toHaveLength(2);
  });
  it("finds nothing in text with no address, so an empty paste is not a group", () => {
    expect(extractAddresses("no addresses here 0x12")).toEqual([]);
  });
});

describe("format helpers", () => {
  it("validates hashes and addresses by exact length", () => {
    expect(isHash("0x" + "a".repeat(64))).toBe(true);
    expect(isHash("0x" + "a".repeat(63))).toBe(false);
    expect(isAddress(A)).toBe(true);
    expect(isAddress(A + "0")).toBe(false);
  });
  it("shortens an address to its two ends", () => {
    expect(shortAddr(A.toLowerCase())).toBe("0xe874…edd0");
  });
  it("pluralises", () => {
    expect(plural(1, "debt")).toBe("1 debt");
    expect(plural(3, "debt")).toBe("3 debts");
    expect(plural(2, "person", "people")).toBe("2 people");
  });
  it("group ids are url-safe and differ between calls", () => {
    const a = newGroupId();
    expect(a).toMatch(/^tab-[0-9a-z]{1,8}$/);
    expect(newGroupId()).not.toBe(a);
  });
});
