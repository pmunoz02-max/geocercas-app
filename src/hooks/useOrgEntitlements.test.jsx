import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { mockUseAuth } = vi.hoisted(() => ({
  mockUseAuth: vi.fn(),
}));

const supabaseMock = {
  from: vi.fn(),
};

vi.mock('@/lib/supabaseClient.js', () => ({
  supabase: supabaseMock,
}));

vi.mock('@/context/auth.js', () => ({
  useAuth: mockUseAuth,
}));

const useOrgEntitlements = (await import('./useOrgEntitlements.js')).default;

function mockEntitlementsResponse({ entitlementRow = null, billingRow = null }) {
  supabaseMock.from.mockImplementation((table) => ({
    select: () => ({
      eq: () => ({
        maybeSingle: async () => {
          if (table === 'org_entitlements') {
            return { data: entitlementRow, error: null };
          }
          if (table === 'org_billing') {
            return { data: billingRow, error: null };
          }
          return { data: null, error: null };
        },
      }),
    }),
  }));
}

describe('useOrgEntitlements permission gate', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUseAuth.mockReturnValue({
      ready: true,
      authenticated: true,
      currentOrgId: 'org-123',
      currentRole: 'owner',
    });
  });

  it('FREE allows 0 and 1 tracker and blocks 2', async () => {
    const cases = [
      { maxTrackers: 0, expected: false },
      { maxTrackers: 1, expected: true },
      { maxTrackers: 2, expected: true },
    ];

    for (const testCase of cases) {
      mockEntitlementsResponse({
        entitlementRow: { org_id: 'org-123', plan_code: 'free', max_trackers: testCase.maxTrackers, plan_status: 'free' },
        billingRow: { org_id: 'org-123', plan_code: 'free', plan_status: 'free', tracker_limit_override: null },
      });

      const { result, unmount } = renderHook(() => useOrgEntitlements());
      await waitFor(() => expect(result.current.loading).toBe(false));

      expect(result.current.planCode).toBe('free');
      expect(result.current.maxTrackers).toBe(testCase.maxTrackers);
      expect(result.current.canInviteTrackers).toBe(testCase.expected);
      unmount();
    }
  });

  it('PRO 9/10 and Enterprise 49/50 keep the expected gate', async () => {
    const cases = [
      { planCode: 'pro', planStatus: 'active', maxTrackers: 9, expected: true },
      { planCode: 'pro', planStatus: 'active', maxTrackers: 10, expected: true },
      { planCode: 'enterprise', planStatus: 'active', maxTrackers: 49, expected: true },
      { planCode: 'enterprise', planStatus: 'active', maxTrackers: 50, expected: true },
    ];

    for (const testCase of cases) {
      mockEntitlementsResponse({
        entitlementRow: { org_id: 'org-123', plan_code: testCase.planCode, max_trackers: testCase.maxTrackers, plan_status: testCase.planStatus },
        billingRow: { org_id: 'org-123', plan_code: testCase.planCode, plan_status: testCase.planStatus, tracker_limit_override: null },
      });

      const { result, unmount } = renderHook(() => useOrgEntitlements());
      await waitFor(() => expect(result.current.loading).toBe(false));
      expect(result.current.canInviteTrackers).toBe(testCase.expected);
      expect(result.current.maxTrackers).toBe(testCase.maxTrackers);
      unmount();
    }
  });

  it('applies overrides 0 and 1 and rejects inactive plan and synthetic fallbacks', async () => {
    const overrideCases = [
      { override: 0, expected: false },
      { override: 1, expected: true },
    ];

    for (const testCase of overrideCases) {
      mockEntitlementsResponse({
        entitlementRow: { org_id: 'org-123', plan_code: 'pro', max_trackers: 1, plan_status: 'active' },
        billingRow: { org_id: 'org-123', plan_code: 'pro', plan_status: 'active', tracker_limit_override: testCase.override },
      });

      const { result, unmount } = renderHook(() => useOrgEntitlements());
      await waitFor(() => expect(result.current.loading).toBe(false));
      expect(result.current.maxTrackers).toBe(testCase.override === 0 ? 0 : 1);
      expect(result.current.canInviteTrackers).toBe(testCase.expected);
      unmount();
    }

    mockEntitlementsResponse({
      entitlementRow: { org_id: 'org-123', plan_code: 'pro', max_trackers: 10, plan_status: 'inactive' },
      billingRow: { org_id: 'org-123', plan_code: 'pro', plan_status: 'inactive', tracker_limit_override: null },
    });

    const inactive = renderHook(() => useOrgEntitlements());
    await waitFor(() => expect(inactive.result.current.loading).toBe(false));
    expect(inactive.result.current.canInviteTrackers).toBe(false);

    mockEntitlementsResponse({ entitlementRow: null, billingRow: null });
    const fallback = renderHook(() => useOrgEntitlements());
    await waitFor(() => expect(fallback.result.current.loading).toBe(false));
    expect(fallback.result.current.source).toBe('default_free_fallback');
    expect(fallback.result.current.canInviteTrackers).toBe(false);
  });

  it('keeps the latest org response when auth changes across orgs', async () => {
    const orgAEntitlement = { promise: null, resolve: null };
    const orgABilling = { promise: null, resolve: null };
    const orgBEntitlement = { promise: null, resolve: null };
    const orgBBilling = { promise: null, resolve: null };

    for (const deferred of [orgAEntitlement, orgABilling, orgBEntitlement, orgBBilling]) {
      deferred.promise = new Promise((resolve) => {
        deferred.resolve = resolve;
      });
    }

    supabaseMock.from.mockImplementation((table) => ({
      select: () => ({
        eq: (_field, orgId) => ({
          maybeSingle: async () => {
            if (table === 'org_entitlements' && String(orgId) === 'org-123') return orgAEntitlement.promise;
            if (table === 'org_billing' && String(orgId) === 'org-123') return orgABilling.promise;
            if (table === 'org_entitlements' && String(orgId) === 'org-456') return orgBEntitlement.promise;
            if (table === 'org_billing' && String(orgId) === 'org-456') return orgBBilling.promise;
            return { data: null, error: null };
          },
        }),
      }),
    }));

    mockUseAuth.mockReturnValue({
      ready: true,
      authenticated: true,
      currentOrgId: 'org-123',
      currentRole: 'owner',
    });

    const { result, rerender, unmount } = renderHook(() => useOrgEntitlements());

    mockUseAuth.mockReturnValue({
      ready: true,
      authenticated: true,
      currentOrgId: 'org-456',
      currentRole: 'owner',
    });
    rerender();

    orgBBilling.resolve({ data: { org_id: 'org-456', plan_code: 'pro', plan_status: 'active', tracker_limit_override: 0 }, error: null });
    orgBEntitlement.resolve({ data: { org_id: 'org-456', plan_code: 'pro', max_trackers: 10, plan_status: 'active' }, error: null });

    await waitFor(() => {
      expect(result.current.orgId).toBe('org-456');
      expect(result.current.maxTrackers).toBe(0);
      expect(result.current.canInviteTrackers).toBe(false);
    });

    await act(async () => {
      orgABilling.resolve({ data: { org_id: 'org-123', plan_code: 'pro', plan_status: 'active', tracker_limit_override: null }, error: null });
      orgAEntitlement.resolve({ data: { org_id: 'org-123', plan_code: 'pro', max_trackers: 10, plan_status: 'active' }, error: null });
      await Promise.all([orgABilling.promise, orgAEntitlement.promise]);
    });

    expect(result.current.entitlements.org_id).toBe('org-456');
    expect(result.current.maxTrackers).toBe(0);
    expect(result.current.canInviteTrackers).toBe(false);

    unmount();
  });
});
