# ReliefOS — Deep Audit Report

**Date:** 2026-09-04 · **Scope:** full repository (every source, config, migration, route, component, test)
**Auditor session:** Claude (Cowork), linked to `laptop-km0q4b01`
**Purpose of this file:** handoff record so a second Claude session can resume without re-auditing.

---

## 1. OVERALL STATUS — PARTIALLY VERIFIED

Static correctness is **verified green**. Runtime behaviour is **UNVERIFIED**: the audit sandbox had no
network route to `*.supabase.co` or `api.featherless.ai` (confirmed by direct `fetch` from both the cloud
container and the device VM). Nothing runtime was claimed as tested.

> **Headline:** the production build was broken before this audit. `next build` failed on 6 TypeScript
> errors in `middleware.ts`. Fixed — the project is now deployable.

---

## 2. TOOLCHAIN RESULTS (real command output)

Run in a clean `npm install` of the repo. Not inferred.

| Gate | Before audit | After fixes |
|---|---|---|
| `tsc --noEmit` (strict) | **6 errors** | **0 errors** |
| `next lint` | **never ran** — no config existed AND disabled in build | **0 errors**, 61 warnings |
| `vitest run` | 49 passed | 49 passed |
| `next build` | **FAILED to compile** | **✓ Compiled successfully**, 8/8 pages, linting enabled |

All 61 remaining warnings are `@typescript-eslint/no-explicit-any` (pre-existing). None were added by
this audit; several were removed.

> **Note for the next session:** `npm test` cannot run inside the mounted Linux VM — `node_modules` on
> disk holds Windows binaries, so rollup's `@rollup/rollup-linux-x64-gnu` is missing. This is a sandbox
> artefact, **not** a repo defect. It runs fine on Windows. To test in a Linux container, copy the source
> (excluding `node_modules`/`.next`) and `npm install` fresh.

---

## 3. BUGS FOUND AND FIXED (13)

### Critical

**1. Build-breaking type errors** — `middleware.ts` `setAll` params implicitly `any` under `strict`.
Typed with `CookieOptions` from `@supabase/ssr`. Same latent `options?: any` removed from
`lib/supabase/server.ts`.
Files: `middleware.ts`, `lib/supabase/server.ts`

**2. Double-approve race (TOCTOU) — worst logic bug found.**
`approveDispatch` read assignment status, then wrote it. Two fast Approve clicks both passed the read,
both dispatched, and `adjustLoad(+1)` ran **twice** — permanently inflating the responder's load, emitting
two `assignment.created` events and two notifications. The unique partial index did **not** catch this
(same row, same responder).
Fix: precondition moved into the write. New `commitApproval()` and `updateAssignmentIfStatus()` apply
`.in("status", …)` on the UPDATE itself, so the losing request matches zero rows. Same guard applied to
`accept` / `decline` / `arrive` / `complete`.
Files: `lib/repositories/assignments.ts`, `lib/services/dispatchService.ts`

**3. Reject could orphan a responder.** `rejectRecommendation` had no status check — rejecting an
already-*dispatched* assignment set it `invalidated` without releasing the responder's load or status.
Now refused with an explicit message.
File: `lib/services/dispatchService.ts`

**4. `consume_rate_limit` did not exist.** README and `lib/api/http.ts` both claim a Postgres shared
fixed-window limiter. **No migration defined it.** The RPC always errored and `if (error) return true`
silently fell through to a per-process window — on serverless, effectively unenforced.
Fix: added `supabase/migrations/0006_rate_limit.sql` (table + `security definer` function, privileges
revoked from `anon`/`authenticated`). The fallback now logs a loud one-time warning instead of pretending.
Files: `supabase/migrations/0006_rate_limit.sql` (new), `lib/api/http.ts`

### Security

**5. Unauthenticated Featherless quota burn.** `/api/system/status?deep=1` had no auth and spends a real
completion. Anyone could loop it. Deep probes now require coordinator/admin.
File: `app/api/system/status/route.ts`

**6. Responder authorization gap.** Any responder-role account could accept/decline/complete **any**
assignment and take **any** unit offline by hand-sending the HTTP request — UI dropdown was the only
control. Now enforced server-side whenever `profiles.responder_id` is bound.
Files: `app/api/assignments/[id]/[action]/route.ts`, `app/api/responders/[id]/status/route.ts`

**7. `resetSimulation` truncated the whole audit log.** Ran unscoped deletes on `system_events` *and*
`notifications`, wiping events belonging to **real** incidents. Scoped to simulation-run rows plus
`on delete cascade` from simulated incidents.
File: `lib/services/simulationService.ts`

### Reliability

**8. Retry ladder hit non-retryable errors.** The provider retried 3× with no backoff on *everything*,
including 401/403 and **429** — hammering a provider already rate-limiting us. Now 400/401/403/404/422/429
fail fast; transport errors retry twice with 400 ms / 900 ms backoff; fallback model skipped when identical.
File: `lib/ai/provider.ts`

