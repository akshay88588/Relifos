-- ReliefOS 0001: core schema
create extension if not exists postgis;
create extension if not exists pgcrypto;

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  role text not null default 'citizen' check (role in ('citizen','coordinator','responder','admin')),
  display_name text not null default 'User',
  org text,
  responder_id uuid,
  created_at timestamptz not null default now()
);

create sequence public.incident_code_seq start 101;

create table public.incidents (
  id uuid primary key default gen_random_uuid(),
  code text not null unique default ('INC-' || nextval('public.incident_code_seq')::text),
  status text not null default 'new' check (status in
    ('new','assessing','matched','awaiting_approval','dispatched','en_route','on_scene','resolved','cancelled')),
  hazard_type text,
  description_raw text not null,
  source text not null default 'text' check (source in ('text','voice','simulation')),
  location geography(Point,4326),
  address_text text,
  location_confidence text not null default 'reported' check (location_confidence in ('reported','approximate','unknown')),
  severity text check (severity in ('critical','high','medium','low')),
  people_affected int not null default 1,
  vulnerability_flags text[] not null default '{}',
  required_capabilities text[] not null default '{}',
  urgency numeric not null default 0.5,
  life_risk boolean not null default false,
  ai_confidence numeric not null default 0,
  missing_information text[] not null default '{}',
  short_summary text,
  priority_score numeric not null default 0,
  priority_band text not null default 'LOW' check (priority_band in ('CRITICAL','HIGH','MEDIUM','LOW')),
  priority_computed_at timestamptz,
  assessment_version int not null default 0,
  degraded boolean not null default false,
  reported_by uuid references public.profiles(id) on delete set null,
  reporter_token text,
  is_simulated boolean not null default false,
  dispatched_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  resolved_at timestamptz
);
create index incidents_open_priority_idx on public.incidents (priority_score desc)
  where status not in ('resolved','cancelled');
create index incidents_status_idx on public.incidents (status);
create index incidents_location_gix on public.incidents using gist (location);
create index incidents_caps_gin on public.incidents using gin (required_capabilities);

create table public.incident_assessments (
  id uuid primary key default gen_random_uuid(),
  incident_id uuid not null references public.incidents(id) on delete cascade,
  version int not null,
  ai_decision_id uuid,
  structured jsonb not null,
  trigger text not null default 'initial_report',
  created_at timestamptz not null default now(),
  unique (incident_id, version)
);

