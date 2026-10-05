# Voiceover script

About two minutes at an unhurried pace, roughly 280 words. The beats match the steps in [demo.md](demo.md). Read it in your own voice and change any line you would not say out loud. Pause where the screen is doing the work.

Nothing here is a claim the repository does not back with a transaction or a command. If you change a number, check it against README.md first.

---

**1. Landing page (0:00 to 0:15)**

Anyone who has split a trip knows how it ends. Five people, a dozen small payments, and a group chat arguing over who owes whom.

This is Tab. It keeps the group's tab on Arc, and it settles it with a signature. The receipt on screen is a real settlement from mainnet.

**2. The demo group (0:15 to 0:35)**

Here is a group with four people and four expenses. Dinner, a taxi, museum tickets, coffee.

There is no database behind this page. Every expense is a memo event on Arc, and the page rebuilds the group by reading those events.

**3. The netting (0:35 to 1:05)**

Now the part that matters. Five debts between four people. I press preview.

Tab nets them. Instead of five payments, it needs three. Those three go out in one Multicall3From batch, and each transfer carries its own memo. That works because Arc keeps the sender intact through the batch, so the money leaves the signer's own wallet.

Each person who owes signs once, for everything they owe. In this group one person owes all three, so one signature covers it.

**4. Verify (1:05 to 1:35)**

I don't want you to trust the screen, so here is the check.

I paste the transaction hash into the verify page. It reads that one transaction, then rebuilds the group from chain logs. For every transfer it asks three things. Does the memo match the transfer it names? Did that transfer happen in this transaction? And does the rebuilt group accept it?

All three pass. Verified: three transfers, one signature.

**5. Terminal (1:35 to 1:50)**

The same check runs without the website. One command, no wallet, and it ends with verified. For a transaction that doesn't check out, it exits with an error.

**6. Close (1:50 to 2:05)**

No server, no accounts, nobody holding the money. Memo and Multicall3From do the work, and the chain keeps the record.

It is a prototype. It has not been audited, so use small amounts. The code, and a proof for every claim, is on GitHub.

---

## Notes for the read

- Say "Multicall3From" as "multicall three from".
- Do not add adjectives such as seamless, powerful or revolutionary. Beats 3 and 4 already show the point.
- If beat 3 runs long because the animation is slow, cut the sentence "That works because Arc keeps the sender intact through the batch" and keep the rest.
- Beat 6 says "prototype" and "not audited" on purpose. A reviewer who sees that sentence trusts the other claims more.
- If you record the optional live settle from demo.md, add after beat 3: "Now I do it for real with my own wallet." Then narrate only what you do: the fee shown before signing, the signature, the Final stamp.
