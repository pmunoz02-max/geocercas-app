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

const handler = (await import('../../api/invite-tracker.js')).default;

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

function buildActiveOrgBilling(orgId) {
  return {
    data: { org_id: orgId, plan_status: 'active', plan_code: 'pro' },
    error: null,
  };
}

function buildInviteMocks({
  orgId,
  entitlement = { org_id: orgId, max_trackers: 2 },
  trackerCount = 0,
  trackerCountError = null,
  personalUserId = 'tracker-user-123',
}) {
  mockSupabase.from.mockImplementation((table) => {
    if (table === 'org_billing') {
      return {
        select: () => ({
          eq: () => ({
            maybeSingle: async () => buildActiveOrgBilling(orgId),
          }),
        }),
      };
    }

    if (table === 'org_entitlements') {
      return {
        select: () => ({
          eq: () => ({
            maybeSingle: async () => ({ data: entitlement, error: null }),
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
                data: { id: 'personal-1', user_id: personalUserId },
                error: null,
              }),
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
              is: () => Promise.resolve({ count: trackerCount, error: trackerCountError }),
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

  it.each([
    { label: 'FREE 2 allows under limit', maxTrackers: 2, trackerCount: 1, expectedStatus: 200 },
    { label: 'FREE 2 blocks at limit', maxTrackers: 2, trackerCount: 2, expectedStatus: 403, expectedError: 'tracker_limit_reached' },
    { label: 'PRO 10 allows under limit', maxTrackers: 10, trackerCount: 9, expectedStatus: 200 },
    { label: 'PRO 10 blocks at limit', maxTrackers: 10, trackerCount: 10, expectedStatus: 403, expectedError: 'tracker_limit_reached' },
    { label: 'Enterprise 50 allows under limit', maxTrackers: 50, trackerCount: 49, expectedStatus: 200 },
    { label: 'Enterprise 50 blocks at limit', maxTrackers: 50, trackerCount: 50, expectedStatus: 403, expectedError: 'tracker_limit_reached' },
    { label: 'Override 0 blocks immediately', maxTrackers: 0, trackerCount: 0, expectedStatus: 403, expectedError: 'tracker_limit_reached' },
  ])('$label', async ({ maxTrackers, trackerCount, expectedStatus, expectedError }) => {
    buildInviteMocks({ orgId: baseReq.body.org_id, entitlement: { org_id: baseReq.body.org_id, max_trackers: maxTrackers }, trackerCount });

    const res = makeResponse();
    await handler(baseReq, res);

    expect(res.statusCode).toBe(expectedStatus);
    if (expectedError) {
      expect(res.body.error).toBe(expectedError);
      expect(mockFetch).not.toHaveBeenCalled();
    } else {
      expect(res.body.ok).toBe(true);
      expect(mockFetch).toHaveBeenCalledTimes(1);
    }
  });

  it('rejects missing or invalid entitlement data without sending the invite', async () => {
    buildInviteMocks({
      orgId: baseReq.body.org_id,
      entitlement: null,
      trackerCount: 0,
    });

    const missingRes = makeResponse();
    await handler(baseReq, missingRes);
    expect(missingRes.statusCode).toBe(403);
    expect(missingRes.body.error).toBe('plan_unavailable');
    expect(mockFetch).not.toHaveBeenCalled();

    buildInviteMocks({
      orgId: baseReq.body.org_id,
      entitlement: { org_id: 'different-org', max_trackers: 2 },
      trackerCount: 0,
    });

    const mismatchedRes = makeResponse();
    await handler(baseReq, mismatchedRes);
    expect(mismatchedRes.statusCode).toBe(403);
    expect(mismatchedRes.body.error).toBe('plan_unavailable');
    expect(mockFetch).not.toHaveBeenCalled();

    for (const invalidValue of [null, 2.5, '2abc', -1]) {
      buildInviteMocks({
        orgId: baseReq.body.org_id,
        entitlement: { org_id: baseReq.body.org_id, max_trackers: invalidValue },
        trackerCount: 0,
      });

      const invalidRes = makeResponse();
      await handler(baseReq, invalidRes);
      expect(invalidRes.statusCode).toBe(403);
      expect(invalidRes.body.error).toBe('plan_unavailable');
      expect(mockFetch).not.toHaveBeenCalled();
    }
  });

  it('does not flatten tracker count errors into zero and does not send the invite', async () => {
    buildInviteMocks({
      orgId: baseReq.body.org_id,
      entitlement: { org_id: baseReq.body.org_id, max_trackers: 2 },
      trackerCount: null,
      trackerCountError: new Error('count failed'),
    });

    const res = makeResponse();
    await handler(baseReq, res);

    expect(res.statusCode).toBe(500);
    expect(res.body.error).toBe('invite_internal_error');
    expect(mockFetch).not.toHaveBeenCalled();
  });
});
