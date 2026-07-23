-- Preview: Fortify Paddle webhook idempotency state and atomic claim/retry

begin;

alter table public.paddle_webhook_events
	add column if not exists occurred_at timestamptz,
	add column if not exists attempt_count integer not null default 0,
	add column if not exists last_error text,
	add column if not exists updated_at timestamptz not null default now();

-- Keep historical rows compatible with the new state model.
update public.paddle_webhook_events
set
	occurred_at = coalesce(occurred_at, received_at),
	status = coalesce(status, 'applied'),
	attempt_count = case
		when coalesce(attempt_count, 0) <= 0 then 1
		else attempt_count
	end,
	updated_at = coalesce(updated_at, now())
where occurred_at is null
	 or status is null
	 or attempt_count is null
	 or attempt_count <= 0
	 or updated_at is null;

alter table public.paddle_webhook_events
	alter column occurred_at set not null,
	alter column status set default 'received',
	alter column status set not null,
	alter column processed_at drop not null,
	alter column processed_at drop default;

alter table if exists public.paddle_webhook_events
	drop constraint if exists paddle_webhook_events_status_check;

alter table public.paddle_webhook_events
	add constraint paddle_webhook_events_status_check
	check (status in ('received', 'processing', 'applied', 'failed'));

create or replace function public.set_paddle_webhook_events_updated_at()
returns trigger
language plpgsql
as $$
begin
	new.updated_at := now();
	return new;
end;
$$;

revoke all on function public.set_paddle_webhook_events_updated_at() from public;
revoke all on function public.set_paddle_webhook_events_updated_at() from anon;
revoke all on function public.set_paddle_webhook_events_updated_at() from authenticated;
grant execute on function public.set_paddle_webhook_events_updated_at() to postgres;

drop trigger if exists trg_paddle_webhook_events_updated_at on public.paddle_webhook_events;

create trigger trg_paddle_webhook_events_updated_at
before update on public.paddle_webhook_events
for each row
execute function public.set_paddle_webhook_events_updated_at();

create or replace function public.claim_paddle_webhook_event(
	p_event_id text,
	p_event_type text,
	p_occurred_at timestamptz,
	p_received_at timestamptz default now()
)
returns table (
	claimed boolean,
	previous_status text,
	new_status text,
	attempt_count integer
)
language plpgsql
security definer
set search_path = public
as $$
declare
	v_now timestamptz := now();
	v_prev_status text;
	v_claimed boolean;
	v_previous_status text;
	v_new_status text;
	v_attempt_count integer;
begin
	if nullif(btrim(p_event_id), '') is null then
		raise exception 'p_event_id is required';
	end if;

	if nullif(btrim(p_event_type), '') is null then
		raise exception 'p_event_type is required';
	end if;

	if p_occurred_at is null then
		raise exception 'p_occurred_at is required';
	end if;

	insert into public.paddle_webhook_events as pwe (
		event_id,
		event_type,
		occurred_at,
		received_at,
		status,
		processed_at,
		attempt_count,
		last_error,
		updated_at
	)
	values (
		p_event_id,
		p_event_type,
		p_occurred_at,
		coalesce(p_received_at, v_now),
		'processing',
		null,
		1,
		null,
		v_now
	)
	on conflict (event_id) do nothing
	returning true, null::text, pwe.status, pwe.attempt_count
	into v_claimed, v_previous_status, v_new_status, v_attempt_count;

	if found then
		claimed := v_claimed;
		previous_status := v_previous_status;
		new_status := v_new_status;
		attempt_count := v_attempt_count;
		return next;
		return;
	end if;

	update public.paddle_webhook_events as pwe
	set
		status = 'processing',
		processed_at = null,
		attempt_count = pwe.attempt_count + 1,
		last_error = null,
		event_type = coalesce(pwe.event_type, p_event_type),
		occurred_at = coalesce(pwe.occurred_at, p_occurred_at),
		received_at = coalesce(pwe.received_at, coalesce(p_received_at, v_now)),
		updated_at = v_now
	from (
		select event_id, status, updated_at
		from public.paddle_webhook_events
		where event_id = p_event_id
		for update
	) locked
	where pwe.event_id = locked.event_id
		and (
			locked.status = 'failed'
			or (
				locked.status = 'processing'
				and locked.updated_at < (v_now - interval '15 minutes')
			)
		)
	returning locked.status, pwe.status, pwe.attempt_count
	into v_prev_status, v_new_status, v_attempt_count;

	if found then
		claimed := true;
		previous_status := v_prev_status;
		new_status := v_new_status;
		attempt_count := v_attempt_count;
		return next;
		return;
	end if;

	select
		false,
		pwe.status,
		pwe.status,
		coalesce(pwe.attempt_count, 0)
	into v_claimed, v_previous_status, v_new_status, v_attempt_count
	from public.paddle_webhook_events as pwe
	where event_id = p_event_id;

	claimed := v_claimed;
	previous_status := v_previous_status;
	new_status := v_new_status;
	attempt_count := v_attempt_count;

	return next;