### Functional

**9. Dead UI field.** `/report` collected "Landmark or address" into `addressHint` and **never sent it**.
The API accepts `address_hint` and it feeds the AI's location hint. Now wired through.
File: `app/report/page.tsx`

**10. Voice reports mislabelled `source: "text"`.** `submit(interim || stage === "listening" ? …)` — after
speech ends both are falsy. Replaced with a sticky `usedVoice` ref, cleared on manual typing.
File: `app/report/page.tsx`

### Hygiene

**11. Dead code removed.** `components/ui/UserNav.tsx` was never imported (duplicate of `UserChip`, and read
role from client-controlled `user_metadata`). Unused `fail` import in the reassign route; unused `getConfig`
import in `simulationService`.

**12. ESLint was switched off.** `next.config.mjs` had `eslint: { ignoreDuringBuilds: true }` **and no ESLint
config file existed at all**. Removed the bypass, added `.eslintrc.json`
(`next/core-web-vitals` + `next/typescript`), added `eslint` / `eslint-config-next` devDeps and a
`typecheck` script.
Files: `next.config.mjs`, `.eslintrc.json` (new), `package.json`

**13. README corrected** — "35 unit tests" → 49; retry-ladder description; rate-limit migration requirement;
reset scoping; migrations now 0001–**0006**; two new entries in Limitations.

---

## 4. BUGS STILL REMAINING (deliberate, disclosed)

- **`next@15.1.3` has a published advisory (CVE-2025-66478).** npm warns on install. Upgrade to a patched
  15.x. Not done here: a version bump needs a live regression run that was not possible.
- **61 `no-explicit-any` warnings** (0 errors). A 61-site refactor without runtime testing is riskier than
  the warnings.
- **`adjustLoad` is read-modify-write** (`lib/repositories/responders.ts`). Two concurrent load changes on
  the same responder from different incidents can lose an increment. Proper fix: a Postgres RPC doing
  `update … set current_load = current_load + delta`.
- **`POST /api/incidents/:id/updates` is public with no ownership check** — anyone with an incident id can
  append text and trigger a Featherless call (rate-limited 15/min/IP).
- **Demo responder account is not bound to a unit.** Migration 0005 does not set `profiles.responder_id`
  (units are seeded at runtime with generated ids), so the console still lets you pick your unit. The
  enforcement added in fix #6 activates the moment that column is set.
- **Map has no tile-failure fallback UI.** A tile outage leaves a dark pane; the incident list stays usable.
- `moveResponder`, `adjustResourceInventory`, and SQL `make_point` are unreferenced. Left in place —
  small and coherent, not fake decoration.

---

## 5. UNVERIFIED — REQUIRES MANUAL TEST

Everything requiring network: Supabase schema/RLS/RPCs as actually deployed, Featherless live calls,
Supabase Realtime, map tiles, all browser workflows, end-to-end tests, deployment.

| Area | Status | Basis |
|---|---|---|
| Supabase | UNVERIFIED | Unreachable. Migrations read line-by-line, internally consistent; RPC args bind by name correctly. |
| Featherless | UNVERIFIED | Unreachable. Integration is real and load-bearing by code path — not decorative. |
| Map | UNVERIFIED at runtime | Code review clean: correct lng/lat ordering, markers mutated not replaced, stale markers reaped, null coords skipped, ResizeObserver + cleanup correct, no `window` at module scope. Nit: link lines use `!r?.lat` (falsy) so lat/lng exactly `0` would drop a line. |
| Realtime | UNVERIFIED at runtime | Architecture correct: DB is source of truth, debounced `/api/state` refetch, seq-gap replay, polling fallback, per-mount channel, `removeChannel` on unmount. |
| RLS | UNVERIFIED at runtime | Design PASS — zero client write policies anywhere in the schema. |
| Deployment | UNVERIFIED | Was **not deployable** (build failed). Now builds. |

---

## 6. STATUS BOARD

