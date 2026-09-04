-- ReliefOS 0004: runtime tuning values (Chaos Mode raises congestion_factor)
create table public.app_config (
  key text primary key,
  value jsonb not null,
  updated_at timestamptz not null default now()
);
alter table public.app_config enable row level security;
create policy staff_read_config on public.app_config for select to authenticated using (public.is_staff());

insert into public.app_config (key, value) values
  ('congestion_factor', '1.0'::jsonb),
  ('simulation_active', 'false'::jsonb);
