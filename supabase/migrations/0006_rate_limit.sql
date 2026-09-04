-- ReliefOS 0006: shared fixed-window rate limiter
--
-- lib/api/http.ts calls public.consume_rate_limit() on every public endpoint.
-- Without this function the RPC errors, the code falls back to a per-process
-- memory window, and on a serverless platform (where each lambda instance has
-- its own memory) the published limit is effectively unenforced. This migration
-- makes the documented behaviour real: one counter, shared by every instance.

create table if not exists public.rate_limits (
  key text primary key,
  count int not null default 0,
  window_start timestamptz not null default now()
);

alter table public.rate_limits enable row level security;
-- No policies: only the service role (server route handlers) may touch this.

-- Returns true when the caller is inside the limit, false when it is exceeded.
-- security definer so it runs with the owner's rights; the table stays closed.
create or replace function public.consume_rate_limit(
  p_key text,
  p_limit int,
  p_window_seconds int default 60
) returns boolean
language plpgsql security definer set search_path = public as $$
declare
  v_count int;
begin
  insert into public.rate_limits as rl (key, count, window_start)
  values (p_key, 1, now())
  on conflict (key) do update
    set count = case
          when rl.window_start < now() - make_interval(secs => p_window_seconds) then 1
          else rl.count + 1
        end,
        window_start = case
          when rl.window_start < now() - make_interval(secs => p_window_seconds) then now()
          else rl.window_start
        end
  returning rl.count into v_count;

  return v_count <= p_limit;
end $$;

revoke all on function public.consume_rate_limit(text, int, int) from public, anon, authenticated;

-- Housekeeping: drop windows nobody has touched in an hour.
create or replace function public.prune_rate_limits() returns void
language sql security definer set search_path = public as $$
  delete from public.rate_limits where window_start < now() - interval '1 hour';
$$;
