import { logExpense, txUrl } from "@tab/chain";
import { equalSplit, parseUsdc, type Address, type Ledger } from "@tab/core";
import { m } from "motion/react";
import { useId, useRef, useState, type FormEvent } from "react";
import { Button, Field, LinkButton, Notice, Pill, cardClass, inputClass } from "../components/ui";
import { dur, ease } from "../lib/motion";
import { pub } from "../lib/chain";
import { plural, shortHash, usdc } from "../lib/format";
import { debtsOf, planOf } from "../lib/group";
import { labelFor, useNames } from "../lib/names";
import { href } from "../lib/router";
import { connect, useWallet, walletMessage } from "../lib/wallet";
import { GroupGate } from "./GroupGate";
import s from "./Group.module.css";

function Balances({ ledger, me }: { ledger: Ledger; me: string | null }) {
  const names = useNames();
  const max = [...ledger.balances.values()].reduce((a, v) => (v < 0n ? (-v > a ? -v : a) : v > a ? v : a), 0n);
  return (
    <ul className={s.balances}>
      {ledger.members.map((a) => {
        const v = ledger.balances.get(a) ?? 0n;
        const tone = v > 0n ? s.owed : v < 0n ? s.owes : s.square;
        const abs = v < 0n ? -v : v;
        const ratio = max === 0n ? 0 : Number((abs * 1000n) / max) / 1000;
        return (
          <li key={a} className={`${s.member} ${tone}`}>
            <span className={s.who}>
              {labelFor(a, names, me)}
              {a === me && <Pill tone="ok">You</Pill>}
            </span>
            <span>
              <span className={s.amt}>{abs === 0n ? "0.00" : usdc(abs)}</span>
              <span className={s.state} style={{ display: "block" }}>
                {v > 0n ? "is owed" : v < 0n ? "owes" : "square"}
              </span>
            </span>
            <span className={s.track} aria-hidden="true">
              <m.span className={s.fill} style={{ display: "block" }} initial={false} animate={{ scaleX: ratio }} transition={{ duration: dur.long, ease: ease.out }} />
            </span>
          </li>
        );
      })}
    </ul>
  );
}

function EmptyLedger() {
  return (
    <div className={s.empty}>
      <svg viewBox="0 0 72 60" fill="none" aria-hidden="true">
        <path d="M6 2h60v52l-7.5-6-7.5 6-7.5-6-7.5 6-7.5-6-7.5 6-7.5-6L6 54Z" fill="currentColor" />
        <path d="M18 16h36M18 26h36M18 36h20" stroke="var(--ground)" strokeWidth="2.4" strokeLinecap="round" />
      </svg>
      <p>No expenses yet. Whoever pays first logs it from their own wallet.</p>
    </div>
  );
}

