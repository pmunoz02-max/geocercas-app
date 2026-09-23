import { afterEach, beforeEach, expect, it, vi } from "vitest";
vi.mock("@supabase/supabase-js", () => ({ createClient: vi.fn(() => ({})) }));
import handler from "../../api/asignaciones.js";

beforeEach(() => {
  vi.stubEnv("SUPABASE_URL", "https://example.supabase.co");
  vi.stubEnv("SUPABASE_ANON_KEY", "test-key");
});
afterEach(() => vi.unstubAllEnvs());
async function request(method, body) {
  const res = { setHeader: vi.fn(), end: vi.fn() };
  await handler({ method, body, headers: { authorization: "Bearer test-token" } }, res);
  return { status: res.statusCode, body: JSON.parse(res.end.mock.calls[0][0]) };
}
for (const method of ["POST", "PATCH"]) {
  for (const [field, values] of [
    ["frequency_minutes", [0, 1, 4.99, -5, null, "", "bad", false]],
    ["frecuencia_envio_sec", [0, 60, 299, -1, null, "bad"]],
  ]) {
    it.each(values)(`${method} rejects ${field}=%s before accessing the database`, async value => {
      const result = await request(method, { [field]: value });
      expect(result).toEqual({ status: 400, body: { ok: false, error: "invalid_frequency", minimum_minutes: 5 } });
    });
  }
  it.each([{ frequency_minutes: 5 }, { frecuencia_envio_sec: 300 }, { frequency_minutes: 10, frecuencia_envio_sec: 600 }, {}])(
    `${method} accepts the minimum, higher values and omitted frequency`, async body => {
      const result = await request(method, body);
      expect(result.body.error).toBe(method === "POST" ? "missing_required_fields" : "missing_id");
    });
  it(`${method} rejects a conflicting seconds value`, async () => {
    expect((await request(method, { frequency_minutes: 5, frecuencia_envio_sec: 60 })).body.error).toBe("invalid_frequency");
  });
}
