# ReliefOS — demo run book

## Before you record

1. `npm run dev`, open two browser windows side by side:
   - **A**: `/command`, signed in as `coordinator@reliefos.com`
   - **B**: `/responder`, signed in as `responder@reliefos.com`
2. In window A press **Seed demo world**. Wait for the four background incidents to finish —
   each one makes real Featherless calls, so this takes 20–40 seconds.
3. Press **Reset** and re-seed if you want a clean run. Reset deletes every simulated row.
4. Use Chrome or Edge — voice input needs the Web Speech API. On other browsers the textarea
   posts to the same endpoint.
5. Keep the command centre tab open during Chaos Mode: the server owns the script but the tab
   is what pokes it. If you close and reopen it, the scenario catches up.
6. Run `npm run verify` once beforehand: if it passes, everything in the script below works.

## The three-minute script

| Time | What you do | What to say |
|---|---|---|
| 0:00–0:20 | Command centre, incidents on the map, queue on the right | "During an emergency the hard problem isn't receiving information. It's deciding what should happen next — and re-deciding every time something changes." |
| 0:20–0:50 | `/report`, press the mic: *"My elderly parents are trapped on the ground floor, flood water has come into the house, my father cannot walk."* | "Voice and text hit the same endpoint. The model reads the report and returns structured operational data." |
| 0:50–1:20 | Back to `/command`, open the new incident. Show **Why this priority** and the **candidate scoreboard** including who was excluded and why | "The model supplies observations. The priority score is deterministic arithmetic over those observations — reproducible and auditable. And notice it tells you who it did *not* pick, and why." |
| 1:20–1:45 | **Approve dispatch**. Window B receives the assignment. Accept it. Map draws the link line | "AI recommends. A human commits. Only then does the database change." |
| 1:45–2:30 | **Start Chaos Mode** | "Two more reports arrive. Alpha Rescue goes offline mid-assignment — watch the match invalidate and an alternative appear. Shelter capacity drops. A caller adds detail and the priority band moves. Nothing here is a frontend animation: every change is a row in Postgres pushed over Supabase Realtime." |
| 2:30–3:00 | Scroll the event timeline; optionally show the `ai_decisions` table in Supabase | "This is the audit trail: every model call, its latency, its validation status, and the decision factors behind every score. ReliefOS doesn't report what happened — it decides what should happen next, explains why, and adapts when the situation changes." |

## Manual checklist before submitting

- [ ] `npm test` — 35 passing
- [ ] `npm run test:ai` — live Featherless call returns valid JSON
- [ ] `npm run verify` — all end-to-end checks pass
- [ ] Voice report completes the full pipeline
- [ ] Approve dispatch changes state in the second window without a refresh
- [ ] Taking a responder offline invalidates their assignment and produces an alternative
- [ ] Approving an already-committed responder returns a conflict and a new recommendation
- [ ] Chaos Mode runs end to end and the queue visibly reorders
- [ ] Connection pill shows LIVE; killing the network shows RECONNECTING and recovers
- [ ] `.env.local` is not committed; `git log` shows incremental commits
- [ ] Every claim in the README is one you just watched happen

## Failure recovery during a live demo

| If | Do |
|---|---|
| Featherless is slow or down | Nothing. Incidents still flow through the deterministic fallback and show a RULE-BASED badge — narrate it as designed degradation. |
| Realtime drops | The pill turns amber and polling takes over; the console stays current. |
| Chaos Mode gets ahead of you | Press **Stop**, then walk the event timeline instead. |
| The queue is cluttered | **Reset**, then **Seed demo world**. |
