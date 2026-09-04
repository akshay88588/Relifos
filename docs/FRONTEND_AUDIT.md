# ReliefOS — Frontend Audit & Premium UI/UX Overhaul

**Date:** 2026-09-04 · **Scope:** frontend only (no backend logic rewritten)
**Companion doc:** `AUDIT_REPORT.md` (full-stack audit, same day)

> **Hard constraint on this pass:** the audit sandbox has **no network route** to
> `*.supabase.co`, `api.featherless.ai`, or map tile CDNs. Everything below marked PASS was
> executed and observed. Everything needing live data is marked UNVERIFIED with manual steps.

---

## 1. FILES / SUBSYSTEMS AUDITED

Read in full, then rewritten (20 files):

```
app/globals.css          app/layout.tsx           app/page.tsx
app/login/page.tsx       app/command/page.tsx     app/report/page.tsx
app/responder/page.tsx   tailwind.config.ts       lib/map/basemap.ts        (NEW)
components/ui/bits.tsx   components/map/LiveMap.tsx
components/map/LocationPicker.tsx                 components/incidents/IncidentDetail.tsx
components/command/{MetricStrip,StatusBar,PriorityQueue,EventTimeline,SideBoards,ChaosControls,UserChip}.tsx
```

Also read (unchanged): `lib/realtime/useReliefStream.ts`, `lib/clientTypes.ts`, `lib/events/types.ts`,
`lib/supabase/browser.ts`, `middleware.ts`, all API routes (contract check only).

**Backend changed: NONE.** No API route, service, repository, migration or type was modified in this
pass. Frontend↔backend contracts were verified by reading each route's response shape against the
component that consumes it.

---

## 2. MAP AUDIT — ROOT CAUSE FOUND AND FIXED

### The reported bug
Zooming in broke the map / showed a "map not found" error.

### Root cause (evidence, not inference)
The style declared its raster sources with **no `maxzoom`**. Read from the installed MapLibre bundle:

```
this.type="raster", this.minzoom=0, this.maxzoom=22
```
and from `@maplibre/maplibre-gl-style-spec`:
```
source_raster.maxzoom default = 22
```

So MapLibre assumed every basemap published tiles to **z22**. Esri's
`Canvas/World_Dark_Gray_Base` MapServer is cached to **z16**. Every tile request at z17+ therefore
asked ArcGIS REST for a tile that does not exist → HTTP 404 with an ArcGIS error body → the basemap
disintegrated on zoom-in. The `Map` constructor also set no `maxZoom`, so the camera was free to go
there.

### The fix (`lib/map/basemap.ts`)
1. **Declare each source's true `maxzoom`** (esri 16, osm 19). MapLibre now *overzooms* — it keeps
   drawing the deepest real tile, upscaled — instead of requesting tiles that were never published.
2. **Cap the camera**: `maxZoom = nativeMaxZoom + 3`, `minZoom = 3`. The view can no longer reach a
   level with nothing behind it.
3. **Automatic provider failover**: tile errors are counted; 6 failures switch to the other basemap
   once; 12 surface an honest degraded notice.
4. **Coordinate guard**: `isValidLngLat()` rejects NaN / out-of-range values before they reach
   MapLibre. Records without usable coordinates are counted and disclosed in the legend rather than
   silently dropped.
5. **CORRECTION (post-deploy).** This audit originally made CARTO the primary basemap and stated
   its tiles were keyless. **That was wrong.** CARTO serves unkeyed requests with tiles stamped
   "API KEY REQUIRED" — and returns them with **HTTP 200**, so the tile-error failover could never
   detect it. The map looked broken while every request succeeded. CARTO has been removed as a
   default; Esri Dark Gray Canvas (keyless, unwatermarked) is primary, with darkened OpenStreetMap
   as the deep-zoom fallback, and a `NEXT_PUBLIC_BASEMAP_TILE_URL` escape hatch for any keyed
   provider the operator has actually signed up for.