create table public.responders (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  org text,
  type text not null check (type in ('rescue','medical','volunteer','logistics','fire')),
  status text not null default 'available' check (status in ('available','en_route','on_scene','busy','offline')),
  capabilities text[] not null default '{}',
  current_load int not null default 0,
  max_concurrent int not null default 1,
  base_location geography(Point,4326),
  current_location geography(Point,4326),
  speed_kmh numeric not null default 25,
  is_simulated boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index responders_location_gix on public.responders using gist (current_location);
create index responders_caps_gin on public.responders using gin (capabilities);
create index responders_status_idx on public.responders (status);

create table public.responder_locations (
  id uuid primary key default gen_random_uuid(),
  responder_id uuid not null references public.responders(id) on delete cascade,
  location geography(Point,4326) not null,
  recorded_at timestamptz not null default now()
);

create table public.resources (
  id uuid primary key default gen_random_uuid(),
  kind text not null,
  label text not null,
  owner_responder_id uuid references public.responders(id) on delete set null,
  quantity_total int not null default 0,
  quantity_available int not null default 0,
  location geography(Point,4326),
  is_simulated boolean not null default false,
  updated_at timestamptz not null default now()
);

create table public.shelters (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  location geography(Point,4326) not null,
  capacity_total int not null default 0,
  capacity_used int not null default 0,
  status text not null default 'open' check (status in ('open','near_full','full','closed')),
  is_simulated boolean not null default false,
  updated_at timestamptz not null default now()
);

create table public.shelter_capacity_events (
  id uuid primary key default gen_random_uuid(),
  shelter_id uuid not null references public.shelters(id) on delete cascade,
  delta int not null,
  reason text,
  created_at timestamptz not null default now()
);

create table public.match_candidates (
  id uuid primary key default gen_random_uuid(),
  incident_id uuid not null references public.incidents(id) on delete cascade,
  responder_id uuid not null references public.responders(id) on delete cascade,
  rank int,
  score numeric not null default 0,
  factors jsonb not null default '{}',
  distance_km numeric,
  eta_minutes numeric,
  eligible boolean not null default true,
  exclusion_reason text,
  computed_at timestamptz not null default now(),
  invalidated_at timestamptz,
  invalidation_reason text
);
create index match_candidates_incident_idx on public.match_candidates (incident_id, score desc);

create table public.assignments (
  id uuid primary key default gen_random_uuid(),
  incident_id uuid not null references public.incidents(id) on delete cascade,
  responder_id uuid not null references public.responders(id) on delete cascade,
  status text not null default 'recommended' check (status in
    ('recommended','awaiting_approval','dispatched','accepted','declined',
     'en_route','on_scene','completed','cancelled','invalidated')),
  match_score numeric not null default 0,
  match_factors jsonb not null default '{}',
  eta_minutes numeric,
  ai_decision_id uuid,
  ai_rationale text[],
  requires_approval boolean not null default true,
  approved_by uuid references public.profiles(id) on delete set null,
  approved_at timestamptz,
  declined_reason text,
  invalidation_reason text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index assignments_incident_idx on public.assignments (incident_id);

-- THE CONFLICT GUARD: a responder can hold only one active commitment.
create unique index one_active_assignment_per_responder
  on public.assignments (responder_id)
  where status in ('dispatched','accepted','en_route','on_scene');

create unique index one_open_recommendation_per_incident
  on public.assignments (incident_id)
  where status in ('recommended','awaiting_approval');

create table public.ai_decisions (
  id uuid primary key default gen_random_uuid(),
  incident_id uuid references public.incidents(id) on delete cascade,
  agent text not null check (agent in ('incident_intelligence','response_planner','ops_summarizer')),
  provider text not null,
  model text not null,
  prompt_version text not null,
  input_summary text,
  structured_output jsonb,
  raw_output text,
  confidence numeric,
  latency_ms int,
  prompt_tokens int,
  completion_tokens int,
  validation_status text not null check (validation_status in ('valid','repaired','rejected')),
  fallback_used boolean not null default false,
  error_text text,
  created_at timestamptz not null default now()
);
create index ai_decisions_incident_idx on public.ai_decisions (incident_id, created_at desc);

create table public.decision_factors (
  id uuid primary key default gen_random_uuid(),
  subject_type text not null check (subject_type in ('priority','match')),
  subject_id uuid not null,
  incident_id uuid references public.incidents(id) on delete cascade,
  label text not null,
  detail text,
  contribution numeric not null,
  direction text not null default 'positive' check (direction in ('positive','negative','neutral')),
  created_at timestamptz not null default now()
);
create index decision_factors_subject_idx on public.decision_factors (subject_type, subject_id);

-- Timeline + audit log + realtime bus, all in one append-only table.
create table public.system_events (
  id uuid primary key default gen_random_uuid(),
  seq bigserial unique,
  type text not null,
  entity_type text not null,
  entity_id uuid,
  incident_id uuid references public.incidents(id) on delete cascade,
  actor_type text not null default 'system' check (actor_type in ('system','ai','user')),
  actor_id uuid,
  actor_label text,
  correlation_id uuid,
  payload jsonb not null default '{}',
  simulation_run_id uuid,
  created_at timestamptz not null default now()
);
create index system_events_seq_idx on public.system_events (seq desc);
create index system_events_incident_idx on public.system_events (incident_id, seq desc);

create table public.notifications (
  id uuid primary key default gen_random_uuid(),
  target_role text,
  target_user uuid references public.profiles(id) on delete cascade,
  severity text not null default 'info' check (severity in ('info','warning','critical')),
  title text not null,
  body text,
  incident_id uuid references public.incidents(id) on delete cascade,
  created_at timestamptz not null default now(),
  read_at timestamptz
);

create table public.simulation_runs (
  id uuid primary key default gen_random_uuid(),
  scenario text not null,
  status text not null default 'running' check (status in ('running','completed','stopped')),
  steps jsonb not null default '[]',
  current_step int not null default 0,
  started_at timestamptz not null default now(),
  ended_at timestamptz
);

create or replace function public.touch_updated_at() returns trigger
language plpgsql as $$
begin new.updated_at = now(); return new; end $$;

create trigger t_incidents_touch before update on public.incidents
  for each row execute function public.touch_updated_at();
create trigger t_responders_touch before update on public.responders
  for each row execute function public.touch_updated_at();
create trigger t_assignments_touch before update on public.assignments
  for each row execute function public.touch_updated_at();
