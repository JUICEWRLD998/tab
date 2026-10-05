# Demo plan

A screen recording of about two minutes. The voiceover script is in [voiceover.md](voiceover.md). Each step below has the same number as a beat in the script.

The demo needs no wallet and spends no money. Every number on screen comes from Arc mainnet.

## Before you record

1. Open the hosted app in a clean Chrome window (no other tabs, bookmarks bar hidden). Use the real URL, not localhost. In this file, `<APP>` means that URL.
2. Set the window to 1280 by 800 or a 16:9 size close to it. Use dark theme (the app follows the system setting).
3. Open a terminal in the repo folder after `npm install`, with a font large enough to read in a 1080p recording. Run `npm run verify -- 0xf0a3c947b36eaf6a8c09a064454cded790c37a141fccb50821553cbfb34463a4` once beforehand so everything is warm. Clear the screen.
4. Open these tabs in order, ready to switch to:
   - `<APP>/`
   - `<APP>/#/g/tab-1h4j301v?from=24357102` (the demo group)
   - `<APP>/#/g/tab-1h4j301v/settle?from=24357102`
   - `<APP>/#/v/0xf0a3c947b36eaf6a8c09a064454cded790c37a141fccb50821553cbfb34463a4` (the real settlement)
5. Turn off notifications. Do a dry run with the audio off to learn where the page waits for the chain (the group and verify pages take a few seconds to read the logs).

## Steps

### 1. Landing page, 0:00 to 0:15
Show `<APP>/`. Hold on the receipt on the right for a moment: it is a real settlement, with its transaction hash and block number printed on it. Do not scroll yet. Point at the line "Live on Arc mainnet: 3 transfers, one signature".

### 2. The demo group, 0:15 to 0:35
Press "Open the demo group". Wait for "Lisbon weekend" to load. Let the viewer see the four expenses and the balances. These are read from chain logs, not from a database. If you want proof, open the browser dev tools network tab for one second and show the requests go to `rpc.mainnet.arc.io`, then close it.

### 3. The netting, 0:35 to 1:05
Press "Settle up", then "Preview the netting". Do not move the mouse while it plays. The five open debts are struck through and three transfers print on the receipt. Let it finish and hold on "5 debts → 3 transfers". Then say one sentence about who signs: in this group one person owes all three payments, so one signature covers them.

### 4. Verify the real settlement, 1:05 to 1:35
Switch to the Verify tab. Wait for "Verified: 3 transfers, one signature". Scroll slowly so each leg shows its three checks: the memo hash matches the transfer, the transfer happened in this transaction, the rebuilt group accepts it. Click the explorer link once so the viewer sees the same transaction on Arc's explorer, then come back.

### 5. Same check in a terminal, 1:35 to 1:50
Switch to the terminal and run:

```
npm run verify -- 0xf0a3c947b36eaf6a8c09a064454cded790c37a141fccb50821553cbfb34463a4
```

Let it print and end on `VERIFIED: 3 transfers, one signature.` Do not speed it up.

### 6. Close, 1:50 to 2:05
Return to the landing page. Leave it still. End on the receipt with the Final stamp.

## Optional beat: a live settle with your own wallet (about 90 seconds more)

Skip this unless you want a real signature on camera. It spends real USDC: the transfers you choose plus a few thousandths of a USDC in fees.

1. Prepare two browser wallets you own, both with at least 0.1 USDC on Arc and the Arc network added.
2. Press "Start a group", name it, paste the second wallet's address, create it. Wait for "Final".
3. Log one expense from each wallet (switch accounts in the wallet between them), for example 0.04 and 0.02.
4. Open Settle up as the wallet that owes. The page shows the network fee before the prompt. Press the settle button, approve in the wallet, and let the stamp land.
5. Press "Verify this settlement" and show the verdict.

Do not use the demo group `tab-1h4j301v` for this. It is left unsettled on purpose so the preview keeps working.

## Things not to claim on camera

- Do not say "one signature settles the whole group" without the qualifier. Each person who owes signs once for all of their own payments. The demo group happens to have one debtor.
- Do not say it is audited. It has not been.
- Do not say the app is fast on slow networks. The measured numbers are from a local, unthrottled run.
- Do not call the wallets customers or users. They are throwaway wallets the builder controls.

## Checklist after recording

- The hash on the Verify page starts `0xf0a3c947` and ends `63a4`.
- No address or key from your own personal wallets is visible in the recording.
- The terminal shows `VERIFIED`.
- The video is under three minutes.
