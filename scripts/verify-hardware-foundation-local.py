"""Run hardware foundation tests in a NEW local PostgreSQL cluster only.
No DSN/remote-host option. Requires portable PostgreSQL and psycopg 3.
Fixture is deliberately minimal, NOT a clone of Supabase/Android.
"""
import argparse
from concurrent.futures import ThreadPoolExecutor
import json
import os
from pathlib import Path
import secrets
import socket
import subprocess
import tempfile
import time
import uuid

import psycopg

ROOT = Path(__file__).resolve().parents[1]
MIGRATION = ROOT / 'supabase/migrations/20260927174712_hardware_tracker_foundation_preview.sql'
MAIN_TEST = ROOT / 'supabase/verification/hardware_tracker_foundation_preview.sql'
MARKER = 'mujwsfhkocsuuahlrssn'
BOOTSTRAP = """
CREATE ROLE anon NOLOGIN;
CREATE ROLE authenticated NOLOGIN;
CREATE ROLE service_role NOLOGIN BYPASSRLS;
GRANT USAGE ON SCHEMA public TO anon,authenticated,service_role;
CREATE SCHEMA auth;
CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$
 SELECT nullif(current_setting('request.jwt.claim.sub',true),'')::uuid
$$;
GRANT USAGE ON SCHEMA auth TO authenticated,service_role;
CREATE TABLE public.organizations(id uuid PRIMARY KEY, owner_id uuid NOT NULL);
CREATE TABLE public.memberships(org_id uuid NOT NULL REFERENCES public.organizations(id),
 user_id uuid NOT NULL, role text NOT NULL, revoked_at timestamptz, PRIMARY KEY(org_id,user_id));
CREATE FUNCTION public.has_org_role_active(_org_id uuid,_roles text[]) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path='public' AS $$
 SELECT EXISTS(SELECT 1 FROM public.memberships m WHERE m.user_id=auth.uid()
 AND m.org_id=_org_id AND m.revoked_at IS NULL AND m.role::text=ANY(_roles))
$$;
"""


