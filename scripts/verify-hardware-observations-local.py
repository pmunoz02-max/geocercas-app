"""Observation integration extension for the disposable local PostgreSQL runner."""
import json
import time
import uuid
from datetime import datetime, timedelta, timezone
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path
import psycopg
from psycopg.types.json import Jsonb

ROOT = Path(__file__).resolve().parents[1]
MIGRATION = ROOT / 'supabase/migrations/20260928030944_hardware_observations_preview.sql'

def run(connect, admin, passed):
    with connect() as c:
        c.execute("SET LOCAL geofield.preview_project_ref='mujwsfhkocsuuahlrssn'")
        c.execute(MIGRATION.read_text(encoding='utf-8-sig'))
    passed('observations migration applied atomically locally')
    org, owner, tracker, device = [uuid.uuid4() for _ in range(4)]
    admin.execute('INSERT INTO public.organizations VALUES(%s,%s)',(org,owner))
    admin.execute("INSERT INTO public.memberships VALUES(%s,%s,'owner',NULL)",(org,owner))
    admin.execute('INSERT INTO public.org_hardware_entitlements(org_id,enabled,max_hardware_trackers) VALUES(%s,true,2)',(org,))
    admin.execute("INSERT INTO public.trackers(id,org_id,name,asset_kind,active) VALUES(%s,%s,'SIM ingest','equipment',true)",(tracker,org))
    admin.execute("INSERT INTO public.tracker_devices(id,org_id,manufacturer,model,protocol,identifier_kind,external_id) VALUES(%s,%s,'SIM','SIM','normalized-simulator-v1','simulator',%s)",(device,org,str(device)))
    binding=admin.execute('INSERT INTO public.tracker_device_bindings(org_id,tracker_id,device_id) VALUES(%s,%s,%s) RETURNING id',(org,tracker,device)).fetchone()[0]
    time.sleep(.02)
    base=datetime.now(timezone.utc)
    def packet(event, delta=0, **patch):
        value=dict(version=1,event_id=event,recorded_at=(base+timedelta(seconds=delta)).isoformat(timespec='milliseconds').replace('+00:00','Z'),fix_valid=True,latitude=0,longitude=0)
        value.update(patch)
        return value
    def ingest(value, did=device, role='service_role'):
        with connect() as c:
            c.execute('SET LOCAL ROLE '+role)
            return c.execute('SELECT public.ingest_hardware_observation_preview(%s,%s)',(did,Jsonb(value))).fetchone()[0]
    def rejects(value, message, did=device, role='service_role'):
        try: ingest(value,did,role)
        except psycopg.Error as e: assert message in e.diag.message_primary,(message,e.diag.message_primary)
        else: raise AssertionError('Unexpected acceptance: '+message)
    first=ingest(packet('first'))
    duplicate=ingest(packet('first'))
    assert first['status']=='stored' and duplicate['status']=='duplicate' and first['received_at']==duplicate['received_at']
    rejects(packet('first',latitude=1),'idempotency_conflict')
    ingest(packet('newer',1)); ingest(packet('late',.5)); ingest(packet('no-fix',2,fix_valid=False,latitude=None,longitude=None))
    def latest(c=admin): return c.execute('SELECT event_id FROM public.hardware_latest_preview(%s,%s)',(org,tracker)).fetchone()
    assert latest()[0]=='newer'
    passed('service role ingestion, duplicate receipt stable, conflict, late point and no-fix ordering')
    for patch, error in [({'latitude':91},'invalid_coordinates'),({'longitude':'0'},'invalid_coordinates'),({'org_id':str(uuid.uuid4())},'invalid_fields'),({'fix_valid':False},'coordinates_without_fix'),({'recorded_at':'2026-02-30T12:00:00.000Z'},'invalid_time'),({'event_id':'bad/event'},'invalid_event')]:
        rejects(packet('bad',**patch),'invalid_event' if 'event_id' in patch else error)
    rejects(packet('future',600),'future_time')
    rejects(packet('old',-31*86400),'expired_observation')
    rejects(packet('prebinding',-60),'hardware_binding_not_found')
    rejects(packet('unknown'),'hardware_device_not_authorized',uuid.uuid4())
    for role in ('anon','authenticated'): rejects(packet('denied'),'permission denied',role=role)
    with connect() as c:
        c.execute('SET LOCAL ROLE service_role')
        try: c.execute('DELETE FROM public.hardware_observations')
        except psycopg.errors.InsufficientPrivilege: c.rollback()
        else: raise AssertionError('Direct DML permitted')
    passed('invalid inputs, unbound device, expired/future data and restricted grants')
    with connect() as c:
        c.execute('SET LOCAL ROLE authenticated')
        c.execute("SELECT set_config('request.jwt.claim.sub',%s,true)",(str(owner),))
        assert latest(c)[0]=='newer'
        c.execute("SELECT set_config('request.jwt.claim.sub',%s,true)",(str(uuid.uuid4()),))
        assert latest(c) is None
        assert c.execute('SELECT count(*) FROM public.hardware_observations').fetchone()[0]==0
    admin.execute('UPDATE public.memberships SET revoked_at=clock_timestamp() WHERE org_id=%s',(org,))
    with connect() as c:
        c.execute('SET LOCAL ROLE authenticated')
        c.execute("SELECT set_config('request.jwt.claim.sub',%s,true)",(str(owner),))
        assert latest(c) is None
    admin.execute('UPDATE public.memberships SET revoked_at=NULL WHERE org_id=%s',(org,))
    passed('owner read, cross-organization isolation and revoked membership')
    admin.execute("UPDATE public.trackers SET retention_mode='inside_only' WHERE id=%s",(tracker,))
    rejects(packet('inside'),'hardware_retention_mode_not_supported')
    admin.execute("UPDATE public.trackers SET retention_mode='full_route' WHERE id=%s",(tracker,))
    admin.execute('UPDATE public.tracker_devices SET active=false WHERE id=%s',(device,))
    rejects(packet('disabled'),'hardware_device_not_authorized')
    # Closed historical binding remains attributable after reactivating same device.
    admin.execute('UPDATE public.tracker_devices SET active=true WHERE id=%s',(device,))
    ingest(packet('historical',.001))
    rejects(packet('after-close',30),'hardware_binding_not_found')
    passed('unsupported retention mode, device revocation and closed historical binding')
    # Two real connections: B must visibly wait on organization lock held by A.
    for commit in (True,False):
        value=packet('race-commit' if commit else 'race-rollback',.002)
        with connect() as a, connect() as b:
            for c in (a,b):
                c.execute("SET LOCAL statement_timeout='15s'")
                c.execute('SET LOCAL ROLE service_role')
            a.execute('SELECT public.ingest_hardware_observation_preview(%s,%s)',(device,Jsonb(value)))
            def worker():
                result=b.execute('SELECT public.ingest_hardware_observation_preview(%s,%s)',(device,Jsonb(value))).fetchone()[0]
                b.commit()
                return result
            with ThreadPoolExecutor(max_workers=1) as pool:
                future=pool.submit(worker)
                deadline=time.monotonic()+8; locked=False
                while time.monotonic()<deadline and not future.done():
                    row=admin.execute('SELECT wait_event_type FROM pg_stat_activity WHERE pid=%s',(b.info.backend_pid,)).fetchone()
                    if row and row[0]=='Lock': locked=True; break
                    time.sleep(.02)
                assert locked,'No real lock observed'
                a.commit() if commit else a.rollback()
                assert future.result(timeout=20)['status']==('duplicate' if commit else 'stored')
        assert admin.execute('SELECT count(*) FROM public.hardware_observations WHERE device_id=%s AND event_id=%s',(device,value['event_id'])).fetchone()[0]==1
    passed('same-packet concurrency: A commit and A rollback, B lock observed, one row')
    # Seed ancient rows as test administrator only, to exercise retention without waiting days.
    old=base-timedelta(days=2)
    for i in range(3):
        admin.execute('INSERT INTO public.hardware_observations(device_id,event_id,org_id,tracker_id,binding_id,recorded_at,fix_valid,latitude,longitude) VALUES(%s,%s,%s,%s,%s,%s,true,0,0)',(device,'purge-'+str(i),org,tracker,binding,old))
    admin.execute('UPDATE public.org_hardware_entitlements SET retention_days=1 WHERE org_id=%s',(org,))
    with connect() as c:
        c.execute('SET LOCAL ROLE authenticated')
        c.execute("SELECT set_config('request.jwt.claim.sub',%s,true)",(str(owner),))
        assert c.execute("SELECT count(*) FROM public.hardware_observations WHERE event_id LIKE 'purge-%%'").fetchone()[0]==0
    def purge():
        with connect() as c:
            c.execute('SET LOCAL ROLE service_role')
            return c.execute('SELECT public.purge_hardware_observations_preview(%s,2)',(org,)).fetchone()[0]
    result=purge(); assert result['deleted']==2 and result['has_more']
    result=purge(); assert result['deleted']==1 and not result['has_more']
    admin.execute('UPDATE public.org_hardware_entitlements SET retention_days=30 WHERE org_id=%s',(org,))
    rejects(packet('purge-0',-2*86400),'expired_observation')
    assert latest()[0]=='newer'
    passed('retention hidden before purge, bounded deletion, monotonic replay floor and latest preserved')
