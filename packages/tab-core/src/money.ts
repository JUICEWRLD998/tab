/** Money is integer base units at 6 decimals (the ERC-20 USDC view). Never the 18-decimal native view. */
export const DECIMALS = 6;
const SCALE = 10n ** BigInt(DECIMALS);

export type Amount = bigint;

export function parseUsdc(input: string): Amount {
  const s = input.trim();
  const m = /^(\d+)(?:\.(\d{1,6}))?$/.exec(s);
  if (!m) throw new Error(`invalid USDC amount: "${input}" (max ${DECIMALS} decimals, no sign)`);
  const whole = BigInt(m[1]!);
  const frac = BigInt((m[2] ?? "").padEnd(DECIMALS, "0") || "0");
  return whole * SCALE + frac;
}

/** At least 2 decimals; more only when the amount needs them. */
export function formatUsdc(amount: Amount): string {
  const neg = amount < 0n;
  const abs = neg ? -amount : amount;
  const whole = abs / SCALE;
  const frac = (abs % SCALE).toString().padStart(DECIMALS, "0").replace(/0+$/, "").padEnd(2, "0");
  return `${neg ? "-" : ""}${whole}.${frac}`;
}
