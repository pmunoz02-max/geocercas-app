import React from 'react';
import { render, screen, fireEvent, cleanup, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { MemoryRouter } from 'react-router-dom';

const mockNavigate = vi.fn();
const mockUseOrgEntitlements = vi.fn();
const mockUseAuthSafe = vi.fn();
const mockT = vi.fn((key, opts) => (typeof opts?.defaultValue === 'string' ? opts.defaultValue : key));
const mockSupabase = { from: vi.fn() };
let activeOrgId = 'org-123';

function createDeferred() {
  let resolve;
  const promise = new Promise((res) => {
    resolve = res;
  });
  return { promise, resolve };
}

function makeTableQuery({ rows = [], count = 0, error = null, deferred } = {}) {
  const chain = {
    select: vi.fn(() => chain),
    eq: vi.fn(() => chain),
    or: vi.fn(() => chain),
    in: vi.fn(() => chain),
    is: vi.fn(() => {
      if (deferred) {
        return deferred.promise;
      }
      return Promise.resolve({ count, error });
    }),
    limit: vi.fn(() => Promise.resolve({ data: rows, error })),
    maybeSingle: vi.fn(() => Promise.resolve({ data: rows[0] ?? null, error })),
  };

  return chain;
}

function configureSupabase({ trackerCount, people = [], assignments = [], orgCounts = {}, orgPeople = {}, orgAssignments = {} }) {
  mockSupabase.from.mockImplementation((table) => {
    const makeQueryForOrg = (orgId) => {
      if (table === 'memberships') {
        const config = orgCounts[orgId] ?? { count: trackerCount, error: null };
        return makeTableQuery({
          count: config.count,
          error: config.error ?? null,
          deferred: config.deferred,
        });
      }

      if (table === 'asignaciones') {
        const config = orgAssignments[orgId] ?? { rows: assignments };
        return makeTableQuery({ rows: config.rows ?? assignments, error: config.error ?? null, deferred: config.deferred });
      }

      if (table === 'personal') {
        const config = orgPeople[orgId] ?? { rows: people };
        return makeTableQuery({ rows: config.rows ?? people, error: config.error ?? null, deferred: config.deferred });
      }

      return makeTableQuery({ rows: [], count: 0, error: null });
    };

    const chain = {
      select: vi.fn(() => chain),
      eq: vi.fn((field, value) => {
        if (field === 'org_id' && value) {
          return makeQueryForOrg(String(value));
        }
        return chain;
      }),
      or: vi.fn(() => chain),
      in: vi.fn(() => chain),
      is: vi.fn(() => Promise.resolve({ count: trackerCount, error: null })),
      limit: vi.fn(() => Promise.resolve({ data: [], error: null })),
      maybeSingle: vi.fn(() => Promise.resolve({ data: null, error: null })),
    };

    return chain;
  });
}

vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual('react-router-dom');
  return {
    ...actual,
    useNavigate: () => mockNavigate,
  };
});

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: mockT,
    i18n: { resolvedLanguage: 'es', language: 'es' },
  }),
}));

vi.mock('@/hooks/useOrgEntitlements.js', () => ({
  default: (...args) => mockUseOrgEntitlements(...args),
}));

vi.mock('@/context/auth.js', () => ({
  useAuthSafe: (...args) => mockUseAuthSafe(...args),
}));

vi.mock('@/lib/supabaseClient', () => ({
  supabase: {
    auth: {
      getSession: vi.fn(async () => ({ data: { session: { access_token: 'token-123' } }, error: null })),
    },
    from: mockSupabase.from,
  },
}));

const InvitarTracker = (await import('./InvitarTracker.jsx')).default;

