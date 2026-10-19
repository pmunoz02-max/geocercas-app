import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockSupabase = {
  auth: { getUser: vi.fn() },
  from: vi.fn(),
};

vi.mock('@supabase/supabase-js', () => ({
  createClient: vi.fn(() => mockSupabase),
}));

process.env.SUPABASE_URL = 'https://example.supabase.co';
process.env.SUPABASE_SERVICE_ROLE_KEY = 'service-role-key';

const handler = (await import('./actividades.js')).default;

function makeRes() {
  return {
    statusCode: 200,
    body: null,
    setHeader() {},
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(payload) {
      this.body = payload;
      return this;
    },
  };
}

describe('api/actividades authorization', () => {
  beforeEach(() => {
    vi.clearAllMocks();

    process.env.SUPABASE_URL = 'https://example.supabase.co';
    process.env.SUPABASE_SERVICE_ROLE_KEY = 'service-role-key';

    mockSupabase.auth.getUser.mockResolvedValue({
      data: { user: { id: 'tracker-user-123' } },
      error: null,
    });
  });

  it('rejects GET when user has no org membership and does not query activities', async () => {
    mockSupabase.from.mockImplementation((table) => {
      if (table === 'org_members') {
        return {
          select: vi.fn(() => ({
            eq: vi.fn(() => ({
              eq: vi.fn(() => ({
                maybeSingle: vi.fn().mockResolvedValue({
                  data: null,
                  error: null,
                }),
              })),
            })),
          })),
        };
      }

      return {
        select: vi.fn(),
        insert: vi.fn(),
        update: vi.fn(),
        delete: vi.fn(),
      };
    });

    const req = {
      method: 'GET',
      url: '/api/actividades?org_id=11111111-1111-4111-8111-111111111111',
      query: { org_id: '11111111-1111-4111-8111-111111111111' },
      headers: {
        authorization: 'Bearer valid-token',
      },
    };

    const res = makeRes();

    await handler(req, res);

    expect(res.statusCode).toBe(403);
    expect(res.body.error).toBe('membership_not_found');
    expect(res.body.details).toBeNull();

    const activitiesCalls = mockSupabase.from.mock.calls.filter(([table]) => table === 'activities');
    expect(activitiesCalls).toHaveLength(0);
  });

  it('rejects GET when membership is inactive and does not query activities', async () => {
    mockSupabase.from.mockImplementation((table) => {
      if (table === 'org_members') {
        return {
          select: vi.fn(() => ({
            eq: vi.fn(() => ({
              eq: vi.fn(() => ({
                maybeSingle: vi.fn().mockResolvedValue({
                  data: { role: 'tracker', is_active: false },
                  error: null,
                }),
              })),
            })),
          })),
        };
      }

      return {
        select: vi.fn(),
        insert: vi.fn(),
        update: vi.fn(),
        delete: vi.fn(),
      };
    });

    const req = {
      method: 'GET',
      url: '/api/actividades?org_id=11111111-1111-4111-8111-111111111111',
      query: { org_id: '11111111-1111-4111-8111-111111111111' },
      headers: {
        authorization: 'Bearer valid-token',
      },
    };

    const res = makeRes();

    await handler(req, res);

    expect(res.statusCode).toBe(403);
    expect(res.body.error).toBe('membership_inactive');
    expect(res.body.details).toBeNull();

    const activitiesCalls = mockSupabase.from.mock.calls.filter(([table]) => table === 'activities');
    expect(activitiesCalls).toHaveLength(0);
  });

  it('rejects POST for an active tracker without owner/admin role and does not write', async () => {
    mockSupabase.from.mockImplementation((table) => {
      if (table === 'org_members') {
        return {
          select: vi.fn(() => ({
            eq: vi.fn(() => ({
              eq: vi.fn(() => ({
                maybeSingle: vi.fn().mockResolvedValue({
                  data: { role: 'tracker', is_active: true },
                  error: null,
                }),
              })),
            })),
          })),
        };
      }

      return {
        select: vi.fn(),
        insert: vi.fn(),
        update: vi.fn(),
        delete: vi.fn(),
      };
    });

    const req = {
      method: 'POST',
      url: '/api/actividades?org_id=11111111-1111-4111-8111-111111111111',
      query: { org_id: '11111111-1111-4111-8111-111111111111' },
      headers: {
        authorization: 'Bearer valid-token',
      },
      body: {
        name: '__tracker_forbidden_probe__',
        description: 'test only',
        hourly_cost: 1,
        currency: 'USD',
      },
    };

    const res = makeRes();

    await handler(req, res);

    expect(res.statusCode).toBe(403);
    expect(res.body).toEqual({ error: 'owner_or_admin_required' });

    const activitiesCalls = mockSupabase.from.mock.calls.filter(([table]) => table === 'activities');
    expect(activitiesCalls).toHaveLength(0);
  });
});
