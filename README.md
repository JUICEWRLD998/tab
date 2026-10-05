# Tab

Log what the group spent, then settle everyone with one signature.

Tab is a serverless group expense ledger on Arc mainnet. Each expense is a `Memo` event.
Settlement is one netted `Multicall3From` batch. No server, no account system, no custody contract.

Status: core, chain layer, mainnet settle, the verify page and the web app (run locally) are **LIVE**. A hosted URL is **NOT LIVE** yet. See CLAIMS.md.

Run it: `npm install && npm run build -w @tab/web && npm run preview -w @tab/web`, then open http://localhost:4173. Open the demo group, press "Preview the netting".

Mustapha Fadhlullah — independent security researcher
