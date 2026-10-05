import { m } from "motion/react";
import type { ReactNode } from "react";
import { dur, ease } from "../lib/motion";
import { cx } from "./ui";
import s from "./Receipt.module.css";

export interface ReceiptLine {
  id: string;
  left: ReactNode;
  right: string;
  /** The viewer's own leg (the one their signature pays). */
  mine?: boolean;
}

/** Bars derived from the tx hash, so the same hash always prints the same strip. Decorative: it is not a scannable code and says so by being aria-hidden. */
function Bars({ seed }: { seed: string }) {
  const hex = seed.replace(/^0x/, "").padEnd(64, "0").slice(0, 64);
  let x = 0;
  const rects: { x: number; w: number }[] = [];
  for (let i = 0; i < hex.length; i++) {
    const n = parseInt(hex[i]!, 16);
    const w = 1 + (n % 3);
    if (i % 2 === 0) rects.push({ x, w });
    x += w + 1 + (n % 2);
  }
  return (
    <svg className={s.bars} viewBox={`0 0 ${x} 10`} preserveAspectRatio="none" aria-hidden="true" focusable="false">
      {rects.map((r, i) => (
        <rect key={i} x={r.x} y="0" width={r.w} height="10" fill="currentColor" />
      ))}
    </svg>
  );
}

export function Receipt({
  heading,
  sub,
  lines,
  emptyText = "Nothing on this receipt.",
  totalLabel,
  totalValue,
  meta = [],
  barcodeSeed,
  printed = true,
  stamped = false,
  stampText = "Final",
  onRaised = false,
  className,
}: {
  heading: string;
  sub?: string;
  lines: ReceiptLine[];
  emptyText?: string;
  totalLabel?: string;
  totalValue?: string;
  meta?: { k: string; v: ReactNode }[];
  barcodeSeed?: string;
  /** false hides the lines (they keep their space, so nothing shifts when they print). */
  printed?: boolean;
  stamped?: boolean;
  stampText?: string;
  onRaised?: boolean;
  className?: string;
}) {
  return (
    <section className={cx(s.paper, onRaised && s.onRaised, className)} aria-label={heading}>
      <header className={s.head}>
        <span className={s.title}>{heading}</span>
        {sub && <span className={s.sub}>{sub}</span>}
      </header>
      {lines.length === 0 ? (
        <p className={s.emptyLine}>{emptyText}</p>
      ) : (
        <ul className={s.lines}>
          {lines.map((l, i) => (
            <m.li
              key={l.id}
              className={cx(s.line, l.mine && s.mine)}
              initial={false}
              animate={{ opacity: printed ? 1 : 0, y: printed ? 0 : 8 }}
              transition={{ duration: dur.short, ease: ease.out, delay: printed ? i * 0.11 : 0 }}
            >
              <span className={s.left}>{l.left}</span>
              <span className={s.right}>{l.right}</span>
            </m.li>
          ))}
        </ul>
      )}
      {totalLabel && (
        <div className={s.total}>
          <span>{totalLabel}</span>
          <span>{totalValue}</span>
        </div>
      )}
      {meta.length > 0 && (
        <dl className={s.meta}>
          {meta.map((r) => (
            <div key={r.k}>
              <dt>{r.k}</dt>
              <dd>{r.v}</dd>
            </div>
          ))}
        </dl>
      )}
      {barcodeSeed && <Bars seed={barcodeSeed} />}
      {/* The stamp is the rubber-stamp exception to "controls never overshoot": it lands 1.5x, settles 4% under, then rests. */}
      <m.div
        className={s.stamp}
        aria-hidden="true"
        initial={false}
        animate={stamped ? { opacity: 1, scale: [1.5, 0.96, 1], rotate: -7 } : { opacity: 0, scale: 1.5, rotate: -12 }}
        transition={stamped ? { duration: 0.22, ease: ease.out, times: [0, 0.7, 1] } : { duration: 0 }}
      >
        {stampText}
      </m.div>
    </section>
  );
}