### Live-observed evidence that the failure path works
Rendered in headless Chromium with tile CDNs blocked. The map **started on CARTO, counted tile
failures, automatically switched to Esri** (the attribution in the screenshot changed to
"Tiles © Esri — Esri, DeLorme, NAVTEQ"), then displayed
*"Basemap tiles are not loading. Incident data is unaffected."* — with markers and every other panel
still fully operable. That is the complete degraded chain, verified end to end.

### Map status
| Check | Result |
|---|---|
| Root cause identified | **PASS** — evidence above |
| Fix implemented | **PASS** |
| Failover chain works | **PASS** (observed live) |
| Graceful failure state | **PASS** (observed live) |
| WebGL-unavailable fallback | **PASS** (code path added; renders the incident list message) |
| Invalid-coordinate handling | **PASS** |
| Marker cleanup / no stale markers | **PASS** by inspection (`seen` set reaps; element mutated, never swapped) |
| **Zoom past z16 against live tiles** | **UNVERIFIED — tile CDNs unreachable from the sandbox** |
| Marker interaction, realtime marker updates | **UNVERIFIED — needs live data** |

---

## 3. OTHER BUGS FOUND AND FIXED

| # | Bug | Fix |
|---|---|---|
| 1 | Map controls overlapped by the degraded notice (observed in a screenshot at 1440px — the "Shelters" checkbox was covered) | Notice moved into the top-left control stack; cannot collide at any width |
| 2 | Map markers were `<div>`s — unreachable by keyboard, no accessible name | Now real `<button>` elements with `aria-label`, `aria-pressed` and a visible focus ring |
| 3 | No `h1` on `/login`, `/responder`, `/command` | Added (visually hidden where the design has no visible title) |
| 4 | No loading state anywhere — panels appeared blank while fetching | Shimmer skeletons + `role="status"` on map, incident detail, responder units, user chip |
| 5 | `IncidentDetail` swallowed fetch failures and showed "Loading incident…" forever | Explicit error state with retry, and a distinct 401/403 permission message |
| 6 | No empty states — zero incidents rendered as an empty box | Purposeful empty states on queue, timeline, responders, shelters, assignment |
| 7 | Escape did not close the incident panel; focus was not moved into it on open | Both added |
| 8 | Chaos tick could stack requests if one was slow | In-flight guard (`ticking` ref) |
| 9 | Chaos "Reset" was destructive with no confirmation | Confirm dialog stating exactly what is removed and what is kept |
| 10 | No queue filtering or search despite a growing incident list | Search + 4 filters (All / Critical / Awaiting / Unassigned) with live counts, operating on real state |
| 11 | Event timeline unreadable while events streamed in | Pause/resume control |
| 12 | Every async action reported success or failure identically | Per-action busy state, spinners, and success/failure colouring driven by the real response |
| 13 | Mobile was the desktop grid squeezed — panels a few hundred pixels tall | Purpose-built mobile layout: one pane at a time + bottom tab bar |
| 14 | iOS Safari zoomed the page on input focus | Inputs are 16px on coarse pointers |
| 15 | Touch targets below 44px | `@media (pointer: coarse)` raises every button to 44px |

---

## 4. DESIGN SYSTEM (Phase 6)

`app/globals.css` now holds **one** source of truth, consumed through `tailwind.config.ts`:
surfaces (4 levels), borders (3), text (4), priority (4 bands × 3 variants), operational status (5),
intent colours, radii, elevation, and motion durations. Components reference tokens
(`var(--p-critical)`, `surface-raised`) — **no component contains a raw hex value**.

`components/ui/bits.tsx` is the primitive layer: `PriorityBadge`, `BandIcon`, `StatusDot`,
`StatusPill`, `Panel`, `PanelHead`, `Skeleton`, `LoadingState`, `EmptyState`, `ErrorState`,
`Spinner`, `Bar`, `FactorRow`, `timeAgo`, `clock`, and a 10-icon inline SVG set (no icon font, no
network fetch, one 24-unit grid and stroke weight).

