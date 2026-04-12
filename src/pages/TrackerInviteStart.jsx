const getInviteParams = () => {
  const url = new URL(window.location.href)

  const inviteToken =
    url.searchParams.get('inviteToken') ||
    url.searchParams.get('t') ||
    url.searchParams.get('access_token') ||
    ''

  const orgId =
    url.searchParams.get('org_id') ||
    url.searchParams.get('organization_id') ||
    url.searchParams.get('orgId') ||
    ''

  const lang = url.searchParams.get('lang') || 'es'

  return { inviteToken, orgId, lang }
}
import { useMemo, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";

function getTrackerTarget(search) {
  const incoming = new URLSearchParams(search || "");
  const out = new URLSearchParams();

  [
    "org_id",
    "orgId",
    "lang",
    "invite_id",
    "inviteToken",
    "invite_token",
    "t",
    "token",
    "access_token",
  ].forEach((k) => {
    const v = incoming.get(k);
    if (v) out.set(k, v);
  });

  const qs = out.toString();
  return qs ? `/tracker-gps?${qs}` : "/tracker-gps";
}

export default function TrackerInviteStart() {
    const [accepting, setAccepting] = useState(false)
    const [acceptError, setAcceptError] = useState('')

    const handleAcceptInvite = async () => {
      if (accepting) return

      setAcceptError('')

      const { inviteToken, orgId, lang } = getInviteParams()

      if (!inviteToken) {
        setAcceptError('Falta invite token en la URL')
        return
      }

      try {
        setAccepting(true)

        const requestUrl = '/api/accept-tracker-invite'
        const fullUrl = new URL(requestUrl, window.location.origin).toString()
        const deploymentMarker = 'DEPLOYMENT_MARKER_V1'
        console.log('[invite-debug] origin=', window.location.origin)
        console.log('[invite-debug] pathname=', window.location.pathname)
        console.log('[invite-debug] requestUrl=', requestUrl)
        console.log('[invite-debug] fullUrl=', fullUrl)
        console.log('[invite-debug] deploymentMarker=', deploymentMarker)


        // Runtime token sources
        const runtimeInviteToken = window?.runtimeInviteToken || null
        const token = window?.token || null
        const authToken = inviteToken || runtimeInviteToken || token || null

        console.log('[invite-debug] inviteToken=', inviteToken)
        console.log('[invite-debug] runtimeInviteToken=', runtimeInviteToken)
        console.log('[invite-debug] token=', token)
        console.log('[invite-debug] authToken=', authToken)
        console.log('[invite-debug] auth header token present =', !!authToken)

        const response = await fetch(requestUrl, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            ...(authToken ? { Authorization: `Bearer ${authToken}` } : {}),
          },
          body: JSON.stringify({
            consentAccepted: true,
          }),
        })

        const rawText = await response.text()
        let data = {}
        try {
          data = rawText ? JSON.parse(rawText) : {}
        } catch {
          data = { rawText }
        }

        if (!response.ok) {
          throw new Error(
            data?.message ||
            data?.code ||
            data?.rawText ||
            `accept_tracker_invite_failed:${response.status}`
          )
        }

        const nextUrl = new URL('/tracker-gps', window.location.origin)
        nextUrl.searchParams.set('t', inviteToken)
        if (orgId) nextUrl.searchParams.set('org_id', orgId)
        if (lang) nextUrl.searchParams.set('lang', lang)

        window.location.assign(nextUrl.toString())
      } catch (error) {
        const debugInfo = [
          `origin=${window.location.origin}`,
          `pathname=${window.location.pathname}`,
          `fullUrl=${new URL('/api/accept-tracker-invite', window.location.origin).toString()}`,
          `deploymentMarker=DEPLOYMENT_MARKER_V1`,
          `message=${error?.message || 'unknown_error'}`
        ].join('\n')
        console.error('[tracker-invite] accept failed', debugInfo, error)
        setAcceptError(debugInfo)
      } finally {
        setAccepting(false)
      }
    }
  const location = useLocation();
  const navigate = useNavigate();

  const [status, setStatus] = useState("opening");
  const [consent, setConsent] = useState(false);

  const isAndroid = useMemo(
    () => /Android/i.test(String(navigator.userAgent || "")),
    [],
  );

  const targetPath = useMemo(
    () => getTrackerTarget(location.search),
    [location.search],
  );

  function openApp() {
    if (!consent) {
      setStatus("consent_required");
      return;
    }
    setStatus("opening_app");
    navigate(targetPath, { replace: true });
  }


  function installApp() {
    if (!consent) {
      setStatus("consent_required");
      return;
    }
    setStatus("opening_play_store");
    window.location.href =
      "https://play.google.com/store/apps/details?id=com.fenice.geocercas";
  }

  function openPlayStoreApp() {
    if (!consent) {
      setStatus("consent_required");
      return;
    }
    setStatus("opening_play_store");
    window.location.href =
      "https://play.google.com/store/apps/details?id=com.fenice.geocercas";
  }

  return (
    <div className="min-h-screen bg-slate-100 text-slate-900 flex items-center justify-center p-6">
      <div className="w-full max-w-md rounded-2xl bg-white border border-slate-200 shadow-xl p-6">
        <h1 className="text-2xl font-semibold tracking-tight">
          Background location
        </h1>

        <div className="mt-4 rounded-xl border border-slate-200 bg-slate-50 p-4 text-sm text-slate-700 leading-6">
          <p>
            App Geocercas collects your location even when the app is closed or
            the phone is locked in order to record positions and validate
            geofence entry and exit during the workday.
          </p>
          <p className="mt-3">
            This information is used only for the organization&apos;s
            operational purposes and is not shared with third parties or used
            for advertising. You can stop tracking by revoking location
            permission or signing out.
          </p>
        </div>

        <label className="mt-4 flex items-start gap-3 text-sm text-slate-700">
          <input
            type="checkbox"
            checked={consent}
            onChange={(e) => setConsent(e.target.checked)}
            className="mt-1"
          />
          <span>
            I have read and accept the background location tracking notice.
          </span>
        </label>

        <p className="mt-3 text-sm text-slate-600">
          {isAndroid
            ? "Abre la app si ya está instalada. Si no, instálala desde Google Play."
            : "Esta invitación está pensada para abrirse desde un dispositivo Android."}
        </p>


        <div className="mt-5 space-y-3">
          <button
            type="button"
            onClick={handleAcceptInvite}
            disabled={accepting}
            className="w-full rounded-xl bg-slate-900 text-white px-4 py-3 font-medium"
          >
            {accepting ? 'Aceptando...' : 'Aceptar y continuar'}

          </button>
          {acceptError ? (
            <div style={{ color: 'red', marginTop: 12 }}>
              {acceptError}
            </div>
          ) : null}


          <button
            type="button"
            onClick={installApp}
            className="w-full rounded-xl bg-emerald-600 text-white px-4 py-3 font-medium"
          >
            Instalar app
          </button>

          <button
            type="button"
            onClick={openPlayStoreApp}
            className="w-full rounded-xl border border-emerald-600 bg-white text-emerald-700 px-4 py-3 font-medium"
          >
            Abrir en Play Store
          </button>

        </div>

        <p className="mt-4 text-xs text-slate-500">Estado: {status}</p>
      </div>
    </div>
  );
}