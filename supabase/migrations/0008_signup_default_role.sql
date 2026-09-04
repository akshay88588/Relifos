-- ReliefOS 0008: role assignment for self-service email sign-ups
--
-- handle_new_user previously hardcoded 'citizen' for anyone without an explicit
-- role in their user metadata. That is correct for a member of the public, but
-- it means an operator who registers with email + password lands on /command
-- and is refused by is_staff(). The role granted to a self-service sign-up is
-- therefore configuration rather than code, so it can be changed without a
-- redeploy:
--
--   select value #>> '{}' from public.app_config where key = 'signup_default_role';
--
-- Set to 'coordinator' for the hackathon demo so judges can register and walk
-- the whole system. AFTER JUDGING, lock it down with one statement:
--
--   update public.app_config set value = '"citizen"'::jsonb
--    where key = 'signup_default_role';
--
-- The seeded demo accounts (migration 0005) carry an explicit role in their
-- user metadata and are unaffected by this setting.

insert into public.app_config (key, value)
values ('signup_default_role', '"coordinator"'::jsonb)
on conflict (key) do update set value = excluded.value, updated_at = now();

create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  v_role text;
  v_name text;
begin
  -- 1. An explicit role in user metadata wins (the seeded demo accounts).
  -- 2. Otherwise the configured self-service default.
  -- 3. Otherwise 'citizen'.
  v_role := coalesce(
    new.raw_user_meta_data->>'role',
    (select value #>> '{}' from public.app_config where key = 'signup_default_role'),
    'citizen'
  );

  -- Never let an unexpected value slip past the profiles role CHECK constraint.
  if v_role not in ('citizen','coordinator','responder','admin') then
    v_role := 'citizen';
  end if;

  v_name := coalesce(
    nullif(new.raw_user_meta_data->>'display_name', ''),
    nullif(new.raw_user_meta_data->>'full_name', ''),
    nullif(new.raw_user_meta_data->>'name', ''),
    split_part(coalesce(new.email, 'user@unknown'), '@', 1)
  );

  insert into public.profiles (id, role, display_name)
  values (new.id, v_role, v_name)
  on conflict (id) do nothing;

  return new;
end $$;

revoke execute on function public.handle_new_user() from public, anon, authenticated;
