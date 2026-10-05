import { createGroup } from "@tab/chain";
import { useId, useMemo, useState, type FormEvent } from "react";
import { Button, Field, Notice, Pill, cardClass, inputClass } from "../components/ui";
import { pub } from "../lib/chain";
import { extractAddresses, newGroupId } from "../lib/format";
import { labelFor, setName, useNames } from "../lib/names";
import { href, navigate } from "../lib/router";
import { connect, useWallet, walletMessage } from "../lib/wallet";
import s from "./NewGroup.module.css";

const MAX_MEMBERS = 30;
const MAX_NAME = 40;

const ZERO = "0x0000000000000000000000000000000000000000";

export function NewGroup() {
  const wallet = useWallet();
  const names = useNames();
  const nameId = useId();
  const listId = useId();
  const [name, setGroupName] = useState("");
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [touched, setTouched] = useState(false);

  const me = wallet.status === "connected" ? wallet.address : null;

  const parsed = useMemo(() => {
    const valid = extractAddresses(text);
    // A token that starts with 0x but is not 40 hex characters is a typo worth naming, not something to skip silently.
    const bad = (text.match(/0x[0-9a-zA-Z]*/g) ?? []).filter((t) => !/^0x[0-9a-fA-F]{40}$/.test(t));
    const zero = valid.includes(ZERO);
    const members = me && !valid.includes(me) ? [me, ...valid] : valid;
    return { members, bad, zero };
  }, [text, me]);

  const nameError = touched && !name.trim() ? "Give the group a name." : touched && name.trim().length > MAX_NAME ? `Keep it under ${MAX_NAME} characters.` : null;
  const listError = parsed.zero
    ? "The zero address cannot be in a group. Remove 0x000…000."
    : parsed.bad.length > 0
      ? `${parsed.bad[0]!.slice(0, 14)}… is not a valid address (0x and 40 hex characters).`
      : touched && parsed.members.length < 2
        ? "A group needs at least two people. Paste the other addresses."
        : parsed.members.length > MAX_MEMBERS
          ? `A group holds up to ${MAX_MEMBERS} people.`
          : null;

  async function submit(e: FormEvent) {
    e.preventDefault();
    setTouched(true);
    setSubmitError(null);
    if (wallet.status !== "connected") return void connect();
    if (!name.trim() || name.trim().length > MAX_NAME || parsed.members.length < 2 || parsed.members.length > MAX_MEMBERS || parsed.bad.length || parsed.zero) return;
    setBusy(true);
    try {
      const id = newGroupId();
      const { blockNumber } = await createGroup(pub, wallet.client, id, name.trim(), parsed.members);
      navigate(href.group(id, blockNumber));
    } catch (err) {
      setSubmitError(walletMessage(err));
      setBusy(false);
    }
  }

  return (
    <div className={s.wrap}>
      <h1 className={s.title}>Start a group</h1>
      <p className={s.lede}>The group lives on Arc as one memo that lists its members. Only those addresses can add expenses or settle.</p>
      <form className={`${cardClass} ${s.form}`} onSubmit={submit} noValidate>
        <Field label="Group name" htmlFor={nameId} error={nameError}>
          <input id={nameId} className={inputClass} value={name} onChange={(e) => setGroupName(e.target.value)} maxLength={80} autoComplete="off" aria-invalid={!!nameError} aria-describedby={nameError ? `${nameId}-err` : undefined} />
        </Field>
        <Field
          label="Everyone else, by wallet address"
          htmlFor={listId}
          error={listError}
          hint={me ? "Paste addresses separated by spaces, commas or new lines. Yours is added for you." : "Paste addresses separated by spaces, commas or new lines. Connect your wallet to add yours automatically."}
        >
          <textarea id={listId} className={`${inputClass} mono`} value={text} onChange={(e) => setText(e.target.value)} spellCheck={false} autoComplete="off" autoCapitalize="off" aria-invalid={!!listError} aria-describedby={listError ? `${listId}-err` : `${listId}-hint`} />
        </Field>

        {parsed.members.length > 0 && (
          <div>
            <p className={s.count} aria-live="polite">
              {parsed.members.length} {parsed.members.length === 1 ? "person" : "people"}. Names are for you only and stay in this browser.
            </p>
            <ul className={s.people}>
              {parsed.members.map((a) => (
                <li key={a} className={s.person}>
                  <span className={s.addr}>
                    {a}
                    {a === me && (
                      <span className={s.you}>
                        <Pill tone="ok">You</Pill>
                      </span>
                    )}
                  </span>
                  <input
                    className={inputClass}
                    aria-label={`Name for ${a}`}
                    placeholder={labelFor(a, {}, null)}
                    value={names[a] ?? ""}
                    onChange={(e) => setName(a, e.target.value)}
                    maxLength={24}
                    autoComplete="off"
                  />
                </li>
              ))}
            </ul>
          </div>
        )}

        {submitError && <Notice tone="error" title="Group not created">{submitError}</Notice>}

        <div className={s.actions}>
          <Button type="submit" loading={busy}>
            {busy ? "Creating on Arc" : wallet.status === "connected" ? "Create group" : "Connect wallet to create"}
          </Button>
          <span className={s.count}>One transaction, about a tenth of a cent.</span>
        </div>
      </form>
    </div>
  );
}
