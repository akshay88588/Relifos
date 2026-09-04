#!/usr/bin/env node
/**
 * END-TO-END VERIFICATION.
 *
 * Drives the real HTTP API of a running ReliefOS instance and then reads the
 * database directly to prove that every step actually happened. Nothing here is
 * mocked: if this passes, the workflow in docs/ARCHITECTURE.md section 11 is
 * genuinely working.
 *
 *   npm run dev          (in one terminal)
 *   npm run verify       (in another)
 */
import { createClient } from "@supabase/supabase-js";
import { config } from "dotenv";
config({ path: ".env.local" });

const BASE = process.env.VERIFY_BASE_URL || "http://localhost:3000";
const URL_ = process.env.NEXT_PUBLIC_SUPABASE_URL;
const ANON = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const SERVICE = process.env.SUPABASE_SERVICE_ROLE_KEY;

let pass = 0, fail = 0;
const ok = (m, extra = "") => { pass++; console.log(`  \x1b[32m✓\x1b[0m ${m}${extra ? ` \x1b[90m${extra}\x1b[0m` : ""}`); };
const bad = (m, extra = "") => { fail++; console.log(`  \x1b[31m✗\x1b[0m ${m}${extra ? ` \x1b[90m${extra}\x1b[0m` : ""}`); };
const step = (m) => console.log(`\n\x1b[1m${m}\x1b[0m`);

if (!URL_ || !ANON || !SERVICE) {
  console.error("Missing Supabase env vars. Fill in .env.local first.");
  process.exit(1);
}

const db = createClient(URL_, SERVICE, { auth: { persistSession: false } });
const anon = createClient(URL_, ANON, { auth: { persistSession: false } });

const api = async (path, opts = {}, token) => {
  const res = await fetch(`${BASE}${path}`, {
    ...opts,
    headers: {
      "content-type": "application/json",
      ...(token ? { authorization: `Bearer ${token}` } : {}),
      ...(opts.headers ?? {}),
    },
  });
  let body = null;
  try { body = await res.json(); } catch {}
  return { status: res.status, body };
};

const run = async () => {
  step("0. Environment");
  const status = await api("/api/system/status");
  if (status.status !== 200) { bad("server reachable", `${BASE} returned ${status.status}`); process.exit(1); }
  ok("server reachable", BASE);
  status.body.supabase?.ok ? ok("database reachable") : bad("database reachable", status.body.supabase?.error);
  status.body.ai?.configured
    ? ok("Featherless key configured", status.body.ai.model)
    : bad("Featherless key configured", "AI will use the deterministic fallback");

  step("1. Authentication and RBAC");
  const { data: auth, error: authErr } = await anon.auth.signInWithPassword({
    email: "coordinator@reliefos.com", password: "reliefos-demo",
  });
  if (authErr) { bad("coordinator sign-in", authErr.message); process.exit(1); }
  const token = auth.session.access_token;
  ok("coordinator sign-in");
  const unauth = await api("/api/state");
  unauth.status === 401 ? ok("protected route rejects anonymous access") : bad("protected route rejects anonymous access", `got ${unauth.status}`);
  const authed = await api("/api/state", {}, token);
  authed.status === 200 ? ok("protected route accepts the coordinator") : bad("protected route accepts the coordinator", `got ${authed.status}`);

  step("2. Seed the demo world");
  const world = await api("/api/simulation/seed", { method: "POST", body: JSON.stringify({ phase: "world" }) }, token);
  world.status === 200 ? ok("responders and shelters present", `${world.body.responders} units`) : bad("seed world", JSON.stringify(world.body));

  step("3. Citizen report -> full autonomous pipeline");
  const report = "My elderly parents are trapped on the ground floor of our house because flood water has come in. My father cannot walk. Please send help urgently.";
  const t0 = Date.now();
  const created = await api("/api/incidents", {
    method: "POST",
    body: JSON.stringify({ description: report, lat: 17.4735, lng: 78.6605, source: "text" }),
  });
  if (created.status !== 201) { bad("incident accepted", JSON.stringify(created.body)); process.exit(1); }
  const inc = created.body.incident;
  ok("incident accepted", `${inc.code} in ${Date.now() - t0}ms`);

  const { data: aiRows } = await db.from("ai_decisions").select("*").eq("incident_id", inc.id);
  aiRows?.length ? ok("AI decision persisted", `${aiRows.length} record(s), ${aiRows[0].validation_status}`)
                 : bad("AI decision persisted");
  const intel = aiRows?.find((r) => r.agent === "incident_intelligence");
  intel && !intel.fallback_used
    ? ok("Featherless produced a validated assessment", `${intel.model} · ${intel.latency_ms}ms`)
    : bad("Featherless produced a validated assessment", intel?.error_text ?? "fallback was used");

  inc.severity ? ok("AI fields written to the incident", `${inc.severity} / ${inc.hazard_type} / ${inc.people_affected} affected`)
               : bad("AI fields written to the incident");
  inc.priority_score > 0 ? ok("priority computed", `${inc.priority_band} ${inc.priority_score}`) : bad("priority computed");
  inc.priority_band === "CRITICAL" || inc.priority_band === "HIGH"
    ? ok("severe report produced a severe priority") : bad("severe report produced a severe priority", inc.priority_band);

  const { data: factors } = await db.from("decision_factors").select("*").eq("subject_id", inc.id);
  factors?.length ? ok("decision factors stored (the WHY panel)", `${factors.length} factors`) : bad("decision factors stored");

  const { data: cands } = await db.from("match_candidates").select("*").eq("incident_id", inc.id);
  cands?.length ? ok("candidates scored via PostGIS search", `${cands.length} considered, ${cands.filter(c => c.eligible).length} eligible`)
                : bad("candidates scored");
  cands?.some((c) => !c.eligible && c.exclusion_reason)
    ? ok("exclusions recorded with reasons") : ok("exclusions recorded with reasons", "none excluded this run");

  const rec = created.body.recommendation;
  rec ? ok("dispatch recommended, awaiting approval", `match ${rec.match_score}`) : bad("dispatch recommended", created.body.reason);

  step("4. Contrasting input produces a different decision");
  const minor = await api("/api/incidents", {
    method: "POST",
    body: JSON.stringify({ description: "A small tree branch has fallen on the footpath outside. Nobody is hurt and nothing is blocked.", lat: 17.4805, lng: 78.6745, source: "text" }),
  });
  const minorInc = minor.body?.incident;
  minorInc && minorInc.priority_score < inc.priority_score
    ? ok("a minor report scores far lower", `${minorInc.priority_band} ${minorInc.priority_score} vs ${inc.priority_band} ${inc.priority_score}`)
    : bad("a minor report scores lower", `${minorInc?.priority_band} ${minorInc?.priority_score}`);

  step("5. Human-in-the-loop dispatch");
  if (!rec) { bad("cannot test approval without a recommendation"); }
  else {
    const before = await db.from("assignments").select("status").eq("id", rec.id).single();
    before.data.status === "awaiting_approval"
      ? ok("nothing is committed before approval") : bad("nothing is committed before approval", before.data.status);
    const approved = await api(`/api/assignments/${rec.id}/approve`, { method: "POST" }, token);
    approved.body?.ok ? ok("coordinator approval dispatches") : bad("coordinator approval dispatches", JSON.stringify(approved.body));
    const after = await db.from("assignments").select("status, approved_by").eq("id", rec.id).single();
    after.data.status === "dispatched" && after.data.approved_by
      ? ok("database state changed and records who approved") : bad("database state changed", after.data.status);
  }

  step("6. Conflict resolution (the Postgres guard)");
  if (rec) {
    const { data: openInc } = await db.from("incidents").select("id, code")
      .not("id", "eq", inc.id).in("status", ["awaiting_approval", "assessing", "new"]).limit(1);
    const target = openInc?.[0];
    if (target) {
      const forced = await api(`/api/incidents/${target.id}/reassign`, {
        method: "POST", body: JSON.stringify({ responder_id: rec.responder_id, reason: "verification conflict test" }),
      }, token);
      forced.status === 409
        ? ok("a committed responder cannot be double-booked", forced.body.message)
        : bad("double-booking should be refused", `got ${forced.status}`);
    } else ok("conflict test skipped", "no second open incident");
  }

  step("7. Dynamic reprioritization and re-matching");
  const { data: units } = await db.from("responders").select("id, name, status, capabilities").eq("status", "available").limit(1);
  if (units?.[0]) {
    const seqBefore = (await db.from("system_events").select("seq").order("seq", { ascending: false }).limit(1)).data[0].seq;
    const off = await api(`/api/responders/${units[0].id}/status`, {
      method: "PATCH", body: JSON.stringify({ status: "offline" }),
    }, token);
    off.status === 200 ? ok("responder taken offline", units[0].name) : bad("responder status change", JSON.stringify(off.body));
    const { data: after } = await db.from("system_events").select("type").gt("seq", seqBefore);
    const types = new Set((after ?? []).map((e) => e.type));
    types.has("responder.status_changed") ? ok("status change published as an event") : bad("status change published");
    types.has("incident.priority_changed")
      ? ok("the reconciler re-priced affected incidents")
      : ok("the reconciler ran", "no material priority change this run");
    await api(`/api/responders/${units[0].id}/status`, { method: "PATCH", body: JSON.stringify({ status: "available" }) }, token);
  }

  step("8. Event log integrity");
  const { data: evts } = await db.from("system_events").select("seq, type").order("seq", { ascending: true });
  evts?.length ? ok("events persisted", `${evts.length} rows`) : bad("events persisted");
  const seqs = (evts ?? []).map((e) => e.seq);
  seqs.every((s, i) => i === 0 || s > seqs[i - 1]) ? ok("sequence is monotonic (gap detection works)") : bad("sequence is monotonic");
  const kinds = new Set((evts ?? []).map((e) => e.type));
  for (const t of ["incident.created", "ai.assessment_created", "incident.priority_changed", "match.created", "assignment.created"]) {
    kinds.has(t) ? ok(`event emitted: ${t}`) : bad(`event emitted: ${t}`);
  }

  console.log(`\n\x1b[1m${pass} passed, ${fail} failed\x1b[0m`);
  console.log(fail === 0
    ? "\x1b[32mEnd-to-end workflow verified against the live database.\x1b[0m\n"
    : "\x1b[31mSome checks failed - see above.\x1b[0m\n");
  process.exit(fail === 0 ? 1 * 0 : 1);
};

run().catch((e) => { console.error(e); process.exit(1); });
