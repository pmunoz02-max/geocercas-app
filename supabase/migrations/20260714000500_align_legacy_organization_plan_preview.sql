begin;

alter table public.organizations
	alter column plan set default 'free'::public.plan_code;

create or replace function public.sync_organization_plan_from_org_billing()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
begin
	if not exists (
		select 1
		from public.plans p
		where p.code::text = new.plan_code
	) then
		raise exception
		  'Invalid billing plan_code for organization sync: %',
		  new.plan_code;
	end if;

	update public.organizations
		 set plan = new.plan_code::public.plan_code
	 where id = new.org_id
		 and plan is distinct from new.plan_code::public.plan_code;

	return new;
end;
$$;

alter function public.sync_organization_plan_from_org_billing() owner to postgres;

drop trigger if exists trg_org_billing_sync_organization_plan on public.org_billing;

create trigger trg_org_billing_sync_organization_plan
after insert or update of plan_code on public.org_billing
for each row
execute function public.sync_organization_plan_from_org_billing();

do $$
declare
	v_invalid_count integer;
begin
	select count(*)
	into v_invalid_count
	from public.org_billing b
	left join public.plans p
	  on p.code::text = b.plan_code
	where p.code is null;

	if v_invalid_count <> 0 then
		raise exception
		  'Cannot synchronize organizations.plan: % invalid org_billing plan codes',
		  v_invalid_count;
	end if;

	update public.organizations o
		 set plan = b.plan_code::public.plan_code
		from public.org_billing b
	 where b.org_id = o.id
		 and o.plan is distinct from b.plan_code::public.plan_code;
end
$$;

create or replace function public.bootstrap_user_context() returns jsonb
		language plpgsql security definer
		set search_path to 'public', 'auth', 'extensions'
		as $_$
declare
	v_uid uuid;
	v_email text;
	v_org_id uuid;
	v_role role_type;

	v_plan_value text;

	v_org_name text;
	v_has_active boolean;

	v_pos_interval int;
	v_pos_default_expr text;

	v_role_text text;
	v_role_legacy text;

	v_personal_id uuid;
