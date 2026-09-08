import test from "node:test";
import assert from "node:assert/strict";
import { mock } from "node:test";

const originalEnv = { ...process.env };
process.env.SUPABASE_URL = "https://example.supabase.co";
process.env.SUPABASE_ANON_KEY = "anon-key";
process.env.SUPABASE_SERVICE_KEY = "service-key";

const fixtureState = {
  currentAssignment: {
    id: "asign-1",
    org_id: "org-1",
    tenant_id: "org-1",
    personal_id: "person-1",
    user_id: "user-1",
    geofence_id: "old-geofence",
    geocerca_id: "old-geocerca",
    activity_id: "activity-1",
    start_time: "2024-02-01T08:00:00.000Z",
    end_time: "2024-02-01T10:00:00.000Z",
    status: "active",
    estado: "active",
    frequency_minutes: 30,
    frecuencia_envio_sec: 1800,
    is_deleted: false,
  },
  lastAssignmentUpdate: null,
  writeLog: {
    asignaciones: [],
    geofences: [],
    geocercas: [],
    tracker_assignments: [],
  },
};

function resetFixtures() {
  fixtureState.currentAssignment = {
    id: "asign-1",
    org_id: "org-1",
    tenant_id: "org-1",
    personal_id: "person-1",
    user_id: "user-1",
    geofence_id: "old-geofence",
    geocerca_id: "old-geocerca",
    activity_id: "activity-1",
    start_time: "2024-02-01T08:00:00.000Z",
    end_time: "2024-02-01T10:00:00.000Z",
    status: "active",
    estado: "active",
    frequency_minutes: 30,
    frecuencia_envio_sec: 1800,
    is_deleted: false,
  };
  fixtureState.lastAssignmentUpdate = null;
  fixtureState.writeLog = {
    asignaciones: [],
    geofences: [],
    geocercas: [],
    tracker_assignments: [],
  };
}

function makeQuery(table) {
  return {
    _table: table,
    _filters: {},
    _updatePayload: null,
    _insertPayload: null,
    select() {
      return this;
    },
    eq(key, value) {
      this._filters[key] = value;
      return this;
    },
    order() {
      return this;
    },
    or() {
      return this;
    },
    is() {
      return Promise.resolve({ error: null });
    },
    update(payload) {
      this._updatePayload = payload;
      if (this._table === "asignaciones") {
        fixtureState.lastAssignmentUpdate = payload;
      }
      return this;
    },
    insert(payload) {
      this._insertPayload = payload;
      if (this._table === "asignaciones") {
        fixtureState.writeLog.asignaciones.push(payload);
      }
      if (this._table === "tracker_assignments") {
        fixtureState.writeLog.tracker_assignments.push(payload);
      }
      return this;
    },
    maybeSingle() {
      return Promise.resolve(this._resolveQuery());
    },
    single() {
      return Promise.resolve(this._resolveQuery());
    },
    delete() {
      return this;
    },
    _resolveQuery() {
      if (this._table === "asignaciones") {
        if (this._insertPayload) {
          const inserted = {
            ...fixtureState.currentAssignment,
            ...this._insertPayload[0],
            id: this._insertPayload[0].id || fixtureState.currentAssignment.id,
          };
          return { data: inserted, error: null };
        }

        if (this._updatePayload) {
          const updated = {
            ...fixtureState.currentAssignment,
            ...this._updatePayload,
            id: fixtureState.currentAssignment.id,
            org_id: fixtureState.currentAssignment.org_id,
          };
          return { data: updated, error: null };
        }

        if (this._filters.id === fixtureState.currentAssignment.id) {
          return { data: fixtureState.currentAssignment, error: null };
        }

        if (this._filters.org_id === "org-1" && this._filters.personal_id === "person-1") {
          return { data: [], error: null };
        }

        return { data: [], error: null };
      }

      if (this._table === "geofences") {
        if (this._filters.id === "null-linked-geofence" && this._filters.org_id === "org-1") {
          return {
            data: {
              id: "null-linked-geofence",
              org_id: "org-1",
              source_geocerca_id: null,
            },
            error: null,
          };
        }

        if (this._filters.id === "new-geofence" && this._filters.org_id === "org-1") {
          return {
            data: {
              id: "new-geofence",
              org_id: "org-1",
              source_geocerca_id: "new-geocerca",
            },
            error: null,
          };
        }

        if (this._filters.id === "other-org-geofence" && this._filters.org_id === "org-1") {
          return {
            data: {
              id: "other-org-geofence",
              org_id: "org-1",
              source_geocerca_id: "other-org-geocerca",
            },
            error: null,
          };
        }

        if (this._filters.id === "another-org-geofence" && this._filters.org_id === "org-2") {
          return {
            data: {
              id: "another-org-geofence",
              org_id: "org-2",
              source_geocerca_id: "org-2-geocerca",
            },
            error: null,
          };
        }

        return { data: null, error: null };
      }

      if (this._table === "geocercas") {
        if (this._filters.id === "new-geocerca" && this._filters.org_id === "org-1") {
          return { data: { id: "new-geocerca", org_id: "org-1" }, error: null };
        }

        if (this._filters.id === "another-org-geocerca" && this._filters.org_id === "org-2") {
          return { data: { id: "another-org-geocerca", org_id: "org-2" }, error: null };
        }

        return { data: null, error: null };
      }

      if (this._table === "personal") {
        if (this._filters.id === "person-1" && this._filters.org_id === "org-1") {
          return {
            data: {
              id: "person-1",
              org_id: "org-1",
              user_id: "user-1",
              email: "person@example.com",
              is_deleted: false,
            },
            error: null,
          };
        }
        return { data: null, error: null };
      }

      if (this._table === "tracker_assignments") {
        if (this._insertPayload) {
          return { data: { id: "tracker-assignment-1" }, error: null };
        }
        return { data: null, error: null };
      }

      return { data: null, error: null };
    },
    then(resolve, reject) {
      return Promise.resolve(this._resolveQuery()).then(resolve, reject);
    },
  };
}

