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

  function openInBrowser() {
    if (!consent) {
      setStatus("consent_required");
      return;
    }
    setStatus("opening_browser");
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
            onClick={openApp}
            className="w-full rounded-xl bg-slate-900 text-white px-4 py-3 font-medium"
          >
            Abrir app
          </button>

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

          <button
            type="button"
            onClick={openInBrowser}
            className="w-full rounded-xl border border-slate-300 bg-white text-slate-900 px-4 py-3 font-medium"
          >
            Continuar en navegador
          </button>
        </div>

        <p className="mt-4 text-xs text-slate-500">Estado: {status}</p>
      </div>
    </div>
  );
}