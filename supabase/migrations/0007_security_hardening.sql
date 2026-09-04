-- ReliefOS 0007: security hardening from the full-system audit
--
-- P0-1  Close an RLS bypass. nearby_capable_responders, capability_supply_ratio
--       and consume_rate_limit are SECURITY DEFINER, so they run as their owner
--       and ignore RLS. EXECUTE was granted to PUBLIC (therefore anon), which
--       let anyone holding the *public* anon key read every responder's
--       identity, status and live coordinates through /rest/v1/rpc/, and poison
--       arbitrary rate-limit buckets. The application calls these only through
--       the service-role client, so revoking public execute costs nothing.
-- P1-6  Make responder load adjustment atomic.
-- P1-4  Bind the responder demo account to a unit so the API ownership guard
--       can actually fire.
-- P2    Add the missing indexes and a duplicate-candidate guard.

revoke execute on function public.nearby_capable_responders(double precision, double precision, text[], double precision) from public, anon, authenticated;
revoke execute on function public.capability_supply_ratio(text[]) from public, anon, authenticated;
revoke execute on function public.consume_rate_limit(text, int, int) from public, anon, authenticated;
revoke execute on function public.handle_new_user() from public, anon, authenticated;

grant execute on function public.nearby_capable_responders(double precision, double precision, text[], double precision) to service_role;
grant execute on function public.capability_supply_ratio(text[]) to service_role;
grant execute on function public.consume_rate_limit(text, int, int) to service_role;

-- is_staff() and current_app_role() must stay executable by `authenticated`:
-- the RLS policies themselves call them, and they leak only the caller's role.
revoke execute on function public.is_staff() from public, anon;
revoke execute on function public.current_app_role() from public, anon;
grant execute on function public.is_staff() to authenticated, service_role;
grant execute on function public.current_app_role() to authenticated, service_role;

-- Atomic load adjustment: the previous read-modify-write in the repository
-- layer could lose an update when two dispatches committed concurrently, and
-- current_load gates candidate eligibility in the matching engine.
create or replace function public.adjust_responder_load(p_id uuid, p_delta int)
returns int
language sql
security definer
set search_path = public
as $$
  update public.responders
     set current_load = greatest(0, current_load + p_delta),
         updated_at = now()
   where id = p_id
  returning current_load;
$$;
revoke execute on function public.adjust_responder_load(uuid, int) from public, anon, authenticated;
grant execute on function public.adjust_responder_load(uuid, int) to service_role;

create index if not exists notifications_recent_idx
  on public.notifications (created_at desc);
create index if not exists responder_locations_responder_idx
  on public.responder_locations (responder_id, recorded_at desc);
create unique index if not exists match_candidates_incident_responder_key
  on public.match_candidates (incident_id, responder_id);

update public.profiles p
   set responder_id = (select id from public.responders where name = 'Alpha Rescue' limit 1)
  from auth.users u
 where u.id = p.id
   and u.email = 'responder@reliefos.com'
   and p.responder_id is null;

-- Pin search_path on the trigger functions (Supabase linter WARN).
alter function public.touch_updated_at() set search_path = public;
alter function public.sync_latlng() set search_path = public;
alter function public.sync_latlng_current() set search_path = public;
alter function public.make_point(double precision, double precision) set search_path = public;
