-- ReliefOS 0005: demo operator accounts
-- Fictional operator identities for the demonstration environment. Password for
-- all three is 'reliefos-demo'. Change or remove these before any real use.
-- NOTE: the domain must be a real TLD. Hosted Supabase Auth rejects reserved TLDs
-- such as .demo / .test / .invalid with email_address_invalid.
do $$
declare
  v_id uuid;
  r record;
begin
  for r in
    select * from (values
      ('coordinator@reliefos.com', 'coordinator', 'Ops Coordinator'),
      ('responder@reliefos.com',   'responder',   'Field Responder'),
      ('citizen@reliefos.com',     'citizen',     'Demo Citizen')
    ) as t(email, role, name)
  loop
    if not exists (select 1 from auth.users u where u.email = r.email) then
      v_id := gen_random_uuid();
      insert into auth.users (
        instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
        raw_app_meta_data, raw_user_meta_data, created_at, updated_at
      ) values (
        '00000000-0000-0000-0000-000000000000', v_id, 'authenticated', 'authenticated',
        r.email, crypt('reliefos-demo', gen_salt('bf')), now(),
        -- role lives in app_metadata: the client cannot write it (see 0009)
        jsonb_build_object('provider','email','providers',jsonb_build_array('email'),'role', r.role),
        jsonb_build_object('display_name', r.name),
        now(), now()
      );
      insert into auth.identities (
        provider_id, user_id, identity_data, provider, last_sign_in_at, created_at, updated_at
      ) values (
        v_id::text, v_id,
        jsonb_build_object('sub', v_id::text, 'email', r.email, 'email_verified', true),
        'email', now(), now(), now()
      );
    end if;
  end loop;
end $$;

update public.profiles p set role = 'coordinator', display_name = 'Ops Coordinator'
  from auth.users u where u.id = p.id and u.email = 'coordinator@reliefos.com';
update public.profiles p set role = 'responder', display_name = 'Field Responder'
  from auth.users u where u.id = p.id and u.email = 'responder@reliefos.com';