const fakeSupabase = {
  from(table) {
    return makeQuery(table);
  },
};

const fakeAdminSupabase = {
  from(table) {
    return makeQuery(table);
  },
};

mock.module("@supabase/supabase-js", {
  namedExports: {
    createClient: (url, key) => {
      if (key === process.env.SUPABASE_SERVICE_KEY) {
        return fakeAdminSupabase;
      }
      return fakeSupabase;
    },
  },
});

const { default: handler } = await import("../api/asignaciones.js");

test("POST handler stores geofence_id and null geocerca_id when geofence has no linked geocerca in same org", async () => {
  resetFixtures();

  const req = {
    method: "POST",
    headers: { authorization: "Bearer token" },
    body: {
      org_id: "org-1",
      personal_id: "person-1",
      geofence_id: "null-linked-geofence",
      start_time: "2024-02-01T08:00:00.000Z",
      end_time: "2024-02-01T10:00:00.000Z",
      status: "active",
    },
  };

  const res = {
    headers: {},
    setHeader(name, value) {
      this.headers[name] = value;
    },
    end(payload) {
      this.body = payload;
    },
    statusCode: 200,
  };

  await handler(req, res);

  const result = JSON.parse(res.body);

  assert.equal(res.statusCode, 201, `POST same-org geofence without link should succeed; response=${JSON.stringify(result)} writes=${JSON.stringify(fixtureState.writeLog)}`);
  assert.equal(result.asignacion.geofence_id, "null-linked-geofence");
  assert.equal(result.asignacion.geocerca_id, null);
  assert.equal(fixtureState.writeLog.asignaciones.length, 1, "POST should insert exactly one asignacion row");
  assert.equal(fixtureState.writeLog.asignaciones[0][0].geofence_id, "null-linked-geofence");
  assert.equal(fixtureState.writeLog.asignaciones[0][0].geocerca_id, null);
});

test("POST handler stores the linked geocerca_id when geofence resolves to a valid same-org geocerca", async () => {
  resetFixtures();

  const req = {
    method: "POST",
    headers: { authorization: "Bearer token" },
    body: {
      org_id: "org-1",
      personal_id: "person-1",
      geofence_id: "new-geofence",
      start_time: "2024-02-01T08:00:00.000Z",
      end_time: "2024-02-01T10:00:00.000Z",
      status: "active",
    },
  };

  const res = {
    headers: {},
    setHeader(name, value) {
      this.headers[name] = value;
    },
    end(payload) {
      this.body = payload;
    },
    statusCode: 200,
  };

  await handler(req, res);

  const result = JSON.parse(res.body);

  assert.equal(res.statusCode, 201, `POST valid same-org geofence should succeed; response=${JSON.stringify(result)} writes=${JSON.stringify(fixtureState.writeLog)}`);
  assert.equal(result.asignacion.geofence_id, "new-geofence");
  assert.equal(result.asignacion.geocerca_id, "new-geocerca");
  assert.equal(fixtureState.writeLog.asignaciones.length, 1, "POST should insert assignment when valid geocerca link is resolved");
  assert.equal(fixtureState.writeLog.asignaciones[0][0].geocerca_id, "new-geocerca");
  assert.equal(fixtureState.writeLog.tracker_assignments.length, 1, "POST should sync tracker when valid assignment is inserted");
});

