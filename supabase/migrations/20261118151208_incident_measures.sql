alter table public.incident_events
  drop constraint incident_events_event_type_check,
  add constraint incident_events_event_type_check
    check (event_type in ('created', 'observed', 'status_changed', 'reopened', 'measure_recorded'));

create function public.record_incident_measure(
  p_org uuid, p_actor uuid, p_operation uuid, p_incident uuid, p_note text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  prior public.incident_events%rowtype;
  note text := btrim(p_note);
begin
  if public.incident_actor_role(p_org, p_actor) not in ('owner', 'admin') then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  if p_operation is null or p_incident is null then
    raise exception 'invalid_request' using errcode = '22023';
  end if;
  if note is null or note !~ '[^[:space:]]' or length(note) > 4000 then
    raise exception 'invalid_note' using errcode = '22023';
  end if;
  if not exists (select 1 from public.incidents where org_id = p_org and id = p_incident) then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  insert into public.incident_events (id, org_id, incident_id, actor_id, event_type, reason)
  values (p_operation, p_org, p_incident, p_actor, 'measure_recorded', note)
  on conflict (id) do nothing;

  if not found then
    select * into prior from public.incident_events where id = p_operation;
    if prior.org_id is distinct from p_org or prior.incident_id is distinct from p_incident
       or prior.actor_id is distinct from p_actor or prior.event_type is distinct from 'measure_recorded'
       or prior.reason is distinct from note then
      raise exception 'operation_conflict' using errcode = '40001';
    end if;
  end if;
  return jsonb_build_object('ok', true, 'id', p_incident, 'operation_id', p_operation);
end;
$$;

revoke all on function public.record_incident_measure(uuid, uuid, uuid, uuid, text) from public, anon, authenticated;
grant execute on function public.record_incident_measure(uuid, uuid, uuid, uuid, text) to service_role;
