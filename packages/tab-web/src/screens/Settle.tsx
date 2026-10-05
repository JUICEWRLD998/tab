import { legsFor, preflightSettle, settle, txUrl, type Preflight } from "@tab/chain";
import type { Address, Ledger, Transfer } from "@tab/core";
import { m } from "motion/react";
import { useEffect, useMemo, useRef, useState } from "react";
import { Receipt, type ReceiptLine } from "../components/Receipt";
import { Button, LinkButton, Notice, cardClass, cx } from "../components/ui";
import { pub } from "../lib/chain";
import { plural, shortHash, usdc } from "../lib/format";
import { debtsOf, planOf } from "../lib/group";
import { dur, ease } from "../lib/motion";
import { labelFor, useNames } from "../lib/names";
import { href } from "../lib/router";
import { useAsync } from "../lib/useAsync";
import { connect, useWallet, walletMessage } from "../lib/wallet";
import { GroupGate } from "./GroupGate";
import s from "./Settle.module.css";

type Phase = "idle" | "netting" | "netted" | "checking" | "signing" | "done" | "error";

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));
const reduced = () => typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

/** Fee and blocklist check for the wallet's own legs, shown before anyone clicks. */
function FeeLine({ me, id, legs, onResult }: { me: Address; id: string; legs: Transfer[]; onResult: (p: Preflight | null) => void }) {
  const key = `${me}|${legs.map((l) => `${l.to}:${l.amount}`).join(",")}`;
  const [state] = useAsync(key, () => preflightSettle(pub, me, id, legs));
  const cb = useRef(onResult);
  cb.current = onResult;
  useEffect(() => {
    cb.current(state.status === "ok" ? state.data : null);
  }, [state]);
  if (state.status === "loading") return <p className={s.line}>Estimating the network fee…</p>;
  if (state.status === "error") return <Notice tone="warn" title="Could not estimate the fee">{state.error.message.split("\n")[0]}. You can still try to settle.</Notice>;
  if (state.data.short)
    return (
      <Notice tone="error" title="This wallet cannot cover the batch">
        It holds {usdc(state.data.short.balance)} USDC and the transfers plus the network fee need about {usdc(state.data.short.needed)} USDC. Add USDC on Arc, or pay part of it another way.
      </Notice>
    );
  if (!state.data.ok)
    return (
      <Notice tone="error" title="A recipient is blocklisted">
        USDC will not send to {state.data.blocked.map((a) => a.slice(0, 8) + "…").join(", ")}. Pay that person directly, outside Tab; the batch would burn gas and fail.
      </Notice>
    );
  return <p className={s.line}>Network fee about {usdc(state.data.feeUsdc)} USDC for the whole batch.</p>;
}