test("POST handler rejects mismatched geocerca_id and geofence from another org without insert or tracker sync", async () => {
  resetFixtures();

  const req = {
    method: "POST",
    headers: { authorization: "Bearer token" },
    body: {
      org_id: "org-1",
      personal_id: "person-1",
      geofence_id: "new-geofence",
      geocerca_id: "other-org-geocerca",
      start_time: "2024-02-01T08:00:00.000Z",
      end_time: "2024-02-01T10:00:00.000Z",
      status: "active",
    },
  };

  const res = {
    headers: {},
    setHeader(name, value) {
      this.headers[name] = value;
    },
    end(payload) {
      this.body = payload;
    },
    statusCode: 200,
  };

  await handler(req, res);

  const result = JSON.parse(res.body);

  assert.equal(res.statusCode, 400, `Mismatched geocerca_id should be rejected; response=${JSON.stringify(result)} writes=${JSON.stringify(fixtureState.writeLog)}`);
  assert.equal(result.error, "invalid_geofence_geocerca_link");
  assert.equal(fixtureState.writeLog.asignaciones.length, 0, "No assignment insert should happen on invalid geocerca linkage");
  assert.equal(fixtureState.writeLog.tracker_assignments.length, 0, "No tracker sync should happen on invalid geocerca linkage");
});

test("POST handler rejects geofence from another org without insert or tracker sync", async () => {
  resetFixtures();

  const req = {
    method: "POST",
    headers: { authorization: "Bearer token" },
    body: {
      org_id: "org-1",
      personal_id: "person-1",
      geofence_id: "another-org-geofence",
      start_time: "2024-02-01T08:00:00.000Z",
      end_time: "2024-02-01T10:00:00.000Z",
      status: "active",
    },
  };

  const res = {
    headers: {},
    setHeader(name, value) {
      this.headers[name] = value;
    },
    end(payload) {
      this.body = payload;
    },
    statusCode: 200,
  };

  await handler(req, res);

  const result = JSON.parse(res.body);

  assert.equal(res.statusCode, 400, `Geofence from another org should be rejected; response=${JSON.stringify(result)} writes=${JSON.stringify(fixtureState.writeLog)}`);
  assert.equal(result.error, "geofence_not_found");
  assert.equal(fixtureState.writeLog.asignaciones.length, 0, "No assignment insert should happen for other-org geofence");
  assert.equal(fixtureState.writeLog.tracker_assignments.length, 0, "No tracker sync should happen for other-org geofence");
});

test("PATCH handler re-validates geofence link and stores both new IDs when geocerca_id is omitted", async () => {
  resetFixtures();

  const req = {
    method: "PATCH",
    headers: { authorization: "Bearer token" },
    body: {
      id: "asign-1",
      org_id: "org-1",
      personal_id: "person-1",
      geofence_id: "new-geofence",
      start_time: "2024-02-01T08:00:00.000Z",
      end_time: "2024-02-01T10:00:00.000Z",
      status: "active",
    },
  };

  const res = {
    headers: {},
    setHeader(name, value) {
      this.headers[name] = value;
    },
    end(payload) {
      this.body = payload;
    },
    statusCode: 200,
  };

  await handler(req, res);

  const result = JSON.parse(res.body);

  assert.equal(res.statusCode, 200, `PATCH should succeed with a valid new geofence link; response=${JSON.stringify(result)} writes=${JSON.stringify(fixtureState.writeLog)}`);
  assert.equal(result.ok, true, "API should report success");
  assert.equal(result.asignacion.geofence_id, "new-geofence", "should persist the new geofence");
  assert.equal(result.asignacion.geocerca_id, "new-geocerca", "should persist the new geocerca derived from the new geofence");
  assert.equal(fixtureState.lastAssignmentUpdate.geofence_id, "new-geofence", "update payload should include the new geofence id");
  assert.equal(fixtureState.lastAssignmentUpdate.geocerca_id, "new-geocerca", "update payload should include the new geocerca id derived from the new geofence");
});

test.after(() => {
  process.env = { ...originalEnv };
});