begin
	v_uid := auth.uid();
	if v_uid is null then
		raise exception 'No auth.uid() in request';
	end if;

	select u.email into v_email
	from auth.users u
	where u.id = v_uid;

	if v_email is null then
		v_email := current_setting('request.jwt.claim.email', true);
	end if;

	if v_email is null then
		v_email := 'user-' || v_uid::text;
	end if;

	v_org_name := split_part(v_email, '@', 1);

	select p.code::text
	  into v_plan_value
	  from public.plans p
	 where p.code::text = 'free'
	 limit 1;

	if v_plan_value is null then
		raise exception 'public.plans does not contain free';
	end if;

	-- La organización personal nueva arranca en free
	-- sin depender del orden del enum organizations.plan.
	-- ¿Tiene memberships activas?
	select exists (
		select 1
		from public.memberships m
		where m.user_id = v_uid
			and m.revoked_at is null
	) into v_has_active;

	if not v_has_active then
		execute format($f$
			insert into public.organizations
				(id, name, owner_id, plan, created_at, updated_at, created_by, active, suspended, is_personal)
			values
				(extensions.gen_random_uuid(), %L, %L, %L::public.plan_code, now(), now(), %L, true, false, true)
			returning id
		$f$,
			v_org_name,
			v_uid,
			v_plan_value,
			v_uid
		)
		into v_org_id;

		insert into public.memberships (org_id, user_id, role, is_default, revoked_at, created_at)
		values (v_org_id, v_uid, 'owner'::role_type, true, null, now())
		on conflict (org_id, user_id)
		do update set
			role = excluded.role,
			is_default = true,
			revoked_at = null;
	end if;

	-- Resolver default org
	select m.org_id, m.role
		into v_org_id, v_role
	from public.memberships m
	where m.user_id = v_uid
		and m.revoked_at is null
		and m.is_default = true
	order by m.created_at nulls last
	limit 1;

	if v_org_id is null then
		select m.org_id, m.role
			into v_org_id, v_role
		from public.memberships m
		where m.user_id = v_uid
			and m.revoked_at is null
		order by m.created_at nulls last
		limit 1;

		if v_org_id is null then
			raise exception 'No active membership after bootstrap for user %', v_uid;
		end if;

		update public.memberships
		set is_default = false
		where user_id = v_uid;

		update public.memberships
		set is_default = true
		where user_id = v_uid
			and org_id = v_org_id;
	end if;

	select m.role
		into v_role
	from public.memberships m
	where m.user_id = v_uid
		and m.org_id = v_org_id
		and m.revoked_at is null
	limit 1;

	if v_role is null then
		raise exception 'Could not resolve role for user % in org %', v_uid, v_org_id;
	end if;

	-- role mappings
	v_role_text := v_role::text;
	v_role_legacy := case v_role_text
		when 'owner' then 'Owner'
		when 'admin' then 'Admin'
		when 'tracker' then 'Tracker'
		when 'viewer' then 'Viewer'
		else initcap(v_role_text)
	end;

	-- DEFAULT real de position_interval_sec (si existe)
	select pg_get_expr(d.adbin, d.adrelid)
		into v_pos_default_expr
	from pg_attrdef d
	join pg_class c on c.oid = d.adrelid
	join pg_namespace n on n.oid = c.relnamespace
	join pg_attribute a on a.attrelid = c.oid and a.attnum = d.adnum
	where n.nspname='public'
		and c.relname='personal'
		and a.attname='position_interval_sec'
	limit 1;

	if v_pos_default_expr is not null then
		begin
			v_pos_interval := v_pos_default_expr::int;
		exception when others then
			v_pos_interval := null;
		end;
	end if;

	if v_pos_interval is null then
		v_pos_interval := 300;
	end if;

	-- ✅ Sync legacy: si existían rows antiguas owner_id=user y user_id null, se corrige
	update public.personal
	set user_id = v_uid
	where owner_id = v_uid
		and user_id is null
		and is_deleted = false;

	-- ✅ UPSERT CANÓNICO: 1 fila por (user_id, org_id)
	insert into public.personal (
		id, nombre, email, owner_id, user_id, org_id,
		created_at, updated_at,
		vigente, position_interval_sec, is_deleted
	) values (
		extensions.gen_random_uuid(),
		v_org_name,
		v_email,
		v_uid,
		v_uid,
		v_org_id,
		now(),
		now(),
		true,
		v_pos_interval,
		false
	)
	on conflict (user_id, org_id)
	do update set
		email = coalesce(public.personal.email, excluded.email),
		nombre = coalesce(public.personal.nombre, excluded.nombre),
		owner_id = coalesce(public.personal.owner_id, excluded.owner_id),
		vigente = coalesce(public.personal.vigente, excluded.vigente),
		position_interval_sec = coalesce(public.personal.position_interval_sec, excluded.position_interval_sec),
		is_deleted = false,
		updated_at = now()
	returning id into v_personal_id;

	-- ✅ También aseguramos que la fila existente tenga org/email (por si venía incompleta)
	update public.personal
	set org_id = v_org_id,
			email = coalesce(email, v_email),
			updated_at = now()
	where user_id = v_uid
		and org_id = v_org_id
		and is_deleted = false;

	-- Legacy tables (no deben tumbar bootstrap)
	begin
		insert into public.app_user_roles (id, user_id, org_id, role, created_at)
		values (extensions.gen_random_uuid(), v_uid, v_org_id, v_role_legacy, now())
		on conflict (user_id, org_id)
		do update set role = excluded.role;
	exception when others then
		-- ignore
	end;

	begin
		insert into public.user_organizations (id, user_id, org_id, role, created_at)
		values (extensions.gen_random_uuid(), v_uid, v_org_id, v_role_legacy, now())
		on conflict (org_id, user_id)
		do update set role = excluded.role;
	exception when others then
		-- ignore
	end;

	return jsonb_build_object('org_id', v_org_id, 'role', v_role_text, 'personal_id', v_personal_id);
end;
$_$;

alter function public.bootstrap_user_context() owner to postgres;

do $$
declare
	v_mismatch_count integer;
	v_default text;
begin
	select count(*)
	into v_mismatch_count
	from public.organizations o
	join public.org_billing b
	  on b.org_id = o.id
	where o.plan::text is distinct from b.plan_code;

	if v_mismatch_count <> 0 then
		raise exception
		  'organizations.plan synchronization failed: % mismatches remain',
		  v_mismatch_count;
	end if;

	select pg_get_expr(ad.adbin, ad.adrelid)
	into v_default
	from pg_attrdef ad
	join pg_class c
	  on c.oid = ad.adrelid
	join pg_namespace n
	  on n.oid = c.relnamespace
	join pg_attribute a
	  on a.attrelid = c.oid
	 and a.attnum = ad.adnum
	where n.nspname = 'public'
	  and c.relname = 'organizations'
	  and a.attname = 'plan';

	if v_default not in (
	  '''free''::plan_code',
	  '''free''::public.plan_code'
	) then
		raise exception
		  'Unexpected organizations.plan default: %',
		  v_default;
	end if;
end
$$;

commit;
