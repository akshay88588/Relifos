-- ReliefOS 0002: RBAC helpers, RLS, realtime publication, PostGIS search

create or replace function public.current_app_role() returns text
language sql stable security definer set search_path = public as $$
  select coalesce((select role from public.profiles where id = auth.uid()), 'anon');
$$;

create or replace function public.is_staff() returns boolean
language sql stable security definer set search_path = public as $$
  select public.current_app_role() in ('coordinator','responder','admin');
$$;

create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, role, display_name)
  values (new.id,
          coalesce(new.raw_user_meta_data->>'role', 'citizen'),
          coalesce(new.raw_user_meta_data->>'display_name', split_part(new.email,'@',1)))
  on conflict (id) do nothing;
  return new;
end $$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created after insert on auth.users
  for each row execute function public.handle_new_user();

alter table public.profiles              enable row level security;
alter table public.incidents             enable row level security;
alter table public.incident_assessments  enable row level security;
alter table public.responders            enable row level security;
alter table public.responder_locations   enable row level security;
alter table public.resources             enable row level security;
alter table public.shelters              enable row level security;
alter table public.shelter_capacity_events enable row level security;
alter table public.match_candidates      enable row level security;
alter table public.assignments           enable row level security;
alter table public.ai_decisions          enable row level security;
alter table public.decision_factors      enable row level security;
alter table public.system_events         enable row level security;
alter table public.notifications         enable row level security;
alter table public.simulation_runs       enable row level security;

create policy profiles_self_or_staff on public.profiles for select to authenticated
  using (id = auth.uid() or public.is_staff());

create policy incidents_read on public.incidents for select to authenticated
  using (public.is_staff() or reported_by = auth.uid());

create policy assessments_read on public.incident_assessments for select to authenticated
  using (public.is_staff() or exists (
    select 1 from public.incidents i where i.id = incident_id and i.reported_by = auth.uid()));

create policy staff_read_responders on public.responders for select to authenticated using (public.is_staff());
create policy staff_read_rloc on public.responder_locations for select to authenticated using (public.is_staff());
create policy staff_read_resources on public.resources for select to authenticated using (public.is_staff());
create policy staff_read_shelters on public.shelters for select to authenticated using (public.is_staff());
create policy staff_read_shelter_events on public.shelter_capacity_events for select to authenticated using (public.is_staff());
create policy staff_read_candidates on public.match_candidates for select to authenticated using (public.is_staff());
create policy staff_read_assignments on public.assignments for select to authenticated using (public.is_staff());
create policy staff_read_ai on public.ai_decisions for select to authenticated using (public.is_staff());
create policy staff_read_factors on public.decision_factors for select to authenticated using (public.is_staff());
create policy staff_read_events on public.system_events for select to authenticated using (public.is_staff());
create policy staff_read_sim on public.simulation_runs for select to authenticated using (public.is_staff());
create policy notifications_read on public.notifications for select to authenticated
  using (target_user = auth.uid() or (public.is_staff() and target_user is null));

-- NOTE: there are deliberately NO insert/update/delete policies for any client
-- role. Every write goes through a server route handler using the service-role
-- key, after an explicit requireRole() check.

alter publication supabase_realtime add table public.system_events;

create or replace function public.nearby_capable_responders(
  p_lng double precision,
  p_lat double precision,
  p_caps text[],
  p_radius_m double precision default 25000
)
returns table (
  id uuid, name text, org text, type text, status text,
  capabilities text[], current_load int, max_concurrent int, speed_kmh numeric,
  lng double precision, lat double precision, distance_m double precision,
  active_assignment_id uuid, active_incident_priority numeric
)
language sql stable security definer set search_path = public as $$
  select r.id, r.name, r.org, r.type, r.status,
         r.capabilities, r.current_load, r.max_concurrent, r.speed_kmh,
         st_x(r.current_location::geometry), st_y(r.current_location::geometry),
         st_distance(r.current_location, st_setsrid(st_makepoint(p_lng, p_lat), 4326)::geography),
         a.id, i.priority_score
  from public.responders r
  left join public.assignments a
    on a.responder_id = r.id
   and a.status in ('dispatched','accepted','en_route','on_scene')
  left join public.incidents i on i.id = a.incident_id
  where r.current_location is not null
    and st_dwithin(r.current_location, st_setsrid(st_makepoint(p_lng, p_lat), 4326)::geography, p_radius_m)
    and (cardinality(p_caps) = 0 or r.capabilities && p_caps)
  order by st_distance(r.current_location, st_setsrid(st_makepoint(p_lng, p_lat), 4326)::geography);
$$;

create or replace function public.capability_supply_ratio(p_caps text[])
returns numeric language sql stable security definer set search_path = public as $$
  with supply as (
    select count(*)::numeric n from public.responders
    where status = 'available' and current_load < max_concurrent
      and (cardinality(p_caps) = 0 or capabilities && p_caps)
  ), demand as (
    select greatest(count(*),1)::numeric n from public.incidents
    where status in ('new','assessing','matched','awaiting_approval')
      and (cardinality(p_caps) = 0 or required_capabilities && p_caps)
  )
  select (select n from supply) / (select n from demand);
$$;