describe('InvitarTracker gate rendering and tracker cap', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    activeOrgId = 'org-123';
    mockUseAuthSafe.mockImplementation(() => ({
      loading: false,
      session: { access_token: 'token-123' },
      orgId: activeOrgId,
    }));
  });

  afterEach(() => {
    cleanup();
  });

  it.each([
    { label: 'FREE allows 0 trackers under the limit', plan: 'free', planStatus: 'free', maxTrackers: 2, trackerCount: 0, expectedDisabled: false },
    { label: 'FREE allows 1 tracker under the limit', plan: 'free', planStatus: 'free', maxTrackers: 2, trackerCount: 1, expectedDisabled: false },
    { label: 'FREE blocks at 2 trackers', plan: 'free', planStatus: 'free', maxTrackers: 2, trackerCount: 2, expectedDisabled: true },
    { label: 'PRO allows 9 trackers under the limit', plan: 'pro', planStatus: 'active', maxTrackers: 10, trackerCount: 9, expectedDisabled: false },
    { label: 'PRO blocks at 10 trackers', plan: 'pro', planStatus: 'active', maxTrackers: 10, trackerCount: 10, expectedDisabled: true },
    { label: 'Enterprise allows 49 trackers under the limit', plan: 'enterprise', planStatus: 'active', maxTrackers: 50, trackerCount: 49, expectedDisabled: false },
    { label: 'Enterprise blocks at 50 trackers', plan: 'enterprise', planStatus: 'active', maxTrackers: 50, trackerCount: 50, expectedDisabled: true },
  ])('$label', async ({ plan, planStatus, maxTrackers, trackerCount, expectedDisabled }) => {
    mockUseOrgEntitlements.mockReturnValue({
      entitlements: {
        max_trackers: maxTrackers,
        plan_code: plan,
        plan_status: planStatus,
        cancel_at_period_end: false,
      },
      loading: false,
      error: null,
      canInviteTrackers: true,
    });

    configureSupabase({
      trackerCount,
      people: [{
        id: 'person-1',
        org_id: 'org-123',
        nombre: 'Ana',
        apellido: 'García',
        email: 'ana@example.com',
        user_id: 'user-1',
        is_deleted: false,
      }],
      assignments: [{
        id: 'assignment-1',
        org_id: 'org-123',
        personal_id: 'person-1',
        user_id: 'user-1',
        estado: 'activa',
        status: 'active',
        start_time: new Date().toISOString(),
        end_time: null,
        is_deleted: false,
      }],
    });

    const { unmount } = render(
      <MemoryRouter>
        <InvitarTracker />
      </MemoryRouter>,
    );

    if (expectedDisabled) {
      await waitFor(() => {
        expect(screen.getByText(/Límite alcanzado/i)).toBeInTheDocument();
      });
      expect(screen.queryByRole('button', { name: /Enviar invitación/i })).not.toBeInTheDocument();
      expect(screen.queryByRole('combobox')).not.toBeInTheDocument();
    } else {
      await waitFor(() => {
        expect(screen.getByRole('combobox')).toBeInTheDocument();
      });

      fireEvent.change(screen.getByRole('combobox'), {
        target: { value: 'person-1' },
      });

      await waitFor(() => {
        const submitButton = screen.getByRole('button', { name: /Enviar invitación/i });
        expect(submitButton).toBeInTheDocument();
        expect(submitButton).toBeEnabled();
      });

      expect(screen.queryByText(/Límite alcanzado/i)).not.toBeInTheDocument();
    }

    unmount();
  });

  it('blocks when the plan information is unavailable', async () => {
    mockUseOrgEntitlements.mockReturnValue({
      entitlements: { max_trackers: 2, plan_code: 'pro', plan_status: 'active', cancel_at_period_end: false },
      loading: false,
      error: 'plan failed',
      canInviteTrackers: false,
    });

    const { unmount } = render(
      <MemoryRouter>
        <InvitarTracker />
      </MemoryRouter>,
    );

    await waitFor(() => {
      expect(screen.getAllByText(/No se pudo cargar la información del plan/i).length).toBeGreaterThan(0);
    });
    expect(screen.queryByRole('button', { name: /Enviar invitación/i })).not.toBeInTheDocument();

    cleanup();
    unmount();
  });

  it('blocks when tracker count is unavailable', async () => {
    mockUseOrgEntitlements.mockReturnValue({
      entitlements: { max_trackers: 2, plan_code: 'pro', plan_status: 'active', cancel_at_period_end: false },
      loading: false,
      error: null,
      canInviteTrackers: true,
    });

    configureSupabase({
      trackerCount: null,
      people: [{
        id: 'person-1',
        org_id: 'org-123',
        nombre: 'Ana',
        apellido: 'García',
        email: 'ana@example.com',
        user_id: 'user-1',
        is_deleted: false,
      }],
      assignments: [{
        id: 'assignment-1',
        org_id: 'org-123',
        personal_id: 'person-1',
        user_id: 'user-1',
        estado: 'activa',
        status: 'active',
        start_time: new Date().toISOString(),
        end_time: null,
        is_deleted: false,
      }],
    });

    const { unmount } = render(
      <MemoryRouter>
        <InvitarTracker />
      </MemoryRouter>,
    );

    await waitFor(() => {
      expect(screen.getAllByText(/No se pudo consultar el cupo de trackers disponible/i).length).toBeGreaterThan(0);
    });
    expect(screen.queryByRole('button', { name: /Enviar invitación/i })).not.toBeInTheDocument();

    cleanup();
    unmount();
  });

  it('ignores stale previous-org responses when the org changes', async () => {
    const orgAValue = createDeferred();
    const orgBValue = createDeferred();

    configureSupabase({
      orgCounts: {
        'org-123': { count: 0, deferred: orgAValue },
        'org-456': { count: 2, deferred: orgBValue },
      },
      people: [{
        id: 'person-1',
        org_id: 'org-456',
        nombre: 'Ana',
        apellido: 'García',
        email: 'ana@example.com',
        user_id: 'user-1',
        is_deleted: false,
      }],
      assignments: [{
        id: 'assignment-1',
        org_id: 'org-456',
        personal_id: 'person-1',
        user_id: 'user-1',
        estado: 'activa',
        status: 'active',
        start_time: new Date().toISOString(),
        end_time: null,
        is_deleted: false,
      }],
    });

    mockUseOrgEntitlements.mockReturnValue({
      entitlements: { max_trackers: 2, plan_code: 'pro', plan_status: 'active', cancel_at_period_end: false },
      loading: false,
      error: null,
      canInviteTrackers: true,
    });

    mockUseAuthSafe.mockImplementation(() => ({
      loading: false,
      session: { access_token: 'token-123' },
      orgId: 'org-123',
    }));

    const { rerender, unmount } = render(
      <MemoryRouter>
        <InvitarTracker />
      </MemoryRouter>,
    );

    mockUseAuthSafe.mockImplementation(() => ({
      loading: false,
      session: { access_token: 'token-123' },
      orgId: 'org-456',
    }));
    rerender(
      <MemoryRouter>
        <InvitarTracker />
      </MemoryRouter>,
    );

    orgBValue.resolve({ count: 2, error: null });
    await waitFor(() => {
      expect(screen.getByText(/Límite alcanzado/i)).toBeInTheDocument();
    });
    expect(screen.queryByRole('button', { name: /Enviar invitación/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('combobox')).not.toBeInTheDocument();

    orgAValue.resolve({ count: 0, error: null });
    await waitFor(() => {
      expect(screen.getByText(/Límite alcanzado/i)).toBeInTheDocument();
    });
    expect(screen.queryByRole('button', { name: /Enviar invitación/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('combobox')).not.toBeInTheDocument();

    unmount();
  });
});
