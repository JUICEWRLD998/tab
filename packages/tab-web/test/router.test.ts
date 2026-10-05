import { describe, expect, it } from "vitest";
import { href, parseRoute } from "../src/lib/router";

const HASH = "0x42a23d78ca8e4ee7a16975b27d5c18ab303edb67359412aadc5f5b184936eec8";

describe("parseRoute", () => {
  it("planted control: every href round-trips through parseRoute", () => {
    expect(parseRoute(href.home())).toEqual({ name: "home" });
    expect(parseRoute(href.new())).toEqual({ name: "new" });
    expect(parseRoute(href.group("tab-1h4j301v", 24357102n))).toEqual({ name: "group", id: "tab-1h4j301v", from: 24357102n });
    expect(parseRoute(href.settle("tab-1h4j301v", 24357102n))).toEqual({ name: "settle", id: "tab-1h4j301v", from: 24357102n });
    expect(parseRoute(href.verify(HASH, 24350329n))).toEqual({ name: "verify", hash: HASH, from: 24350329n });
  });
  it("an empty hash is home, and the verify page works without a hash", () => {
    expect(parseRoute("")).toEqual({ name: "home" });
    expect(parseRoute("#/v")).toEqual({ name: "verify", hash: undefined, from: undefined });
  });
  it("a group id with spaces and symbols survives the round trip", () => {
    const id = "Lisbon weekend/2026 #1";
    expect(parseRoute(href.group(id))).toEqual({ name: "group", id, from: undefined });
  });
  it("ignores a creation block that is not digits instead of crashing", () => {
    expect(parseRoute("#/g/x?from=abc")).toEqual({ name: "group", id: "x", from: undefined });
    expect(parseRoute("#/g/x?from=-5")).toEqual({ name: "group", id: "x", from: undefined });
    expect(parseRoute("#/g/x?from=99999999999999")).toEqual({ name: "group", id: "x", from: undefined });
  });
  it("unknown paths and a malformed escape are not found, not a throw", () => {
    expect(parseRoute("#/nope")).toEqual({ name: "notfound", path: "/nope" });
    expect(parseRoute("#/g/%E0%A4%A")).toEqual({ name: "notfound", path: "/g/%E0%A4%A" });
    expect(parseRoute("#/g/x/extra/segments")).toEqual({ name: "notfound", path: "/g/x/extra/segments" });
  });
});