end;
$$;

comment on function public.claim_paddle_webhook_event(text, text, timestamptz, timestamptz)
is 'Atomically claims a Paddle webhook event_id using INSERT ON CONFLICT: inserts new events, retries failed, and can recover stale processing after 15 minutes.';

revoke all on function public.claim_paddle_webhook_event(text, text, timestamptz, timestamptz) from public;
revoke all on function public.claim_paddle_webhook_event(text, text, timestamptz, timestamptz) from anon;
revoke all on function public.claim_paddle_webhook_event(text, text, timestamptz, timestamptz) from authenticated;
grant execute on function public.claim_paddle_webhook_event(text, text, timestamptz, timestamptz) to service_role;
grant execute on function public.claim_paddle_webhook_event(text, text, timestamptz, timestamptz) to postgres;

create or replace function public.mark_paddle_webhook_event_applied(
	p_event_id text
)
returns table (
	updated boolean,
	previous_status text,
	new_status text,
	processed_at timestamptz
)
language plpgsql
security definer
set search_path = public
as $$
declare
	v_current_status text;
	v_new_status text;
	v_processed_at timestamptz;
begin
	if nullif(btrim(p_event_id), '') is null then
		raise exception 'p_event_id is required';
	end if;

	select pwe.status
	into v_current_status
	from public.paddle_webhook_events as pwe
	where pwe.event_id = p_event_id
	for update;

	if not found then
		raise exception 'event_id not found: %', p_event_id;
	end if;

	if v_current_status <> 'processing' then
		raise exception 'invalid status transition: % -> applied', v_current_status;
	end if;

	update public.paddle_webhook_events as pwe
	set
		status = 'applied',
		processed_at = now(),
		last_error = null,
		updated_at = now()
	where pwe.event_id = p_event_id
	returning pwe.status, pwe.processed_at
	into v_new_status, v_processed_at;

	updated := true;
	previous_status := v_current_status;
	new_status := v_new_status;
	processed_at := v_processed_at;
	return next;
end;
$$;

comment on function public.mark_paddle_webhook_event_applied(text)
is 'Marks a Paddle webhook event as applied, only allowing processing -> applied transitions.';

revoke all on function public.mark_paddle_webhook_event_applied(text) from public;
revoke all on function public.mark_paddle_webhook_event_applied(text) from anon;
revoke all on function public.mark_paddle_webhook_event_applied(text) from authenticated;
grant execute on function public.mark_paddle_webhook_event_applied(text) to service_role;
grant execute on function public.mark_paddle_webhook_event_applied(text) to postgres;

create or replace function public.mark_paddle_webhook_event_failed(
	p_event_id text,
	p_last_error text default null
)
returns table (
	updated boolean,
	previous_status text,
	new_status text,
	processed_at timestamptz,
	last_error text
)
language plpgsql
security definer
set search_path = public
as $$
declare
	v_current_status text;
	v_new_status text;
	v_processed_at timestamptz;
	v_last_error text;
	v_last_error_normalized text;
begin
	if nullif(btrim(p_event_id), '') is null then
		raise exception 'p_event_id is required';
	end if;

	select pwe.status
	into v_current_status
	from public.paddle_webhook_events as pwe
	where pwe.event_id = p_event_id
	for update;

	if not found then
		raise exception 'event_id not found: %', p_event_id;
	end if;

	if v_current_status <> 'processing' then
		raise exception 'invalid status transition: % -> failed', v_current_status;
	end if;

	v_last_error_normalized :=
		left(coalesce(nullif(btrim(p_last_error), ''), 'Unknown processing error'), 2000);

	update public.paddle_webhook_events as pwe
	set
		status = 'failed',
		processed_at = null,
		last_error = v_last_error_normalized,
		updated_at = now()
	where pwe.event_id = p_event_id
	returning pwe.status, pwe.processed_at, pwe.last_error
	into v_new_status, v_processed_at, v_last_error;

	updated := true;
	previous_status := v_current_status;
	new_status := v_new_status;
	processed_at := v_processed_at;
	last_error := v_last_error;
	return next;
end;
$$;

comment on function public.mark_paddle_webhook_event_failed(text, text)
is 'Marks a Paddle webhook event as failed, only allowing processing -> failed transitions.';

revoke all on function public.mark_paddle_webhook_event_failed(text, text) from public;
revoke all on function public.mark_paddle_webhook_event_failed(text, text) from anon;
revoke all on function public.mark_paddle_webhook_event_failed(text, text) from authenticated;
grant execute on function public.mark_paddle_webhook_event_failed(text, text) to service_role;
grant execute on function public.mark_paddle_webhook_event_failed(text, text) to postgres;

commit;
