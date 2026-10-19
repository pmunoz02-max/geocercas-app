import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockSupabase = {
  auth: { getUser: vi.fn() },
  from: vi.fn(),
  rpc: vi.fn(),
};

const mockFetch = vi.fn();

vi.mock('@supabase/supabase-js', () => ({
  createClient: vi.fn(() => mockSupabase),
}));

vi.stubGlobal('fetch', mockFetch);

const handler = (await import('./invite-tracker.js')).default;

function makeResponse() {
  return {
    statusCode: 200,
    body: null,
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(payload) {
      this.body = payload;
      return this;
    },
    setHeader() {},
  };
}

describe('api/invite-tracker normal invite guard', () => {
  const baseReq = {
    method: 'POST',
    body: {
      org_id: '11111111-1111-4111-8111-111111111111',
      email: 'tracker@example.com',
      personal_id: '22222222-2222-4222-8222-222222222222',
    },
    headers: {
      authorization: 'Bearer valid-token',
      'x-user-jwt': 'valid-token',
    },
  };

  beforeEach(() => {
    vi.clearAllMocks();
    process.env.SUPABASE_URL = 'https://example.supabase.co';
    process.env.SUPABASE_SERVICE_ROLE_KEY = 'service-role-key';
    process.env.VITE_SUPABASE_ANON_KEY = 'anon-key';
    process.env.VITE_ANDROID_PACKAGE_NAME = 'com.example.app';

    mockSupabase.auth.getUser.mockResolvedValue({ data: { user: { id: 'user-123' } }, error: null });
    mockSupabase.rpc.mockResolvedValue({ data: { ok: true }, error: null });
    mockFetch.mockResolvedValue({
      ok: true,
      status: 200,
      text: async () => JSON.stringify({
        inviteToken: 'invite-token',
        tracker_runtime_token: 'runtime-token',
        personal: { user_id: 'tracker-user-123' },
      }),
    });
  });

  it('allows FREE when billing row exists and status is free or active', async () => {
    mockSupabase.from.mockImplementation((table) => {
      if (table === 'org_billing') {
        return {
          select: () => ({
            eq: () => ({
              maybeSingle: async () => ({
                data: { org_id: baseReq.body.org_id, plan_status: 'free', plan_code: 'free' },
                error: null,
              }),
            }),
          }),
        };
      }

      if (table === 'personal') {
        return {
          select: () => ({
            eq: () => ({
              ilike: () => ({
                maybeSingle: async () => ({
                  data: { id: 'personal-1', user_id: 'tracker-user-123' },
                  error: null,
                }),
              }),
            }),
          }),
        };
      }

      if (table === 'org_entitlements') {
        return {
          select: () => ({
            eq: () => ({
              maybeSingle: async () => ({
                data: { org_id: baseReq.body.org_id, max_trackers: 1 },
                error: null,
              }),
            }),
          }),
        };
      }

      if (table === 'memberships') {
        return {
          select: () => ({
            eq: () => ({
              eq: () => ({
                is: async () => ({ count: 0, error: null }),
              }),
            }),
          }),
        };
      }

      return {
        select: () => ({
          eq: () => ({ maybeSingle: async () => ({ data: null, error: null }) }),
        }),
      };
    });

    const res = makeResponse();
    await handler(baseReq, res);

    expect(res.statusCode).toBe(200);
    expect(res.body.ok).toBe(true);
  });

  it('allows PRO and Enterprise only when status is active', async () => {
    for (const row of [
      { plan_code: 'pro', plan_status: 'active' },
      { plan_code: 'enterprise', plan_status: 'active' },
    ]) {
      mockSupabase.from.mockImplementation((table) => {
        if (table === 'org_billing') {
          return {
            select: () => ({
              eq: () => ({
                maybeSingle: async () => ({
                  data: { org_id: baseReq.body.org_id, plan_status: row.plan_status, plan_code: row.plan_code },
                  error: null,
                }),
              }),
            }),
          };
        }

        if (table === 'personal') {
          return {
            select: () => ({
              eq: () => ({
                ilike: () => ({
                  maybeSingle: async () => ({
                    data: { id: 'personal-1', user_id: 'tracker-user-123' },
                    error: null,
                  }),
                }),
              }),
            }),
          };
        }

        if (table === 'org_entitlements') {
          return {
            select: () => ({
              eq: () => ({
                maybeSingle: async () => ({
                  data: { org_id: baseReq.body.org_id, max_trackers: row.plan_code === 'pro' ? 10 : 9999 },
                  error: null,
                }),
              }),
            }),
          };
        }

        if (table === 'memberships') {
          return {
            select: () => ({
              eq: () => ({
                eq: () => ({
                  is: async () => ({ count: 0, error: null }),
                }),
              }),
            }),
          };
        }

        return {
          select: () => ({
            eq: () => ({ maybeSingle: async () => ({ data: null, error: null }) }),
          }),
        };
      });

      const res = makeResponse();
      await handler(baseReq, res);
      expect(res.statusCode).toBe(200);
      expect(res.body.ok).toBe(true);
    }
  });

  it('rejects inactive plan states and missing or errored billing rows', async () => {
    const inactiveCases = [
      { plan_status: 'inactive', plan_code: 'pro' },
      { plan_status: 'canceled', plan_code: 'enterprise' },
    ];

    for (const row of inactiveCases) {
      mockSupabase.from.mockImplementation((table) => {
        if (table === 'org_billing') {
          return {
            select: () => ({
              eq: () => ({
                maybeSingle: async () => ({ data: { org_id: baseReq.body.org_id, plan_status: row.plan_status, plan_code: row.plan_code }, error: null }),
              }),
            }),
          };
        }
        return {
          select: () => ({
            eq: () => ({ maybeSingle: async () => ({ data: null, error: null }) }),
          }),
        };
      });

      const res = makeResponse();
      await handler(baseReq, res);
      expect(res.statusCode).toBe(403);
      expect(res.body.error).toBe('plan_inactive');
      expect(res.body.message).toBe('El plan no está activo');
    }

    mockSupabase.from.mockImplementation((table) => {
      if (table === 'org_billing') {
        return {
          select: () => ({
            eq: () => ({
              maybeSingle: async () => ({ data: null, error: null }),
            }),
          }),
        };
      }
      return {
        select: () => ({
          eq: () => ({ maybeSingle: async () => ({ data: null, error: null }) }),
        }),
      };
    });

    const missingBilling = makeResponse();
    await handler(baseReq, missingBilling);
    expect(missingBilling.statusCode).toBe(403);
    expect(missingBilling.body.error).toBe('plan_unavailable');
    expect(missingBilling.body.message).toBe('No se pudo validar el plan de la organización.');

    mockSupabase.from.mockImplementation((table) => {
      if (table === 'org_billing') {
        return {
          select: () => ({
            eq: () => ({
              maybeSingle: async () => ({ data: null, error: new Error('billing query failed') }),
            }),
          }),
        };
      }
      return {
        select: () => ({
          eq: () => ({ maybeSingle: async () => ({ data: null, error: null }) }),
        }),
      };
    });

    const erroredBilling = makeResponse();
    await handler(baseReq, erroredBilling);
    expect(erroredBilling.statusCode).toBe(403);
    expect(erroredBilling.body.error).toBe('plan_unavailable');
    expect(erroredBilling.body.message).toBe('No se pudo validar el plan de la organización.');
  });
});
