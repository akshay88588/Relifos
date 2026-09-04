-- ReliefOS 0003: mirrored lat/lng columns
-- PostGIS geography remains the authoritative column for all spatial queries
-- (ST_DWithin / ST_Distance in nearby_capable_responders). These numeric columns
-- exist so the API can transport coordinates as JSON without the client having
-- to decode WKB. A trigger keeps them consistent.

alter table public.incidents  add column lat double precision, add column lng double precision;
alter table public.responders add column lat double precision, add column lng double precision;
alter table public.shelters   add column lat double precision, add column lng double precision;
alter table public.resources  add column lat double precision, add column lng double precision;

create or replace function public.sync_latlng() returns trigger
language plpgsql as $$
begin
  if new.location is null then
    new.lat := null; new.lng := null;
  else
    new.lat := st_y(new.location::geometry);
    new.lng := st_x(new.location::geometry);
  end if;
  return new;
end $$;

create or replace function public.sync_latlng_current() returns trigger
language plpgsql as $$
begin
  if new.current_location is null then
    new.lat := null; new.lng := null;
  else
    new.lat := st_y(new.current_location::geometry);
    new.lng := st_x(new.current_location::geometry);
  end if;
  return new;
end $$;

create trigger t_incidents_latlng before insert or update of location on public.incidents
  for each row execute function public.sync_latlng();
create trigger t_shelters_latlng before insert or update of location on public.shelters
  for each row execute function public.sync_latlng();
create trigger t_resources_latlng before insert or update of location on public.resources
  for each row execute function public.sync_latlng();
create trigger t_responders_latlng before insert or update of current_location on public.responders
  for each row execute function public.sync_latlng_current();

create or replace function public.make_point(p_lng double precision, p_lat double precision)
returns geography language sql immutable as $$
  select st_setsrid(st_makepoint(p_lng, p_lat), 4326)::geography;
$$;