function SettleView({ id, ledger, reload }: { id: string; ledger: Ledger; reload: (minHead?: bigint) => void }) {
  const wallet = useWallet();
  const names = useNames();
  const me = wallet.status === "connected" ? wallet.address : null;
  const created = ledger.created.blockNumber;

  const live = useMemo(() => ({ debts: debtsOf(ledger), plan: planOf(ledger) }), [ledger]);
  // Freeze what was shown when netting started, so the page does not rearrange itself when the group reloads after the settle.
  const [frozen, setFrozen] = useState<typeof live | null>(null);
  const view = frozen ?? live;
  const myLegs = me ? legsFor(view.plan, me) : [];
  const myTotal = myLegs.reduce((a, t) => a + t.amount, 0n);
  const isMember = !!me && ledger.members.includes(me);
  const others = view.plan.filter((t) => t.from !== me);

  const [phase, setPhase] = useState<Phase>("idle");
  const [struck, setStruck] = useState(false);
  const [printed, setPrinted] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<{ hash: string; block: bigint; legs: Transfer[] } | null>(null);
  const [pre, setPre] = useState<Preflight | null>(null);
  const [announce, setAnnounce] = useState("");

  const busy = phase === "netting" || phase === "checking" || phase === "signing";
  const netted = struck && printed;

  async function playNetting() {
    if (netted) return;
    setFrozen((f) => f ?? live);
    setPhase("netting");
    setAnnounce("Netting the debts.");
    if (reduced()) {
      setStruck(true);
      setPrinted(true);
    } else {
      setStruck(true); // beat 1: strikes draw, staggered
      await sleep(320);
      setPrinted(true); // beat 2: the transfers print on the receipt
      await sleep(780);
    }
    setPhase("netted");
    setAnnounce(`${plural(view.debts.length, "debt")} netted to ${plural(view.plan.length, "transfer")}.`);
  }

  async function settleNow() {
    if (wallet.status !== "connected") return void connect();
    setError(null);
    try {
      if (!netted) await playNetting();
      setPhase("checking");
      setAnnounce("Checking the transfers against the chain.");
      const pf = await preflightSettle(pub, wallet.address, id, myLegs);
      if (pf.short) throw new Error(`This wallet holds ${usdc(pf.short.balance)} USDC but the batch needs about ${usdc(pf.short.needed)}.`);
      if (!pf.ok) throw new Error(`A recipient is blocklisted (${pf.blocked.join(", ")}). Pay that person directly.`);
      setPhase("signing");
      setAnnounce("Confirm in your wallet. One signature pays your transfers.");
      const tx = await settle(pub, wallet.client, id, myLegs);
      setResult({ hash: tx.hash, block: tx.blockNumber, legs: myLegs });
      setPhase("done");
      setAnnounce(`Settled and final in block ${tx.blockNumber.toLocaleString("en-US")}.`);
      reload(tx.blockNumber);
    } catch (e) {
      setError(walletMessage(e));
      setPhase("error");
      setAnnounce("Nothing was sent.");
    }
  }

  const toLine = (t: Transfer, i: number, mine: boolean): ReceiptLine => ({
    id: `${t.from}-${t.to}-${i}`,
    left: `${labelFor(t.from, names, me)} → ${labelFor(t.to, names, me)}`,
    right: usdc(t.amount),
    mine,
  });

  if (live.plan.length === 0 && !frozen) {
    return (
      <div className={s.square}>
        <h2>Everyone is square.</h2>
        <p>{ledger.settled.length > 0 ? "Every balance in this group is zero. The settlements are on chain." : "Nothing is owed yet."}</p>
        <LinkButton variant="secondary" href={href.group(id, created)}>
          Back to the group
        </LinkButton>
      </div>
    );
  }

  const done = phase === "done" && result;
  const receiptLines = done ? result.legs.map((t, i) => toLine(t, i, true)) : view.plan.map((t, i) => toLine(t, i, t.from === me));
  const receiptTotal = (done ? result.legs : view.plan).reduce((a, t) => a + t.amount, 0n);
  const saved = view.debts.length - view.plan.length;

  return (
    <>
      <div className={s.head}>
        <a className={s.back} href={href.group(id, created)}>
          ← {ledger.name}
        </a>
        <h1 className={s.title}>Settle up</h1>
      </div>

      <div className={s.stage}>
        <section className={cx(cardClass, s.before)} aria-labelledby="debts-h">
          <div className={s.beforeHead}>
            <h2 id="debts-h">Open debts</h2>
          </div>
          <ul className={s.debts}>
            {view.debts.map((d, i) => (
              <m.li
                key={`${d.from}-${d.to}`}
                className={cx(s.debt, struck && s.struck)}
                style={{ ["--i" as string]: i }}
                initial={false}
                animate={{ opacity: printed ? 0.4 : 1, x: printed ? 14 : 0 }}
                transition={{ duration: dur.long, ease: ease.out, delay: printed ? i * 0.03 : 0 }}
              >
                <span>
                  {labelFor(d.from, names, me)} {me && d.from === me ? "owe" : "owes"} {labelFor(d.to, names, me)}
                </span>
                <span className={s.amt}>{usdc(d.amount)}</span>
              </m.li>
            ))}
          </ul>
        </section>

        <div className={s.arrow} aria-hidden="true">
          <svg viewBox="0 0 52 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <m.path d="M2 12h46M40 4l8 8-8 8" initial={false} animate={{ pathLength: printed ? 1 : 0.08, opacity: printed ? 1 : 0.5 }} transition={{ duration: dur.long, ease: ease.out }} />
          </svg>
        </div>

        <div className={s.after}>
          <Receipt
            onRaised={false}
            heading={done ? "Tab · Settled" : "Tab · Net transfers"}
            sub={`${ledger.name} · ${plural(ledger.members.length, "person", "people")}`}
            lines={receiptLines}
            totalLabel={done ? `${plural(result.legs.length, "transfer")}, 1 signature` : `${plural(view.plan.length, "transfer")}`}
            totalValue={`${usdc(receiptTotal)} USDC`}
            meta={done ? [{ k: "Tx", v: shortHash(result.hash) }, { k: "Block", v: result.block.toLocaleString("en-US") }, { k: "Network", v: "Arc mainnet" }] : [{ k: "Network", v: "Arc mainnet" }]}
            barcodeSeed={done ? result.hash : undefined}
            printed={printed || phase === "done"}
            stamped={!!done}
          />
        </div>
      </div>

      <div className={s.bar}>
        <p className={s.tally}>
          <span className={netted ? s.old : undefined}>{plural(view.debts.length, "debt")}</span>
          {netted && (
            <m.span className={s.new} initial={{ opacity: 0, x: -8 }} animate={{ opacity: 1, x: 0 }} transition={{ duration: dur.short, ease: ease.out }}>
              <span className={s.gap}>→</span>
              {plural(view.plan.length, "transfer")}
            </m.span>
          )}
        </p>
        {netted && saved > 0 && <p className={s.line}>{plural(saved, "payment")} fewer than paying each debt on its own.</p>}
        <p className="sr-only" role="status" aria-live="polite">
          {announce}
        </p>

        {me && myLegs.length > 0 && phase !== "done" && <FeeLine me={me} id={id} legs={myLegs} onResult={setPre} />}
        {me && !isMember && <Notice tone="warn" title="Not in this group">This wallet is not a member, so it has nothing to settle here. You can still preview the netting.</Notice>}
        {isMember && myLegs.length === 0 && phase !== "done" && (
          <Notice tone="info" title="You owe nothing in this plan">
            {others.length > 0 ? `Each transfer is signed by the person who owes it, from their own wallet: ${[...new Set(others.map((t) => labelFor(t.from, names, me)))].join(", ")}.` : "There is nothing left to sign."}
          </Notice>
        )}
        {me && myLegs.length > 0 && others.length > 0 && phase !== "done" && (
          <p className={s.line}>
            You sign {plural(myLegs.length, "transfer")} ({usdc(myTotal)} USDC). The other {plural(others.length, "transfer")} {others.length === 1 ? "is" : "are"} signed by {[...new Set(others.map((t) => labelFor(t.from, names, me)))].join(", ")}.
          </p>
        )}
        {phase === "error" && error && <Notice tone="error" title="Nothing was sent">{error}</Notice>}
        {phase === "signing" && <Notice tone="info" title="Confirm in your wallet">One signature pays {plural(myLegs.length, "transfer")}, each with its own memo.</Notice>}

        {done ? (
          <>
            <Notice tone="ok" title="Settled and final">
              Block {result.block.toLocaleString("en-US")}.{" "}
              <a href={txUrl(result.hash)} target="_blank" rel="noopener noreferrer">
                View on the explorer
              </a>
            </Notice>
            {others.length > 0 && (
              <p className={s.line}>
                {plural(others.length, "transfer")} still to go, signed by {[...new Set(others.map((t) => labelFor(t.from, names, me)))].join(", ")}.
              </p>
            )}
            <div className={s.done}>
              <LinkButton variant="primary" href={href.verify(result.hash, created)}>
                Verify this settlement
              </LinkButton>
              <LinkButton variant="secondary" href={href.group(id, created)}>
                Back to the group
              </LinkButton>
            </div>
          </>
        ) : (
          <div className={s.actions}>
            <Button
              onClick={() => void settleNow()}
              loading={phase === "netting" || phase === "checking" || phase === "signing"}
              disabled={busy || (me !== null && (myLegs.length === 0 || (pre !== null && !pre.ok)))}
            >
              {phase === "signing" ? "Waiting for your wallet" : phase === "checking" ? "Checking transfers" : phase === "netting" ? "Netting" : !me ? "Connect wallet to settle" : myLegs.length === 0 ? "Nothing for you to sign" : phase === "error" ? "Try again" : `Settle my ${plural(myLegs.length, "transfer")}`}
            </Button>
            {!netted && (
              <Button variant="secondary" onClick={() => void playNetting()} disabled={busy}>
                Preview the netting
              </Button>
            )}
          </div>
        )}
      </div>
    </>
  );
}

export function Settle({ id, from }: { id: string; from?: bigint }) {
  return <GroupGate id={id} from={from}>{(g, reload) => <SettleView key={id} id={id} ledger={g.ledger} reload={reload} />}</GroupGate>;
}
