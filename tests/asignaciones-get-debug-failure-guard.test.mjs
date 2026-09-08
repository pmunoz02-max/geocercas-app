import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

function makeRes() {
  return {
    statusCode: 200,
    headers: {},
    setHeader(name, value) {
      this.headers[name] = String(value);
    },
    end(payload) {
      this.body = typeof payload === 'string' ? JSON.parse(payload) : payload;
      return this;
    },
  };
}

function makeReq() {
  return {
    method: 'GET',
    query: { org_id: 'org-1' },
    headers: {
      cookie: 'tg_at=test-token',
      authorization: '',
    },
    body: undefined,
  };
}

async function loadHandlerWithScenario(scenario) {
  const source = fs.readFileSync(new URL('../api/asignaciones.js', import.meta.url), 'utf8');
  const stubbedSource = source.replace(
    'import { createClient } from "@supabase/supabase-js";',
    `
      const makeQueryForScenario = (tableName, scenario) => {
        const config = scenario[tableName] || { data: [], error: null };
        const query = {
          select() { return query; },
          eq() { return query; },
          or() { return query; },
          order() { return query; },
          maybeSingle() {
            return Promise.resolve({
              data: Array.isArray(config.data) ? (config.data[0] ?? null) : (config.data ?? null),
              error: config.error ?? null,
            });
          },
          then(resolve, reject) {
            return Promise.resolve({
              data: config.data ?? [],
              error: config.error ?? null,
            }).then(resolve, reject);
          },
        };
        return query;
      };
      globalThis.__ASIGNACIONES_SCENARIO__ = ${JSON.stringify(scenario)};
      const createClient = () => ({
        from: (tableName) => makeQueryForScenario(tableName, globalThis.__ASIGNACIONES_SCENARIO__),
        restUrl: 'https://example.supabase.co/rest/v1',
      });
    `
  );

  const modUrl = `data:text/javascript;base64,${Buffer.from(stubbedSource).toString('base64')}`;
  const mod = await import(modUrl);
  return mod.default;
}

test.beforeEach(() => {
  process.env.SUPABASE_URL = 'https://example.supabase.co';
  process.env.SUPABASE_ANON_KEY = 'anon-key';
  process.env.SUPABASE_SERVICE_KEY = 'service-key';
});

test('GET con consultas correctas devuelve 200', async () => {
  const scenario = {
    personal: { data: [{ id: 'p1', nombre: 'Ana', apellido: 'García' }], error: null },
    geofences: { data: [{ id: 'g1', name: 'Zona Norte' }], error: null },
    activities: { data: [{ id: 'a1', name: 'Trabajo' }], error: null },
    asignaciones: { data: [{ id: 'as1', org_id: 'org-1', is_deleted: null }], error: null },
  };

  const handler = await loadHandlerWithScenario(scenario);
  const req = makeReq();
  const res = makeRes();

  await handler(req, res);

  assert.equal(res.statusCode, 200);
  assert.equal(res.body.ok, true);
  assert.equal(res.body.data.catalogs.personal.length, 1);
  assert.equal(res.body.data.catalogs.geofences.length, 1);
  assert.equal(res.body.data.catalogs.activities.length, 1);
  assert.equal(res.body.data.asignaciones.length, 1);
});

test('GET con arrays vacíos sin error devuelve 200', async () => {
  const scenario = {
    personal: { data: [], error: null },
    geofences: { data: [], error: null },
    activities: { data: [], error: null },
    asignaciones: { data: [], error: null },
  };

  const handler = await loadHandlerWithScenario(scenario);
  const req = makeReq();
  const res = makeRes();

  await handler(req, res);

  assert.equal(res.statusCode, 200);
  assert.equal(res.body.ok, true);
  assert.deepEqual(res.body.data.catalogs.personal, []);
  assert.deepEqual(res.body.data.catalogs.geofences, []);
  assert.deepEqual(res.body.data.catalogs.activities, []);
  assert.deepEqual(res.body.data.asignaciones, []);
});

test('GET con una consulta con error devuelve 500 y payload genérico', async () => {
  const scenario = {
    personal: { data: [], error: { message: 'boom' } },
    geofences: { data: [], error: null },
    activities: { data: [], error: null },
    asignaciones: { data: [], error: null },
  };

  const handler = await loadHandlerWithScenario(scenario);
  const req = makeReq();
  const res = makeRes();

  await handler(req, res);

  assert.equal(res.statusCode, 500);
  assert.deepEqual(res.body, { ok: false, error: 'internal_server_error' });
});
