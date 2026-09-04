-- ReliefOS 0009: close two privilege-escalation paths in self-service sign-up
--
-- Vector A - app_config.signup_default_role was 'coordinator', so EVERY email or
--   OAuth sign-up became a coordinator with full dispatch control. Confirmed in
--   production: an ordinary sign-up carrying no role metadata held 'coordinator'.
--
-- Vector B - the trigger trusted new.raw_user_meta_data->>'role'.
--   raw_user_meta_data is CLIENT-SUPPLIED. Anyone could run
--     supabase.auth.signUp({ options: { data: { role: 'admin' } } })
--   from a browser console and self-grant admin. Our own form never sent that
--   field, but an attacker does not use our form.
--
-- Fix: the default is hardcoded 'citizen'. A privileged role may only arrive in
-- raw_app_meta_data, which the anon/authenticated client cannot write - it is
-- settable only by the service role or the admin API. The config indirection is
-- removed entirely so there is no switch that can re-open this.

delete from public.app_config where key = 'signup_default_role';

-- Seeded demo accounts carried their role in raw_user_meta_data; move it to the
-- admin-controlled field so they keep working under the new rule.
update auth.users
   set raw_app_meta_data = coalesce(raw_app_meta_data, '{}'::jsonb)
       || jsonb_build_object('role', raw_user_meta_data->>'role')
 where raw_user_meta_data ? 'role'
   and email in ('coordinator@reliefos.com','responder@reliefos.com','citizen@reliefos.com');

create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  v_role text;
  v_name text;
begin
  -- Only raw_app_meta_data may carry a role.
  v_role := coalesce(new.raw_app_meta_data->>'role', 'citizen');

  if v_role not in ('citizen','coordinator','responder','admin') then
    v_role := 'citizen';
  end if;

  -- Display name may come from the client: it is cosmetic and authorises nothing.
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