def run_process(args, **kw):
    # Windows descendants can inherit captured pipes and keep communicate() open.
    # pg_ctl already writes server output to its explicit log; do not capture it.
    streams = ({'stdout': subprocess.DEVNULL, 'stderr': subprocess.DEVNULL,
                'stdin': subprocess.DEVNULL}
               if Path(args[0]).stem == 'pg_ctl' else {'capture_output': True})
    r = subprocess.run([str(x) for x in args], text=True, encoding='utf-8',
                       errors='replace', timeout=45, **streams,
                       creationflags=subprocess.CREATE_NO_WINDOW if os.name == 'nt' else 0, **kw)
    if r.returncode:
        raise RuntimeError((r.stdout or '') + (r.stderr or '') or f'Process failed: {Path(args[0]).name}')
    return r


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--pg-bin', type=Path, required=True)
    parser.add_argument('--work-dir', type=Path, required=True)
    parser.add_argument('--report', type=Path, required=True)
    parser.add_argument('--include-observations', action='store_true')
    args = parser.parse_args()
    bindir = args.pg_bin.resolve()
    args.work_dir.mkdir(parents=True, exist_ok=True)
    # Only the newly created child directory is used. No existing cluster accepted.
    lab = Path(tempfile.mkdtemp(prefix='hardware-test-', dir=args.work_dir.resolve())).resolve()
    assert lab.parent == args.work_dir.resolve()
    data = lab / 'data'
    password_file = lab / 'password.txt'
    password = secrets.token_urlsafe(32)
    password_file.write_text(password, encoding='ascii')
    env = {k: v for k, v in os.environ.items() if not k.startswith('PG')}
    env['PGPASSWORD'] = password
    env['PGCLIENTENCODING'] = 'UTF8'
    with socket.socket() as s:
        s.bind(('127.0.0.1', 0))
        port = s.getsockname()[1]
    suffix = '.exe' if os.name == 'nt' else ''
    pgctl = bindir / ('pg_ctl' + suffix)
    psql = bindir / ('psql' + suffix)
    started = False
    admin = None
    checks = []
    report = {'scope': 'local-only', 'fixture': 'minimal organizations/memberships/auth.uid; not Supabase clone',
              'migration': MIGRATION.name, 'checks': checks, 'work_dir': str(lab)}

    def passed(name):
        checks.append({'name': name, 'passed': True})
        print('PASS', name, flush=True)

    def connect(**kwargs):
        return psycopg.connect(host='127.0.0.1', port=port, user='postgres',
                              password=password, dbname='postgres', connect_timeout=5, **kwargs)

    def org(limit=None):
        oid, owner = uuid.uuid4(), uuid.uuid4()
        admin.execute('INSERT INTO public.organizations VALUES (%s,%s)', (oid, owner))
        admin.execute("INSERT INTO public.memberships VALUES (%s,%s,'owner',NULL)", (oid, owner))
        if limit is not None:
            admin.execute('INSERT INTO public.org_hardware_entitlements(org_id,enabled,max_hardware_trackers) VALUES(%s,true,%s)', (oid, limit))
        return oid, owner

    def tracker(oid, active=True):
        tid = uuid.uuid4()
        admin.execute("INSERT INTO public.trackers(id,org_id,name,asset_kind,active) VALUES(%s,%s,'SIM test','vehicle',%s)", (tid, oid, active))
        return tid

    def device(oid):
        did = uuid.uuid4()
        admin.execute("INSERT INTO public.tracker_devices(id,org_id,manufacturer,model,protocol,identifier_kind,external_id) VALUES(%s,%s,'sim','sim','normalized-simulator-v1','simulator',%s)", (did, oid, str(did)))
        return did

    def race(name, statement_a, statement_b, commit_a, expected_state=None, expected_message=None):
        with connect(application_name='hw_test_A') as a, connect(application_name='hw_test_B') as b:
            a.execute("SET LOCAL statement_timeout='15s'")
            b.execute("SET LOCAL statement_timeout='15s'")
            a.execute(statement_a)
            def worker():
                try:
                    b.execute(statement_b)
                    b.rollback()
                    return None, None
                except psycopg.Error as e:
                    b.rollback()
                    return e.sqlstate, e.diag.message_primary
            with ThreadPoolExecutor(max_workers=1) as pool:
                future = pool.submit(worker)
                deadline = time.monotonic() + 8
                saw_lock = False
                while time.monotonic() < deadline and not future.done():
                    row = admin.execute('SELECT wait_event_type FROM pg_stat_activity WHERE pid=%s', (b.info.backend_pid,)).fetchone()
                    if row and row[0] == 'Lock':
                        saw_lock = True
                        break
                    time.sleep(.05)
                if not saw_lock:
                    a.rollback()
                    raise AssertionError(f'{name}: B did not demonstrably wait for a database lock')
                a.commit() if commit_a else a.rollback()
                state, message = future.result(timeout=20)
                assert state == expected_state, (name, state, message)
                if expected_message:
                    assert message == expected_message, (name, message)
        passed(name + ' (two connections, lock observed)')

    try:
        run_process([bindir / ('initdb'+suffix), '-D', data, '-U', 'postgres', '-A', 'scram-sha-256',
                     '--pwfile', password_file, '--encoding=UTF8', '--locale=C'], env=env)
        password_file.unlink()
        print('Local cluster initialized; starting loopback-only server', flush=True)
        started = True
        run_process([pgctl, '-D', data, '-l', lab / 'postgres.log', '-o',
                     f'-h 127.0.0.1 -p {port} -c max_connections=12', '-w', 'start'], env=env)
        started = True
        admin = connect(autocommit=True)
        report['postgres_version'] = admin.execute('SELECT version()').fetchone()[0]
        print(report['postgres_version'], flush=True)
        admin.execute(BOOTSTRAP)
        migration = MIGRATION.read_text(encoding='utf-8-sig')
        with connect() as c:
            try:
                c.execute(migration)
            except psycopg.Error as e:
                assert e.diag.message_primary == 'hardware_preview_target_confirmation_required'
                c.rollback()
            else:
                raise AssertionError('Missing target interlock')
            assert c.execute("SELECT to_regnamespace('gnss_private')").fetchone()[0] is None
            c.execute("SELECT set_config('geofield.preview_project_ref',%s,true)", (MARKER,))
            c.execute(migration)
        passed('atomic migration and missing-marker rejection')
        oa, ua = org(); ob, ub = org()
        r = run_process([psql, '-X', '-h', '127.0.0.1', '-p', str(port), '-U', 'postgres', '-d', 'postgres',
                         '-v', 'ON_ERROR_STOP=1', '-v', f'org_a={oa}', '-v', f'org_b={ob}', '-f', MAIN_TEST], env=env)
        assert 'all fixture writes rolled back' in r.stdout
        assert admin.execute('SELECT count(*) FROM public.org_hardware_entitlements').fetchone()[0] == 0
        passed('existing transactional suite: quota 0/1/2, bindings, RLS, rollback')

        # Exercise actual backend role, not only owner privileges.
        oa, ua = org(2); ob, ub = org(2)
        with connect() as c:
            c.execute('SET LOCAL ROLE service_role')
            tid = c.execute("INSERT INTO public.trackers(org_id,name,asset_kind,active) VALUES(%s,'SIM backend','vehicle',true) RETURNING id", (oa,)).fetchone()[0]
            did = uuid.uuid4()
            c.execute("INSERT INTO public.tracker_devices(id,org_id,manufacturer,model,protocol,identifier_kind,external_id) VALUES(%s,%s,'sim','sim','normalized-simulator-v1','simulator',%s)", (did,oa,str(did)))
            c.execute('INSERT INTO public.tracker_device_bindings(org_id,tracker_id,device_id) VALUES(%s,%s,%s)', (oa,tid,did))
        passed('service_role can use all guards without direct private-function grants')
        actor = uuid.uuid4()
        admin.execute("INSERT INTO public.memberships VALUES(%s,%s,'admin',NULL)", (oa,actor))
        tables = ('org_hardware_entitlements','trackers','tracker_devices','tracker_device_bindings')
        def visible_counts():
            with connect() as c:
                c.execute("SELECT set_config('request.jwt.claim.sub',%s,true)", (str(actor),))
                c.execute('SET LOCAL ROLE authenticated')
                return [c.execute('SELECT count(*) FROM public.'+t).fetchone()[0] for t in tables]
        assert visible_counts() == [1,1,1,1]
        admin.execute('UPDATE public.memberships SET revoked_at=clock_timestamp() WHERE org_id=%s AND user_id=%s', (oa,actor))
        assert visible_counts() == [0,0,0,0]
        passed('revoked non-owner admin loses all four table reads')
        with connect() as c:
            c.execute('SET TRANSACTION ISOLATION LEVEL REPEATABLE READ')
            try:
                c.execute('UPDATE public.trackers SET name=name WHERE id=%s',(tid,))
            except psycopg.Error as e:
                assert (e.sqlstate,e.diag.message_primary)==('25001','hardware_requires_read_committed')
                c.rollback()
            else:
                raise AssertionError('REPEATABLE READ accepted')
        passed('unsafe isolation fails closed')
        missing_org, _ = org()
        with connect() as c:
            try:
                c.execute("INSERT INTO public.trackers(org_id,name,asset_kind,active) VALUES(%s,'missing cfg','vehicle',true)",(missing_org,))
            except psycopg.Error as e:
                assert e.sqlstate == '23503', (e.sqlstate,e.diag.message_primary)
                c.rollback()
            else:
                raise AssertionError('Missing entitlement accepted')
        passed('missing hardware entitlement rejects tracker')

        # Each race gets its own committed, disposable organization and identities.
        def insert_sql(oid,tid):
            return f"INSERT INTO public.trackers(id,org_id,name,asset_kind,active) VALUES('{tid}','{oid}','SIM race','vehicle',true)"
        for commit in (True,False):
            oid,_ = org(1); a_id,b_id=uuid.uuid4(),uuid.uuid4()
            race('last-slot '+('commit' if commit else 'rollback'),insert_sql(oid,a_id),insert_sql(oid,b_id),commit,
                 '23514' if commit else None,'hardware_limit_reached' if commit else None)
            assert admin.execute('SELECT count(*) FROM public.trackers WHERE org_id=%s AND active',(oid,)).fetchone()[0] == (1 if commit else 0)
        oid,_=org(1); inactive=tracker(oid,False)
        race('reactivation last slot',insert_sql(oid,uuid.uuid4()),f"UPDATE public.trackers SET active=true WHERE id='{inactive}'",True,'23514','hardware_limit_reached')
        oid,_=org(1)
        race('quota decrease vs activation',insert_sql(oid,uuid.uuid4()),f"UPDATE public.org_hardware_entitlements SET max_hardware_trackers=0 WHERE org_id='{oid}'",True,'23514','hardware_limit_reached')
        oid,_=org(2); t1,t2=tracker(oid),tracker(oid); d=device(oid)
        race('same device bound twice',f"INSERT INTO public.tracker_device_bindings(org_id,tracker_id,device_id) VALUES('{oid}','{t1}','{d}')",f"INSERT INTO public.tracker_device_bindings(org_id,tracker_id,device_id) VALUES('{oid}','{t2}','{d}')",True,'23505')
        oid,_=org(1); t=tracker(oid); d=device(oid)
        race('deactivation vs binding',f"UPDATE public.trackers SET active=false WHERE id='{t}'",f"INSERT INTO public.tracker_device_bindings(org_id,tracker_id,device_id) VALUES('{oid}','{t}','{d}')",True,'23514','hardware_binding_not_enabled')
        if args.include_observations:
            import runpy
            extension = runpy.run_path(str(ROOT / 'scripts/verify-hardware-observations-local.py'))
            extension['run'](connect, admin, passed)
            import hashlib
            report['observations_migration_sha256'] = hashlib.sha256(extension['MIGRATION'].read_bytes()).hexdigest()
        report['passed'] = True
    except Exception as e:
        report['passed'] = False
        report['error'] = str(e)
        raise
    finally:
        if admin:
            admin.close()
        if started:
            try:
                run_process([pgctl,'-D',data,'-m','immediate','-w','stop'],env=env)
                report['server_stopped'] = True
            except Exception as e:
                report['server_stopped'] = False
                report['shutdown_error'] = str(e)
        args.report.parent.mkdir(parents=True, exist_ok=True)
        args.report.write_text(json.dumps(report,indent=2)+'\n',encoding='utf-8')
        print('Report:',args.report,flush=True)
        print('Local data directory (server stopped):',lab,flush=True)


if __name__ == '__main__':
    main()
