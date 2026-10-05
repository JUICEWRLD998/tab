import { txUrl, verifyTx, type TxVerification } from "@tab/chain";
import { type TabMemo } from "@tab/core";
import { useId, useState, type FormEvent, type ReactNode } from "react";
import { Receipt } from "../components/Receipt";
import { Button, Field, LinkButton, Notice, inputClass } from "../components/ui";
import { proof } from "../data/proof";
import { pub } from "../lib/chain";
import { isHash, plural, shortAddr, shortHash, usdc } from "../lib/format";
import { labelFor, useNames } from "../lib/names";
import { href, navigate } from "../lib/router";
import { useAsync } from "../lib/useAsync";
import { useWallet } from "../lib/wallet";
import s from "./Verify.module.css";

function Check({ ok, children }: { ok: boolean; children: ReactNode }) {
  return (
    <li className={`${s.check} ${ok ? s.pass : s.fail}`}>
      <span className={s.glyph} aria-hidden="true">
        {ok ? "✓" : "✕"}
      </span>
      <span>
        <span className="sr-only">{ok ? "Passed: " : "Failed: "}</span>
        {children}
      </span>
    </li>
  );
}

function describeMemo(m: TabMemo, label: (a: string) => string): string {
  if (m.kind === "group") return `Created the group "${m.name}" with ${plural(m.members.length, "member")}.`;
  if (m.kind === "expense") return `${label(m.payer)} logged "${m.label}", ${usdc(m.amount)} USDC split ${m.participants.length} ${m.participants.length === 1 ? "way" : "ways"}.`;
  return `${label(m.from)} paid ${label(m.to)} ${usdc(m.amount)} USDC.`;
}