function AddExpense({ ledger, id, onLogged, me }: { ledger: Ledger; id: string; me: string | null; onLogged: (block: bigint, hash: string) => void }) {
  const wallet = useWallet();
  const names = useNames();
  const labelId = useId();
  const amountId = useId();
  const [label, setLabel] = useState("");
  const [amount, setAmount] = useState("");
  const [picked, setPicked] = useState<Set<string>>(() => new Set(ledger.members));
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<{ label?: string; amount?: string; people?: string; submit?: string }>({});
  const [done, setDone] = useState<{ hash: string; block: bigint } | null>(null);

  const isMember = !!me && ledger.members.includes(me as Address);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setDone(null);
    if (wallet.status !== "connected") return void connect();
    const next: typeof err = {};
    const cleanLabel = label.trim();
    if (!cleanLabel) next.label = "Say what it was for.";
    else if (cleanLabel.length > 60) next.label = "Keep it under 60 characters.";
    let parsed = 0n;
    try {
      parsed = parseUsdc(amount);
      if (parsed <= 0n) next.amount = "Enter an amount above zero.";
    } catch {
      next.amount = "Use digits with up to 6 decimals, like 12.50.";
    }
    if (picked.size === 0) next.people = "Pick at least one person to split with.";
    setErr(next);
    if (Object.keys(next).length) return;
    const participants = ledger.members.filter((a) => picked.has(a));
    setBusy(true);
    try {
      const { hash, blockNumber } = await logExpense(pub, wallet.client, id, { amount: parsed, participants, label: cleanLabel });
      setDone({ hash, block: blockNumber });
      setLabel("");
      setAmount("");
      setPicked(new Set(ledger.members)); // each expense starts as an even split between everyone again
      onLogged(blockNumber, hash);
    } catch (e2) {
      setErr({ submit: walletMessage(e2) });
    } finally {
      setBusy(false);
    }
  }

  const share = (() => {
    try {
      const v = parseUsdc(amount);
      if (v <= 0n || picked.size === 0) return null;
      return [...equalSplit(v, ledger.members.filter((a) => picked.has(a)) as Address[]).values()][0] ?? null;
    } catch {
      return null;
    }
  })();

  return (
    <form className={`${cardClass} ${s.form}`} onSubmit={submit} noValidate>
      <h2>Log an expense</h2>
      {wallet.status === "connected" && !isMember && <Notice tone="warn" title="Not in this group">This wallet is not a member, so its expenses would be ignored. Switch to a member's wallet.</Notice>}
      <Field label="What was it for" htmlFor={labelId} error={err.label}>
        <input id={labelId} className={inputClass} value={label} onChange={(e) => setLabel(e.target.value)} maxLength={80} autoComplete="off" aria-invalid={!!err.label} aria-describedby={err.label ? `${labelId}-err` : undefined} />
      </Field>
      <Field label="Amount you paid, in USDC" htmlFor={amountId} error={err.amount}>
        <input id={amountId} className={`${inputClass} num`} value={amount} onChange={(e) => setAmount(e.target.value)} inputMode="decimal" autoComplete="off" aria-invalid={!!err.amount} aria-describedby={err.amount ? `${amountId}-err` : undefined} />
      </Field>
      <fieldset className={s.checks}>
        <legend>Split equally between</legend>
        {ledger.members.map((a) => (
          <label key={a} className={s.check}>
            <input
              type="checkbox"
              checked={picked.has(a)}
              onChange={(e) =>
                setPicked((prev) => {
                  const n = new Set(prev);
                  if (e.target.checked) n.add(a);
                  else n.delete(a);
                  return n;
                })
              }
            />
            {labelFor(a, names, me)}
          </label>
        ))}
        {err.people && (
          <p className="sr-only" role="alert">
            {err.people}
          </p>
        )}
      </fieldset>
      {err.people && <p style={{ color: "var(--coral)", fontSize: "var(--step--1)", marginTop: "calc(var(--s2) * -1)" }}>{err.people}</p>}
      {share !== null && <p className={s.mutedText}>About {usdc(share)} USDC each across {plural(picked.size, "person", "people")}.</p>}
      {err.submit && <Notice tone="error" title="Not logged">{err.submit}</Notice>}
      {done && (
        <Notice tone="ok" title="Logged and final">
          In block {done.block.toLocaleString("en-US")}.{" "}
          <a href={txUrl(done.hash)} target="_blank" rel="noopener noreferrer">
            {shortHash(done.hash)}
          </a>
        </Notice>
      )}
      <div>
        <Button type="submit" loading={busy} disabled={wallet.status === "connected" && !isMember}>
          {busy ? "Logging on Arc" : wallet.status === "connected" ? "Log expense" : "Connect wallet to log"}
        </Button>
      </div>
    </form>
  );
}

