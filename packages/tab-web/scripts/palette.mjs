// Measures the palette in src/styles/tokens.css: WCAG contrast for text pairs, CIE76 dE for role-hue pairs, chroma ratio accent vs surfaces.
// Reads the tokens FROM the css so the table cannot drift from what ships. Usage: node scripts/palette.mjs
import { readFileSync } from "node:fs";
import { converter, formatHex, differenceEuclidean, wcagContrast, parse } from "culori";

const css = readFileSync(new URL("../src/styles/tokens.css", import.meta.url), "utf8");
const toOklch = converter("oklch");

function block(selectorStart) {
  const i = css.indexOf(selectorStart);
  if (i < 0) throw new Error("block not found: " + selectorStart);
  const open = css.indexOf("{", i);
  let depth = 0;
  for (let j = open; j < css.length; j++) {
    if (css[j] === "{") depth++;
    if (css[j] === "}" && --depth === 0) return css.slice(open + 1, j);
  }
  throw new Error("unbalanced");
}
function vars(body) {
  const out = {};
  for (const m of body.matchAll(/--([a-z0-9-]+):\s*(oklch\([^)]*\))/g)) out[m[1]] = m[2];
  return out;
}
const dark = vars(block(":root {"));
const light = { ...dark, ...vars(block(':root[data-theme="light"]')) };

// Control: the extractor must see a known token set, or an empty parse could pass as clean.
if (Object.keys(dark).length !== 19) throw new Error("expected 19 dark colour tokens, parsed " + Object.keys(dark).length);

const dE = differenceEuclidean("lab");
const pairs = [
  ["ink", "ground", 7],
  ["ink", "raised", 7],
  ["muted", "ground", 4.5],
  ["muted", "raised", 4.5],
  ["accent", "ground", 4.5],
  ["accent", "raised", 4.5],
  ["on-accent", "accent", 4.5],
  ["amber", "raised", 4.5],
  ["coral", "raised", 4.5],
  ["sky", "raised", 4.5],
  ["paper-ink", "paper", 7],
  ["paper-faint", "paper", 4.5],
  ["stamp", "paper", 4.5],
];
const roles = ["accent", "amber", "coral", "sky"];
let fail = 0;

for (const [name, theme] of [["dark", dark], ["light", light]]) {
  console.log(`\n== ${name} ==`);
  const c = (k) => {
    const v = parse(theme[k]);
    if (!v) throw new Error("cannot parse " + k + " = " + theme[k]);
    return v;
  };
  for (const [fg, bg, min] of pairs) {
    const r = wcagContrast(c(fg), c(bg));
    const ok = r >= min;
    if (!ok) fail++;
    console.log(`${ok ? "ok  " : "FAIL"} ${fg.padEnd(12)} on ${bg.padEnd(8)} ${r.toFixed(2)}:1 (need ${min})`);
  }
  for (let i = 0; i < roles.length; i++)
    for (let j = i + 1; j < roles.length; j++) {
      const d = dE(c(roles[i]), c(roles[j]));
      const ok = d >= 20;
      if (!ok) fail++;
      console.log(`${ok ? "ok  " : "FAIL"} dE76 ${roles[i]}-${roles[j]} ${d.toFixed(1)} (need 20)`);
    }
  const accentC = toOklch(c("accent")).c;
  for (const s of ["ground", "raised"]) {
    const sc = toOklch(c(s)).c;
    const ratio = accentC / sc;
    const ok = ratio >= 4 && sc >= 0.008 && sc <= 0.03;
    if (!ok) fail++;
    console.log(`${ok ? "ok  " : "FAIL"} chroma accent/${s} ${ratio.toFixed(1)}x (need 4x); surface chroma ${sc.toFixed(3)} (want .008-.03)`);
  }
  console.log("hex", Object.fromEntries(["ground", "raised", "accent", "amber", "coral", "sky", "paper"].map((k) => [k, formatHex(c(k))])));
}
console.log(fail ? `\n${fail} FAILURES` : "\nall palette gates hold");
process.exit(fail ? 1 : 0);