function Result({ hash, from }: { hash: `0x${string}`; from?: bigint }) {
  const names = useNames();
  const wallet = useWallet();
  const me = wallet.status === "connected" ? wallet.address : null;
  const label = (a: string) => labelFor(a, names, me);
  const [state] = useAsync(`${hash}|${from ?? ""}`, (progress) => verifyTx(pub, hash, { fromBlock: from, onProgress: progress }));
  const rescanId = useId();
  const [block, setBlock] = useState("");
  const [blockErr, setBlockErr] = useState<string | null>(null);

  if (state.status === "loading")
    return (
      <div className={s.skeleton} aria-busy="true">
        <div className={s.skBlock} />
        <p className={s.progress} role="status">
          {state.progress ?? "Reading the transaction"}…
        </p>
      </div>
    );

  if (state.status === "error") {
    const msg = state.error.message.split("\n")[0] ?? "";
    const notFound = /not be found|could not be found|not found/i.test(state.error.message) || state.error.name === "TransactionReceiptNotFoundError";
    return (
      <Notice tone="error" title={notFound ? "No such transaction" : "Could not verify"}>
        {notFound ? "Arc mainnet has no transaction with this hash. Check it for a typo." : msg}
      </Notice>
    );
  }

  const v: TxVerification = state.data;
  const ledger = v.ledger;
  const settle = v.legs.length > 0;
  const legOk = (i: number) => v.legs[i]!.hashMatches && v.legs[i]!.transferSeen;
  const acceptedLeg = (i: number) => !!ledger && ledger.settled.some((x) => x.txHash === v.hash && x.from === v.legs[i]!.from && x.to === v.legs[i]!.to && x.amount === v.legs[i]!.amount);
  const verified = settle && !!ledger && v.legs.every((_, i) => legOk(i) && acceptedLeg(i));
  const signers = new Set(v.legs.map((l) => l.from));
  const total = v.legs.reduce((a, l) => a + l.amount, 0n);
  const rejectedHere = ledger ? ledger.rejected.filter((r) => r.entry.txHash === v.hash) : [];
  const acceptedMemo = (logIndex: number) => !!ledger && !rejectedHere.some((r) => r.entry.logIndex === logIndex);

  const rescan = (e: FormEvent) => {
    e.preventDefault();
    if (!/^\d{1,12}$/.test(block.trim())) return setBlockErr("A block number has digits only.");
    setBlockErr(null);
    navigate(href.verify(hash, BigInt(block.trim())));
  };

  let tone = s.ok;
  let headline = "";
  let detail: ReactNode = null;
  if (!ledger) {
    tone = s.warn;
    headline = "Group not found in the scanned blocks";
    detail = `The transaction is real, but its group's creation memo is not between block ${v.scannedFrom.toLocaleString("en-US")} and the latest, so the memos cannot be checked against the member list. Scan further back with the block the group was created in.`;
  } else if (settle && verified) {
    headline = `Verified: ${plural(v.legs.length, "transfer")}, ${signers.size === 1 ? "one signature" : plural(signers.size, "signer")}`;
    detail = `Each transfer matches its memo, was made in this transaction, and is accepted by the group rebuilt from the chain.`;
  } else if (settle) {
    tone = s.bad;
    headline = "Not verified";
    detail = "At least one transfer failed a check below. The rebuilt balances do not count it.";
  } else if (v.facts.memos.every((m) => acceptedMemo(m.logIndex))) {
    headline = "Recorded on chain";
    detail = "This transaction logs group events, and the rebuilt group accepts every memo in it.";
  } else {
    tone = s.bad;
    headline = "Ignored by the ledger";
    detail = "This transaction posted memos under the group id, but the trust rules reject at least one. See the reasons below.";
  }

  return (
    <div className={s.wrap}>
      <section className={`${s.verdict} ${tone}`} role="status" aria-labelledby="verdict-h">
        <h2 id="verdict-h">{headline}</h2>
        <p>{detail}</p>
      </section>

      {!ledger && (
        <form className={s.rescan} onSubmit={rescan} noValidate>
          <div className={s.rescanField}>
            <Field label="Group created in block" htmlFor={rescanId} error={blockErr}>
              <input id={rescanId} className={`${inputClass} num`} value={block} onChange={(e) => setBlock(e.target.value)} inputMode="numeric" autoComplete="off" aria-invalid={!!blockErr} />
            </Field>
          </div>
          <Button type="submit" variant="secondary">
            Scan from there
          </Button>
        </form>
      )}

      <div className={s.cols}>
        <div className={s.evidence}>
          {settle ? (
            <section aria-labelledby="legs-h" className={s.evidence}>
              <h3 id="legs-h">What the transaction did</h3>
              {v.legs.map((l, i) => (
                <article key={l.logIndex} className={s.leg}>
                  <div className={s.legTitle}>
                    <span>
                      {label(l.from)} → {label(l.to)}
                    </span>
                    <span>{usdc(l.amount)} USDC</span>
                  </div>
                  <ul className={s.checks}>
                    <Check ok={l.hashMatches}>The memo's call-data hash equals keccak256 of USDC.transfer(recipient, amount).</Check>
                    <Check ok={l.transferSeen}>This transaction emitted a 6-decimal USDC Transfer from the same sender to the same recipient for the same amount.</Check>
                    <Check ok={acceptedLeg(i)}>{ledger ? "The rebuilt group counts it: the sender is a member and paid from their own wallet." : "Cannot be checked until the group is found."}</Check>
                  </ul>
                </article>
              ))}
            </section>
          ) : (
            <section aria-labelledby="memos-h" className={s.evidence}>
              <h3 id="memos-h">Memos in this transaction</h3>
              <div className={s.leg}>
                {v.facts.memos.map((m) => (
                  <div key={m.logIndex} className={s.memoRow}>
                    <span>{m.memo ? describeMemo(m.memo, label) : "A memo that is not in Tab's format."}</span>
                    <ul className={s.checks}>
                      <Check ok={acceptedMemo(m.logIndex)}>{acceptedMemo(m.logIndex) ? "Accepted by the rebuilt group." : (rejectedHere.find((r) => r.entry.logIndex === m.logIndex)?.reason ?? "Cannot be checked until the group is found.")}</Check>
                    </ul>
                  </div>
                ))}
              </div>
            </section>
          )}

          {ledger && (
            <section aria-labelledby="group-h" className={s.evidence}>
              <h3 id="group-h">The group, rebuilt from the chain</h3>
              <dl className={s.facts}>
                <div>
                  <dt>Group</dt>
                  <dd>{ledger.name}</dd>
                </div>
                <div>
                  <dt>Members</dt>
                  <dd>{ledger.members.length}</dd>
                </div>
                <div>
                  <dt>Expenses</dt>
                  <dd>{ledger.expenses.length}</dd>
                </div>
                <div>
                  <dt>Settled legs</dt>
                  <dd>{ledger.settled.length}</dd>
                </div>
                <div>
                  <dt>Memos ignored</dt>
                  <dd>{ledger.rejected.length}</dd>
                </div>
                <div>
                  <dt>Balances now</dt>
                  <dd>{ledger.balances.size === 0 ? "all zero" : `${ledger.balances.size} open`}</dd>
                </div>
                <div>
                  <dt>Scanned from block</dt>
                  <dd>{v.scannedFrom.toLocaleString("en-US")}</dd>
                </div>
              </dl>
            </section>
          )}

          <section aria-labelledby="own-h" className={s.evidence}>
            <h3 id="own-h">Check it without Tab</h3>
            <pre className={s.code}>{`cast receipt ${v.hash} \\\n  --rpc-url https://rpc.mainnet.arc.io`}</pre>
            <div>
              <LinkButton variant="secondary" external href={txUrl(v.hash)}>
                Open on the explorer
              </LinkButton>
            </div>
          </section>
        </div>

        {settle && (
          <div className={s.side}>
            <Receipt
              heading={verified ? "Tab · Verified" : "Tab · Transfers"}
              sub={ledger ? ledger.name : "Group not found"}
              lines={v.legs.map((l, i) => ({ id: String(i), left: `${shortAddr(l.from)} → ${shortAddr(l.to)}`, right: usdc(l.amount) }))}
              totalLabel={`${plural(v.legs.length, "transfer")}, ${plural(signers.size, "signature")}`}
              totalValue={`${usdc(total)} USDC`}
              meta={[
                { k: "Tx", v: shortHash(v.hash) },
                { k: "Block", v: v.blockNumber.toLocaleString("en-US") },
                { k: "Signer", v: shortAddr(v.signer) },
              ]}
              barcodeSeed={v.hash}
              stamped={verified}
              stampText="Verified"
            />
          </div>
        )}
      </div>
    </div>
  );
}