function GroupView({ id, ledger, reload, refreshing }: { id: string; ledger: Ledger; reload: (minHead?: bigint) => void; refreshing: boolean }) {
  const names = useNames();
  const wallet = useWallet();
  const me = wallet.status === "connected" ? wallet.address : null;
  const [copied, setCopied] = useState(false);
  const timer = useRef<number>(0);

  const debts = debtsOf(ledger);
  const plan = planOf(ledger);
  const myOwed = me ? plan.filter((t) => t.from === me) : [];
  const myTotal = myOwed.reduce((a, t) => a + t.amount, 0n);
  const created = ledger.created.blockNumber;
  const expenses = [...ledger.expenses].reverse();

  const byTx = new Map<string, typeof ledger.settled>();
  for (const l of ledger.settled) byTx.set(l.txHash, [...(byTx.get(l.txHash) ?? []), l]);

  async function copy() {
    const url = `${window.location.origin}${window.location.pathname}${href.group(id, created)}`;
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      window.clearTimeout(timer.current);
      timer.current = window.setTimeout(() => setCopied(false), 1800);
    } catch {
      window.prompt("Copy this link", url);
    }
  }

  return (
    <>
      <div className={s.head}>
        <h1 className={s.title}>{ledger.name}</h1>
        <p className={s.facts}>
          {plural(ledger.members.length, "person", "people")} · {plural(ledger.expenses.length, "expense")} · created in block <span className="num">{created.toLocaleString("en-US")}</span>
          {refreshing ? " · refreshing…" : ""}
        </p>
        <div className={s.headActions}>
          <Button variant="secondary" onClick={copy}>
            {copied ? "Link copied" : "Copy group link"}
          </Button>
          <LinkButton variant="quiet" href={href.verify(ledger.created.txHash, created)}>
            Creation proof
          </LinkButton>
        </div>
      </div>

      <div className={s.cols}>
        <div className={s.main}>
          <section className={s.section} aria-labelledby="bal">
            <h2 id="bal">Who owes whom</h2>
            <div className={cardClass}>
              <Balances ledger={ledger} me={me} />
            </div>
          </section>

          <section className={s.section} aria-labelledby="exp">
            <h2 id="exp">Expenses</h2>
            <div className={cardClass}>
              {expenses.length === 0 ? (
                <EmptyLedger />
              ) : (
                <ul className={s.ledger}>
                  {expenses.map((e, i) => (
                    <li key={i} className={s.entry}>
                      <span className={s.label}>{e.label}</span>
                      <span className={s.money}>{usdc(e.amount)}</span>
                      <span className={s.sub}>
                        paid by {labelFor(e.payer, names, me)} · split {e.participants.length} {e.participants.length === 1 ? "way" : "ways"}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </section>

          {byTx.size > 0 && (
            <section className={s.section} aria-labelledby="done">
              <h2 id="done">Settled so far</h2>
              <div className={cardClass}>
                <ul className={s.settled}>
                  {[...byTx.entries()].map(([hash, legs]) => (
                    <li key={hash} className={s.settledRow}>
                      <span>
                        {legs.map((l) => `${labelFor(l.from, names, me)} paid ${labelFor(l.to, names, me)} ${usdc(l.amount)}`).join(" · ")}
                      </span>
                      <a href={href.verify(hash, created)}>Verify {shortHash(hash)}</a>
                    </li>
                  ))}
                </ul>
              </div>
            </section>
          )}

          {ledger.rejected.length > 0 && (
            <details className={s.ignored}>
              <summary>{plural(ledger.rejected.length, "memo")} under this group id {ledger.rejected.length === 1 ? "was" : "were"} ignored</summary>
              <ul>
                {ledger.rejected.map((r, i) => (
                  <li key={i}>
                    {r.reason}:{" "}
                    <a href={txUrl(r.entry.txHash)} target="_blank" rel="noopener noreferrer">
                      {shortHash(r.entry.txHash)}
                    </a>
                  </li>
                ))}
              </ul>
            </details>
          )}
        </div>

        <aside className={s.aside} aria-label="Actions">
          <section className={`${cardClass} ${s.settleCard}`} aria-labelledby="settle-h">
            <h2 id="settle-h">Settle up</h2>
            {plan.length === 0 ? (
              <>
                <p className={s.big}>Everyone is square.</p>
                <p className={s.mutedText}>{ledger.expenses.length === 0 ? "Nothing has been spent yet." : "Every balance is zero."}</p>
              </>
            ) : (
              <>
                <p className={s.big} aria-label={`${debts.length} open debts become ${plan.length} transfers`}>
                  {debts.length} <span>{debts.length === 1 ? "debt" : "debts"} →</span> {plan.length} <span>{plan.length === 1 ? "transfer" : "transfers"}</span>
                </p>
                <p className={s.mutedText}>
                  {me && myOwed.length > 0 ? `You owe ${usdc(myTotal)} USDC across ${plural(myOwed.length, "transfer")}, signed once.` : me && ledger.members.includes(me as Address) ? "You owe nothing in this plan." : "Each person who owes signs their own transfers in one batch."}
                </p>
                <LinkButton variant="primary" block href={href.settle(id, created)}>
                  Settle up
                </LinkButton>
              </>
            )}
          </section>

          <AddExpense ledger={ledger} id={id} me={me} onLogged={(block) => reload(block)} />
        </aside>
      </div>
    </>
  );
}

export function Group({ id, from }: { id: string; from?: bigint }) {
  return <GroupGate id={id} from={from}>{(g, reload, refreshing) => <GroupView id={id} ledger={g.ledger} reload={reload} refreshing={refreshing} />}</GroupGate>;
}
