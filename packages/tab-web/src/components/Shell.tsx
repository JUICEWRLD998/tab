import { useEffect, useState, type ReactNode } from "react";
import { connect, disconnect, hasWallet, useWallet } from "../lib/wallet";
import { shortAddr } from "../lib/format";
import { href, type Route } from "../lib/router";
import { Button, Notice } from "./ui";
import s from "./Shell.module.css";

type Theme = "system" | "light" | "dark";
const THEME_KEY = "tab.theme";

function readTheme(): Theme {
  try {
    const v = localStorage.getItem(THEME_KEY);
    return v === "light" || v === "dark" ? v : "system";
  } catch {
    return "system";
  }
}

function applyTheme(t: Theme) {
  const root = document.documentElement;
  if (t === "system") root.removeAttribute("data-theme");
  else root.setAttribute("data-theme", t);
}

const ICONS: Record<Theme, ReactNode> = {
  system: (
    <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden="true">
      <rect x="2.5" y="3.5" width="15" height="10" rx="2" />
      <path d="M7 17h6M10 13.5V17" />
    </svg>
  ),
  light: (
    <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" aria-hidden="true">
      <circle cx="10" cy="10" r="3.4" />
      <path d="M10 2.5v2M10 15.5v2M2.5 10h2M15.5 10h2M4.7 4.7l1.4 1.4M13.9 13.9l1.4 1.4M4.7 15.3l1.4-1.4M13.9 6.1l1.4-1.4" />
    </svg>
  ),
  dark: (
    <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" aria-hidden="true">
      <path d="M16.5 11.6A6.6 6.6 0 0 1 8.4 3.5a6.6 6.6 0 1 0 8.1 8.1Z" />
    </svg>
  ),
};
const NEXT: Record<Theme, Theme> = { system: "light", light: "dark", dark: "system" };

function ThemeToggle() {
  const [theme, setTheme] = useState<Theme>(readTheme);
  useEffect(() => applyTheme(theme), [theme]);
  return (
    <button
      type="button"
      className={s.theme}
      onClick={() => {
        const next = NEXT[theme];
        setTheme(next);
        try {
          if (next === "system") localStorage.removeItem(THEME_KEY);
          else localStorage.setItem(THEME_KEY, next);
        } catch {
          /* storage blocked: the choice lasts for this tab */
        }
      }}
      aria-label={`Theme: ${theme}. Switch to ${NEXT[theme]}.`}
      title={`Theme: ${theme}`}
    >
      {ICONS[theme]}
    </button>
  );
}

function WalletButton() {
  const w = useWallet();
  if (w.status === "connected") {
    return (
      <span className={s.wallet}>
        <span className={s.addr} title={w.address}>
          <span className={s.dot} aria-hidden="true" />
          <span className="sr-only">Connected as </span>
          {shortAddr(w.address)}
        </span>
        <Button variant="quiet" onClick={disconnect} aria-label="Disconnect wallet">
          <span className={s.hideSmall}>Disconnect</span>
          <span aria-hidden="true" className={s.xmark}>×</span>
        </Button>
      </span>
    );
  }
  return (
    <Button variant="secondary" onClick={() => void connect()} loading={w.status === "connecting"} disabled={!hasWallet() && w.status !== "error"} title={hasWallet() ? undefined : "No browser wallet found"}>
      Connect<span className={s.long}>&nbsp;wallet</span>
    </Button>
  );
}

export function Shell({ route, children }: { route: Route; children: ReactNode }) {
  const w = useWallet();
  return (
    <>
      <a className={s.skip} href="#main">
        Skip to content
      </a>
      <header className={s.header}>
        <div className={s.bar}>
          <a className={s.brand} href={href.home()} aria-label="Tab, home">
            <svg className={s.mark} viewBox="0 0 22 26" fill="currentColor" aria-hidden="true">
              <path d="M1 1h20v22l-2.5-2-2.5 2-2.5-2-2.5 2-2.5-2-2.5 2-2.5-2L1 23Z" />
              <path d="M5 7h12M5 11h12M5 15h7" stroke="var(--ground)" strokeWidth="1.5" strokeLinecap="round" fill="none" />
            </svg>
            Tab
          </a>
          <div className={s.right}>
            <a className={s.nav} href={href.verify()} aria-current={route.name === "verify" ? "page" : undefined}>
              Verify
            </a>
            <ThemeToggle />
            <WalletButton />
          </div>
        </div>
      </header>
      <main id="main" tabIndex={-1} className={s.main}>
        {w.status === "error" && (
          <div className={s.walletMsg}>
            <Notice tone="error" title="Wallet">
              {w.message}
            </Notice>
          </div>
        )}
        {children}
      </main>
      <footer className={s.footer}>
        <div className={s.footBar}>
          <span>Arc mainnet, chain 5042. The ledger is the chain; this page holds no data.</span>
          <span className={s.footLinks}>
            <a href="https://github.com/JUICEWRLD998/tab" target="_blank" rel="noopener noreferrer">
              Source
            </a>
            <a href="https://explorer.arc.io" target="_blank" rel="noopener noreferrer">
              Explorer
            </a>
          </span>
        </div>
      </footer>
    </>
  );
}