export function Verify({ hash, from }: { hash?: string; from?: bigint }) {
  const inputId = useId();
  const [value, setValue] = useState(hash ?? "");
  const [err, setErr] = useState<string | null>(null);
  const valid = hash && isHash(hash) ? (hash as `0x${string}`) : null;

  function submit(e: FormEvent) {
    e.preventDefault();
    const h = value.trim();
    if (!isHash(h)) return setErr("A transaction hash is 0x followed by 64 hex characters.");
    setErr(null);
    navigate(href.verify(h));
  }

  return (
    <div className={s.wrap}>
      <div className={s.head}>
        <h1 className={s.title}>Verify a settlement</h1>
        <p className={s.lede}>Paste a transaction hash. This page rebuilds the group from the chain and checks every transfer against what the transaction really did. It uses no stored data and trusts no server.</p>
      </div>
      <form className={s.form} onSubmit={submit} noValidate>
        <div className={s.formRow}>
          <Field label="Transaction hash" htmlFor={inputId} error={err ?? (hash && !valid ? "That is not a transaction hash." : null)}>
            <input id={inputId} className={`${inputClass} mono`} value={value} onChange={(e) => setValue(e.target.value)} autoComplete="off" autoCapitalize="off" spellCheck={false} placeholder="0x…" aria-invalid={!!err || (!!hash && !valid)} />
          </Field>
          <Button type="submit">Verify</Button>
        </div>
        {!hash && (
          <p className={s.lede}>
            No transaction in hand? <a href={href.verify(proof.hash, proof.createdBlock)}>Verify the {proof.legs.length}-transfer settlement from the landing page</a>.
          </p>
        )}
      </form>
      {valid && <Result key={`${valid}|${from ?? ""}`} hash={valid} from={from} />}
    </div>
  );
}
