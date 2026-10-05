import { useId, useState, type FormEvent, type ReactNode } from "react";
import { Button, Field, LinkButton, Notice, inputClass } from "../components/ui";
import { readMessage } from "../lib/errors";
import { useGroup, type LoadedGroup } from "../lib/group";
import { href, navigate } from "../lib/router";
import s from "./GroupGate.module.css";

/** Loads a group and owns its loading, error and not-found states, so Group and Settle only handle the loaded case. */
export function GroupGate({ id, from, children }: { id: string; from?: bigint; children: (g: LoadedGroup, reload: (minHead?: bigint) => void, refreshing: boolean) => ReactNode }) {
  const [state, reload] = useGroup(id, from);
  const fromId = useId();
  const [block, setBlock] = useState("");
  const [blockErr, setBlockErr] = useState<string | null>(null);

  if (state.status === "loading") {
    return (
      <div className={s.skeleton} aria-busy="true">
        <div className={s.skHead} />
        <div className={s.skBody}>
          <div className={s.skBlock} />
          <div className={s.skBlock} />
        </div>
        <p className={s.progress} role="status">
          {state.progress ?? "Reading the chain"}
          {from === undefined ? ". No creation block in this link, so I scan back from the latest block." : "."}
        </p>
      </div>
    );
  }

  if (state.status === "error") {
    return (
      <div className={s.empty}>
        <Notice tone="error" title="Could not read the chain">
          {readMessage(state.error)}
        </Notice>
        <div>
          <Button variant="secondary" onClick={() => reload()}>
            Try again
          </Button>
        </div>
      </div>
    );
  }

  if (state.data === null) {
    const submit = (e: FormEvent) => {
      e.preventDefault();
      if (!/^\d{1,12}$/.test(block.trim())) return setBlockErr("A block number has digits only.");
      setBlockErr(null);
      navigate(href.group(id, BigInt(block.trim())));
    };
    return (
      <div className={s.empty}>
        <h1>No group found</h1>
        <p>
          I found no creation memo for <span className="mono">{id}</span> {from === undefined ? "in the last 400,000 blocks (about two days)" : `from block ${from.toLocaleString("en-US")} to the latest`}. Check the id for a typo. If the group is older, open it with the block it was created in.
        </p>
        <form className={s.retry} onSubmit={submit} noValidate>
          <div className={s.fromField}>
            <Field label="Created in block" htmlFor={fromId} error={blockErr}>
              <input id={fromId} className={`${inputClass} num`} value={block} onChange={(e) => setBlock(e.target.value)} inputMode="numeric" autoComplete="off" aria-invalid={!!blockErr} />
            </Field>
          </div>
          <Button type="submit" variant="secondary">
            Scan from there
          </Button>
        </form>
        <div className={s.retry}>
          <Button variant="secondary" onClick={() => reload()}>
            Check again
          </Button>
          <LinkButton variant="quiet" href={href.home()}>
            Back to start
          </LinkButton>
        </div>
      </div>
    );
  }

  return <>{children(state.data, reload, !!state.refreshing)}</>;
}
