import type { AnchorHTMLAttributes, ButtonHTMLAttributes, ReactNode } from "react";
import s from "./ui.module.css";

export const cx = (...a: (string | false | null | undefined)[]) => a.filter(Boolean).join(" ");

type Variant = "primary" | "secondary" | "quiet";

export function Button({ variant = "primary", loading, block, className, children, disabled, ...rest }: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant; loading?: boolean; block?: boolean }) {
  return (
    <button className={cx(s.btn, s[variant], block && s.block, className)} disabled={disabled || loading} aria-busy={loading || undefined} {...rest}>
      {loading && <span className={s.spinner} aria-hidden="true" />}
      {children}
    </button>
  );
}

/** An anchor that looks like a button. Use for navigation; use Button for actions. */
export function LinkButton({ variant = "secondary", block, className, external, children, ...rest }: AnchorHTMLAttributes<HTMLAnchorElement> & { variant?: Variant; block?: boolean; external?: boolean }) {
  return (
    <a className={cx(s.btn, s[variant], block && s.block, className)} {...(external ? { target: "_blank", rel: "noopener noreferrer" } : {})} {...rest}>
      {children}
    </a>
  );
}

export function Field({ label, htmlFor, hint, error, children }: { label: string; htmlFor: string; hint?: ReactNode; error?: string | null; children: ReactNode }) {
  return (
    <div className={s.field}>
      <label className={s.label} htmlFor={htmlFor}>
        {label}
      </label>
      {children}
      {error ? (
        <p className={s.errorText} id={`${htmlFor}-err`} role="alert">
          {error}
        </p>
      ) : hint ? (
        <p className={s.hint} id={`${htmlFor}-hint`}>
          {hint}
        </p>
      ) : null}
    </div>
  );
}

export const inputClass = s.input;
export const cardClass = s.card;
export const linkBtnClass = s.linkBtn;

type Tone = "info" | "warn" | "error" | "ok";
const toneClass: Record<Tone, string> = { info: s.toneInfo!, warn: s.toneWarn!, error: s.toneError!, ok: s.toneOk! };

/** role="alert" for errors, role="status" otherwise, so assistive tech announces the right amount. */
export function Notice({ tone = "info", title, children }: { tone?: Tone; title?: string; children?: ReactNode }) {
  return (
    <div className={cx(s.notice, toneClass[tone])} role={tone === "error" ? "alert" : "status"}>
      {title && <strong>{title}</strong>}
      {children && <div>{children}</div>}
    </div>
  );
}

export function Pill({ tone, children }: { tone?: Tone; children: ReactNode }) {
  return <span className={cx(s.pill, tone && toneClass[tone])}>{children}</span>;
}
