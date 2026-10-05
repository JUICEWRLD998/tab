# Security

Tab holds no funds and no keys. It builds transactions that a user's own wallet signs, and it reads public chain data. The code has not had an external audit.

## Reporting a problem

Open an issue on this repository for anything that is not a vulnerability. For a vulnerability that could cost a user money or let a stranger forge a ledger entry, do not post the details in a public issue. Open a minimal issue that says you have a security report, and the author will arrange a private channel.

## What counts as in scope

- A way for a non-member to add an expense or a settled payment to a group that the ledger accepts.
- A settle batch that pays someone other than the legs shown on the settle screen.
- A way to make the verify page report "Verified" for a transaction that did not make the transfers it names.
- Any path where the app asks a wallet to sign something the screen did not describe.

## Known and accepted

- Memos are public, so group data is readable by anyone who knows the group id, and anyone can post noise under it. The reader rejects noise. See "Trust rules" in the README.
- A hand-chosen group id can be claimed first by someone else. The app generates random ids.
- The RPC endpoint is a third party. A malicious RPC could lie to the reader, which is why the verify page is a read-only check you can repeat against any Arc RPC with `npm run verify`.