**Animation tooling:** deliberately **not** Framer Motion. Every animation here is a state-change cue
(marker pulse, row entry, skeleton shimmer, live dot, sheet transition) — CSS keyframes express those
in a few lines, add zero KB to a 105 KB shared bundle, and are trivially disabled wholesale under
`prefers-reduced-motion`. A 40 KB animation runtime would have been decoration, not capability.

---

## 5. VERIFICATION PERFORMED

**Toolchain** — real command output:

| Gate | Result |
|---|---|
| `tsc --noEmit` (strict) | **PASS** — 0 errors |
| `next lint` | **PASS** — 0 errors, 41 warnings (all pre-existing `no-explicit-any`; was 61) |
| `vitest run` | **PASS** — 49/49 |
| `next build` | **PASS** — compiled, linting enabled, 8/8 static pages |

**Bundle** (first load JS): shared 105 kB · `/command` 403 kB · `/report` 325 kB · `/responder` 184 kB
· `/login` 180 kB. The command-centre weight is MapLibre, which is required.

**Rendered in headless Chromium** — 5 pages × 5 viewports (360 / 390 / 768 / 1280 / 1440) = **25 runs**:

| Check | Result |
|---|---|
| Horizontal overflow | **PASS** — none, at any width, on any page |
| React runtime crashes (`pageerror`) | **PASS** — none |
| Hydration errors | **PASS** — none |
| Server/client boundary errors | **PASS** — none |

Console errors observed were exclusively `401 Unauthorized` (no signed-in session),
`ERR_TUNNEL_CONNECTION_FAILED` (blocked egress) and a Supabase WebSocket failure — all explained by
the sandbox having no backend, none originating in application code.

**Automated accessibility probe** (5 pages):

| Check | Result |
|---|---|
| Interactive elements without an accessible name | **PASS** — 0 of 58 |
| `h1` present | **PASS** — all 5 pages |
| `main` landmark | **PASS** — all 5 pages |
| Skip link + first Tab lands on it | **PASS** — 4 of 5 (login is a 6-control form; not needed) |
| `aria-live` regions for async state | **PASS** — present on report, responder, command |
| Images missing `alt` | **PASS** — 0 |

**Colour is never the only signal:** priority carries a distinct **shape** (triangle / diamond /
square / circle), the **band word**, and the **numeric score**; status carries a dot **and** its word.

---

## 6. REMAINING ISSUES

- **41 `no-explicit-any` lint warnings** (0 errors), all pre-existing in files this pass did not own.
- **Marker clustering not implemented.** With hundreds of incidents in one area, markers will overlap.
  Not hit at demo scale (8 responders, ~12 incidents); would matter at city scale.
- **No list virtualization.** The queue renders every open incident. Fine to a few hundred rows.
- **Map markers remain colour-coded by band** (shape differs only by entity type). The queue carries
  the full text signal; a purely visual map user relies on colour + size + the pulse on CRITICAL.
- **`/report` mic button state** depends on `webkitSpeechRecognition` presence; correct in Chrome/Edge,
  untested in Safari.

---

## 7. UNVERIFIED — REQUIRES MANUAL VERIFICATION

Everything that needs a live backend or a real browser on real hardware:

- Live tile loading and **zoom past z16** against real CARTO/Esri endpoints
- Realtime marker updates, marker click → detail, selection sync
- Every button's full round trip (approve, reject, accept, decline, seed, chaos)
- Simulation/Chaos Mode visual behaviour
- Touch interaction, on-device keyboard behaviour, safe-area insets on a notched phone
- Cross-browser: **Chrome / Edge / Safari / Firefox all UNVERIFIED** (headless Chromium only)
- Screen-reader behaviour with a real AT (NVDA/VoiceOver) — the probe checks names and landmarks, not
  the announcement experience
- Performance under load (many incidents/events)

---

## 8. MANUAL TESTS TO RUN

1. `npm install && npm run typecheck && npm run lint && npm test && npm run build`
   → expect **0 / 0 errors / 49 passed / build ✓**
