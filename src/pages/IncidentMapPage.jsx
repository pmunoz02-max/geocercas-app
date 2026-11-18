import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useAuthSafe } from '@/context/auth.js';
import IncidentReports from '../components/IncidentReports';
import { IncidentStatusTimeline } from '../components/IncidentVisualizations';
import { incidentTransport } from '../lib/incidentTransport';
import { incidentWords } from '../lib/incidentWords';

export default function IncidentMapPage() {
  const { currentOrgId, currentOrg, orgId, user, currentRole, role } = useAuthSafe();
  const org = currentOrgId || currentOrg?.id || orgId;
  const effectiveRole = String(currentRole || role || '').toLowerCase().trim();
  const { t, i18n } = useTranslation();
  const language = i18n.resolvedLanguage || i18n.language;
  const words = incidentWords[language?.slice(0, 2)] || incidentWords.es;
  const title = t('app.tabs.incidentMap');
  return (
    <div className="mx-auto max-w-6xl space-y-5">
      <h1 className="text-3xl font-bold text-slate-900">{title}</h1>
      {org && user?.id && ['owner', 'admin'].includes(effectiveRole)
        ? <IncidentMapView key={JSON.stringify([org, user.id])} org={org} user={user.id} words={words} language={language} />
        : <p role="status">{words.denied}</p>}
    </div>
  );
}

function IncidentMapView({ org, user, words, language }) {
  const request = useMemo(() => incidentTransport(org, user), [org, user]);
  const [selection, setSelection] = useState(null);
  const [result, setResult] = useState(null);
  const detail = useRef(null);

  useEffect(() => {
    if (!selection) return;
    const controller = new AbortController();
    async function loadDetail() {
      try {
        const query = new URLSearchParams({ org_id: org, id: selection.id });
        const response = await request('/api/incidents?' + query, { signal: controller.signal });
        if (!response.ok) throw new Error('detail_failed');
        const data = await response.json();
        if (data.incident?.id !== selection.id || !Array.isArray(data.events)) throw new Error('invalid_detail');
        if (!controller.signal.aborted) setResult({ selection, data });
      } catch {
        if (!controller.signal.aborted) setResult({ selection, error: true });
      }
    }
    loadDetail();
    return () => controller.abort();
  }, [selection, org, request]);

  const selectedResult = result?.selection === selection ? result : null;
  useEffect(() => {
    if (!selectedResult) return;
    detail.current?.focus({ preventScroll: true });
    detail.current?.scrollIntoView?.({ block: 'nearest' });
  }, [selectedResult]);

  const incident = selectedResult?.data?.incident;
  return (
    <>
      <IncidentReports org={org} user={user} request={request} words={words} language={language} onOpen={id => setSelection({ id })} />
      {selection && (
        <section ref={detail} tabIndex={-1} aria-label={words.detail} className="scroll-mt-24 space-y-3 rounded-xl border bg-white p-5">
          {!selectedResult && <p role="status">{words.loading}</p>}
          {selectedResult?.error && <p role="alert">{words.error}</p>}
          {incident && (
            <>
              <h2 className="text-xl font-semibold">{incident.title}</h2>
              <p>{incident.geofence_name_snapshot} · {words.severities[incident.severity]} · {words.states[incident.status]}</p>
              <IncidentStatusTimeline events={selectedResult.data.events} words={words} language={language} />
            </>
          )}
          <button type="button" className="text-emerald-800 underline" onClick={() => { setSelection(null); setResult(null); }}>{words.back}</button>
        </section>
      )}
    </>
  );
}