| Item | Status |
|---|---|
| No mock / fake data | **PASS** — searched. All seed data is `is_simulated: true`, server-side, coordinator-gated, banner-labelled. Test fixtures legitimate. No fake API responses, no hardcoded operational stats. |
| Secrets | **PASS** — no `.env` ever committed (full git history checked), no literal keys, `NEXT_PUBLIC_` only on Supabase URL/anon + Carto key. |
| Privacy | **PASS** — no names, phones or IDs collected; `missing_information` never asks for them; logs carry ids and error text only. |
| RBAC | **PASS** by inspection (after fix #6) |
| Rate-limit protection | **PASS after applying migration 0006** |
| Duplicate-action protection | **PASS** (fixed) |
| DB consistency | **PASS** by design (fixed) |
| Featherless failure handling | **PASS** (fixed) |
| Network failure handling | **PASS** |
| Simulation safety | **PASS** |
| Realtime recovery | **UNVERIFIED** |
| Map failure handling | **FAIL** — no fallback state |

### Hackathon compliance
Featherless mandatory ✓ (two agents; output drives priority, the PostGIS predicate, and match score).
Beyond-the-chatbot ✓ (no chat UI). Autonomous workflow ✓. Not a single-prompt wrapper ✓. Not a static
dataset ✓. Real decisions ✓. System thinking ✓ (DB-enforced conflicts, scarcity, blast-radius reconciliation).
Incremental meaningful commits ✓. Honest limitations ✓.
**Gaps: no public GitHub remote configured; demo video and live deployment outstanding.**

---

## 7. MANUAL TESTS TO RUN (in order)

**Do these first — nothing else matters until they pass:**

1. `npm install` — picks up new eslint devDeps
2. Apply **`supabase/migrations/0006_rate_limit.sql`** in the Supabase SQL editor
3. `npm run typecheck && npm run lint && npm test && npm run build`
   → expect **0 errors / 0 errors / 49 passed / build ✓**. Any failure = stop.
4. `npm run test:ai` → expect model, latency, tokens, `✓ Featherless returned parseable JSON`.
   `403` = gated model. `401` = bad key.
5. `npm run dev`, then `npm run verify` in a second terminal → expect **`N passed, 0 failed`**.

**Browser:**

6. **Rate limit:** submit 11 reports inside a minute → 11th must return `429`. All 11 succeeding means
   migration 0006 didn't apply.
7. **Double-approve (most important regression check):** click **Approve dispatch twice fast**. Expect one
   dispatch, and *"This recommendation was already actioned."* on the second. Then verify
   `responders.current_load` for that unit = **1, not 2**. A load of 2 means fix #2 regressed.
8. **Map:** `/command` → tiles render; incidents = circles by band, responders = rotated squares, shelters =
   triangles, dashed lines to active assignments. Click a marker → detail panel opens. Blank pane = tile/CORS failure.
9. **Realtime:** `/command` and `/report` in two windows. Submit → header shows **LIVE**, incident appears in
   ~1–2 s without refresh. If only the 4 s poll updates it, realtime isn't publishing.
10. **RBAC by hand:** sign in as `responder@reliefos.com`, then
    `curl -X POST .../api/assignments/<id>/approve` with that token → must be **403**. A 200 is critical.
11. **Chaos Mode:** Seed demo world → Start → 8 steps execute; expect priority re-computation, a match
    invalidation when Alpha Rescue goes offline, and an alternative recommendation.
12. **Refresh persistence:** hard-refresh `/command` → all state returns from Supabase.

---

## 8. RISKS BEFORE SUBMISSION

1. **The pre-audit tree could not be deployed** — `next build` failed. Confirm step 3 locally.
2. **Migration 0006 must be applied**, or the README's rate-limit claim is false in production.
3. **No public GitHub remote and no demo video** — both are hard submission requirements.
4. **`next@15.1.3` carries a published CVE.** Judges may check.
5. **Map has no tile-failure fallback** — the most likely way a demo looks broken through no fault of the logic.
6. **Everything runtime is unverified.** Do not present Supabase, Featherless, realtime or the map as
   "tested" until steps 4, 5, 8 and 9 pass.

---

## 9. FILES CHANGED BY THIS AUDIT

```
M  README.md
M  app/api/assignments/[id]/[action]/route.ts
M  app/api/incidents/[id]/reassign/route.ts
M  app/api/responders/[id]/status/route.ts
M  app/api/system/status/route.ts
M  app/report/page.tsx
M  lib/ai/provider.ts
M  lib/api/http.ts
M  lib/repositories/assignments.ts
M  lib/services/dispatchService.ts
M  lib/services/simulationService.ts
M  lib/supabase/server.ts
M  middleware.ts
M  next.config.mjs
M  package.json
M  tsconfig.json
D  components/ui/UserNav.tsx        (moved to _to_delete/)
A  .eslintrc.json
A  supabase/migrations/0006_rate_limit.sql
A  AUDIT_REPORT.md                  (this file)
```

Not yet committed to git at the time of writing.

---

## 10. HANDOFF NOTES FOR THE NEXT SESSION

- **Housekeeping:** deletion was blocked in the audit session, so `components/ui/UserNav.tsx` and two temp
  tarballs sit in **`RELIFOS/_to_delete/`**. Delete that folder manually (already gitignored).
- **`.git/index.lock`** is present from an interrupted git process. Remove it if git misbehaves.
- `tsconfig.json` now excludes `_to_delete`.
- The audit **did not** commit anything. Review the diff before committing.
- Do not re-run the full audit — sections 3 and 4 above are the complete finding set. Start from section 7.
- If you can reach the network, the highest-value next actions are: run steps 4, 5, 7 and 10, then upgrade
  `next` off 15.1.3 and re-run step 3.
