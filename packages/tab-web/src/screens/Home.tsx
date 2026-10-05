import { useId, useState, type FormEvent } from "react";
import { txUrl } from "@tab/chain";
import { Receipt } from "../components/Receipt";
import { Button, Field, LinkButton, inputClass } from "../components/ui";
import { demo, proof } from "../data/proof";
import { isHash, shortAddr, shortHash, usdc } from "../lib/format";
import { href, navigate } from "../lib/router";
import s from "./Home.module.css";

function OpenGroup() {
  const idId = useId();
  const blockId = useId();
  const [id, setId] = useState("");
  const [block, setBlock] = useState("");
  const [err, setErr] = useState<{ id?: string; block?: string }>({});

  function submit(e: FormEvent) {
    e.preventDefault();
    const next: typeof err = {};
    const cleanId = id.trim();
    if (!cleanId) next.id = "Enter the group id from the link you were sent.";
    if (block.trim() && !/^\d{1,12}$/.test(block.trim())) next.block = "A block number has digits only.";
    setErr(next);
    if (next.id || next.block) return;
    navigate(href.group(cleanId, block.trim() ? BigInt(block.trim()) : undefined));
  }

  return (
    <form className={s.panel} onSubmit={submit} noValidate>
      <h2>Open a group</h2>
      <p>Paste the group id. If the group is more than a few hours old, add the block it was created in; a shared link already carries it.</p>
      <div className={`${s.row} ${s.rowSplit}`}>
        <Field label="Group id" htmlFor={idId} error={err.id}>
          <input id={idId} className={inputClass} value={id} onChange={(e) => setId(e.target.value)} autoComplete="off" autoCapitalize="off" spellCheck={false} aria-invalid={!!err.id} aria-describedby={err.id ? `${idId}-err` : undefined} />
        </Field>
        <Field label="Created in block (optional)" htmlFor={blockId} error={err.block}>
          <input id={blockId} className={`${inputClass} num`} value={block} onChange={(e) => setBlock(e.target.value)} inputMode="numeric" autoComplete="off" aria-invalid={!!err.block} aria-describedby={err.block ? `${blockId}-err` : undefined} />
        </Field>
      </div>
      <div>
        <Button type="submit" variant="secondary">
          Open group
        </Button>
      </div>
    </form>
  );
}

function VerifyBox() {
  const id = useId();
  const [hash, setHash] = useState("");
  const [err, setErr] = useState<string | null>(null);

  function submit(e: FormEvent) {
    e.preventDefault();
    const h = hash.trim();
    if (!isHash(h)) return setErr("A transaction hash is 0x followed by 64 hex characters.");
    setErr(null);
    navigate(href.verify(h));
  }

  return (
    <form className={s.panel} onSubmit={submit} noValidate>
      <h2>Check a payment</h2>
      <p>Paste a settlement transaction hash. Tab rebuilds the group from the chain and checks every leg against the transfers the transaction actually made.</p>
      <Field label="Transaction hash" htmlFor={id} error={err}>
        <input id={id} className={`${inputClass} mono`} value={hash} onChange={(e) => setHash(e.target.value)} autoComplete="off" autoCapitalize="off" spellCheck={false} placeholder="0x…" aria-invalid={!!err} aria-describedby={err ? `${id}-err` : undefined} />
      </Field>
      <div>
        <Button type="submit" variant="secondary">
          Verify
        </Button>
      </div>
    </form>
  );
}

export function Home() {
  const total = proof.legs.reduce((a, l) => a + l.amount, 0n);
  return (
    <>
      <section className={s.hero} aria-labelledby="hero-title">
        <div className={s.copy}>
          <h1 id="hero-title" className={s.title}>
            Settle the whole group in one signature.
          </h1>
          <p className={s.lede}>Tab keeps a shared tab on Arc. Everyone logs what they paid, Tab nets the debts, and each person who owes signs once. No server, no account, nobody holding the money.</p>
          <div className={s.actions}>
            <LinkButton variant="primary" href={href.group(demo.id, demo.from)}>
              Open the demo group
            </LinkButton>
            <LinkButton variant="secondary" href={href.new()}>
              Start a group
            </LinkButton>
            <LinkButton variant="quiet" href={href.verify(proof.hash, proof.createdBlock)}>
              See a settled one
            </LinkButton>
          </div>
          <p className={s.proofLine}>
            Live on Arc mainnet: {proof.legs.length} transfers, one signature, block <span className="num">{proof.blockNumber.toLocaleString("en-US")}</span>.{" "}
            <a href={txUrl(proof.hash)} target="_blank" rel="noopener noreferrer">
              View the transaction
            </a>
          </p>
        </div>
        <div className={s.receiptWrap}>
          <Receipt
            heading="Tab · Settled"
            sub={`${proof.groupName} · ${proof.members} people · ${proof.expenses} expenses`}
            lines={proof.legs.map((l, i) => ({ id: String(i), left: `${shortAddr(l.from)} → ${shortAddr(l.to)}`, right: usdc(l.amount) }))}
            totalLabel={`${proof.legs.length} transfers, 1 signature`}
            totalValue={`${usdc(total)} USDC`}
            meta={[
              { k: "Tx", v: shortHash(proof.hash) },
              { k: "Block", v: proof.blockNumber.toLocaleString("en-US") },
              { k: "Network", v: "Arc mainnet" },
            ]}
            barcodeSeed={proof.hash}
            stamped
          />
        </div>
      </section>

      <section className={s.panels} aria-label="Open or check">
        <OpenGroup />
        <VerifyBox />
      </section>

      <section className={s.how} aria-labelledby="how">
        <h2 id="how">How a tab works</h2>
        <ol className={s.steps}>
          <li className={s.step}>
            <h3>Log</h3>
            <p>Whoever pays logs the expense. It is one Memo event on Arc, written from their own wallet, so nobody can claim they paid for someone else.</p>
          </li>
          <li className={s.step}>
            <h3>Net</h3>
            <p>Tab folds the events into balances and finds the fewest transfers that clear everyone: never more than one fewer than the number of people in the group.</p>
          </li>
          <li className={s.step}>
            <h3>Sign</h3>
            <p>Each person who owes signs one batch. Every transfer carries its own memo, so the settlement reads on the explorer and the Verify page can rebuild it from the chain alone.</p>
          </li>
        </ol>
      </section>
    </>
  );
}