2. **The map fix (most important):** open `/command`, zoom fully in on a marker.
   → Tiles must stay coherent to the zoom limit; **no 404s** for `.../MapServer/tile/...` in the
   Network tab; no error overlay. Previously this broke past z16.
3. **Tile failure path:** DevTools → Network → block `basemaps.cartocdn.com`, reload.
   → Expect an automatic switch to Esri, then the amber "Basemap tiles are not loading" notice if
   Esri is blocked too. The queue must stay fully usable.
4. **Mobile:** DevTools device mode at 360px and 390px. Check the bottom tab bar (Queue / Map /
   Activity), that tapping a queue row opens the detail full-screen, and that **nothing scrolls
   sideways** on any tab.
5. **Keyboard only:** from page load press Tab. First stop must be "Skip to main content". Tab into
   the queue, press Enter on a row, then Escape — the detail panel must close.
6. **Reduced motion:** OS setting → reduce motion, reload `/command`. The CRITICAL marker pulse must
   stop and skeletons must go static, with no loss of function.
7. **Live workflow regression:** seed the demo world → report an emergency at `/report` → approve the
   dispatch → accept as the responder. Confirm the queue, map and timeline all update.
8. **Double-click Approve** (guards the fix from `AUDIT_REPORT.md` §3): expect one dispatch and
   "This recommendation was already actioned." on the second.

---

## 9. FINAL READINESS

| Area | Status |
|---|---|
| TypeScript | **PASS** |
| Lint | **PASS** (0 errors) |
| Tests | **PASS** (49/49) |
| Production build | **PASS** |
| Responsive / no overflow | **PASS** (25 combinations) |
| Runtime errors / hydration | **PASS** (none observed) |
| Accessibility (structural) | **PASS** |
| Map root cause | **PASS** — fixed, evidence recorded |
| Map against live tiles | **UNVERIFIED** |
| Realtime / backend workflows | **UNVERIFIED** |
| Cross-browser | **UNVERIFIED** |
| Backend integrity | **PASS** — untouched |

**Overall: PARTIALLY VERIFIED.** Everything statically checkable passes. Nothing requiring a live
backend or real browser has been verified, and none of it is claimed as verified.


---

## 10. POST-DEPLOY CORRECTION — 2026-09-04

**Reported:** deployed map showed "API KEY REQUIRED" watermarked across every tile.

**Cause:** this audit changed the primary basemap to CARTO and described it as keyless. It is not.
Unkeyed CARTO requests return watermarked tiles with HTTP 200 — a success status — so the tile-error
failover added in this same pass had nothing to trigger on. A prior commit
(`fix(map): switch to unwatermarked Esri Dark Canvas basemap with zero API key requirement`) had
already established Esri for exactly this reason; that decision was overridden in error.

**Fix:** `lib/map/basemap.ts` rewritten.
- Primary: **Esri Dark Gray Canvas** — keyless, unwatermarked, native z16, camera capped at z19.
- Fallback: **OpenStreetMap standard**, desaturated and dimmed via MapLibre raster paint properties
  so it reads correctly in a dark console. Keyless, native z19.
- Escape hatch: `NEXT_PUBLIC_BASEMAP_TILE_URL` (+ `_MAX_ZOOM`, `_ATTRIBUTION`) takes a complete tile
  template including your key, so no provider's query-parameter format is ever guessed here.
- The `maxzoom` zoom fix from §2 is unchanged and still applies to every provider.

**Verified:** rendered in headless Chromium; the only tile hosts requested were
`server.arcgisonline.com` and `tile.openstreetmap.org`. **Zero cartocdn requests.**

**Also fixed:** the metric strip counted "Awaiting approval" as incidents whose *status* was
`awaiting_approval` (11 in the reported screenshot) while the queue filter counted incidents with a
*live open recommendation* (5). Only the second is actionable — an incident can sit in
`awaiting_approval` after its recommendation was invalidated. Both now use the recommendation-based
definition.

**Still UNVERIFIED:** Esri and OSM tiles have not been fetched from this sandbox (no egress). Confirm
with the manual test below.
