import { useEffect, useMemo, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";

function getTrackerTarget(search) {
  const incoming = new URLSearchParams(search || "");
  const out = new URLSearchParams();

  [
    "org_id",
    "orgId",
    "lang",
    "invite_id",
    "t",
    "inviteToken",
    "invite_token",
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

  const isAndroid = useMemo(
    () => /Android/i.test(String(navigator.userAgent || "")),
    []
  );

  const targetPath = useMemo(
    () => getTrackerTarget(location.search),
    [location.search]
  );






  function openApp() {
    navigate(targetPath, { replace: true });
  }

  function openInBrowser() {
    navigate(targetPath, { replace: true });
  }

  return (
    <div className="min-h-screen bg-slate-100 text-slate-900 flex items-center justify-center p-6">

      // Google Play Store URL for the app (replace with actual package name if needed)
      const playStoreUrl = "https://play.google.com/store/apps/details?id=com.geocercas.tracker";

      function openInBrowser() {
        if (consent) navigate(targetPath, { replace: true });
      }

      function installApp() {
        if (consent) window.open(playStoreUrl, "_blank");
      }

      function openPlayStoreApp() {
        if (consent) window.open(playStoreUrl, "_blank");
      }
        </p>

        <div className="mt-5 space-y-3">
          <button
            type="button"
            onClick={openApp}
    const [consent, setConsent] = useState(false);
          </button>
    function openApp() {
      if (consent) navigate(targetPath, { replace: true });
    }

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

            <label className="flex items-center space-x-2">
              <input
                type="checkbox"
                checked={consent}
                onChange={e => setConsent(e.target.checked)}
                className="form-checkbox h-4 w-4 text-emerald-600"
                required
              />
              <span className="text-sm text-slate-700">
                Acepto compartir mi ubicación para el funcionamiento del tracker.
              </span>
            </label>
          </div>
          <button
            type="button"
            onClick={openInBrowser}
            className="w-full rounded-xl border border-slate-300 bg-white text-slate-900 px-4 py-3 font-medium"
          >
              const location = useLocation();
              const navigate = useNavigate();

              const [status, setStatus] = useState("opening");
              const [consent, setConsent] = useState(false);

              const isAndroid = useMemo(
                () => /Android/i.test(String(navigator.userAgent || "")),
                []
              );

              const targetPath = useMemo(
                () => getTrackerTarget(location.search),
                [location.search]
              );

              function openApp() {
                navigate(targetPath, { replace: true });
              }

              function openInBrowser() {
                if (consent) navigate(targetPath, { replace: true });
              }

              function installApp() {
                window.location.href =
                  "https://play.google.com/store/apps/details?id=com.fenice.geocercas";
              }

              function openPlayStoreApp() {
                window.location.href =
                  "market://details?id=com.fenice.geocercas";
              }

              return (
                <div className="min-h-screen bg-slate-100 text-slate-900 flex items-center justify-center p-6">
                  <div className="w-full max-w-md rounded-2xl bg-white border border-slate-200 shadow-xl p-6">
                    <h1 className="text-2xl font-semibold tracking-tight">Tracker Invite</h1>

                    <p className="mt-2 text-sm text-slate-600">
                      {isAndroid
                        ? "Estamos intentando abrir la app. Si no está instalada, Android debe enviarte a Google Play."
                        : "Abre esta invitación desde un dispositivo Android para instalar o abrir la app."}
                    </p>

                    <label style={{ display: "block", marginTop: 16 }}>
                      <input
                        type="checkbox"
                        checked={consent}
                        onChange={(e) => setConsent(e.target.checked)}
                      />
                      {" "}
                      Acepto el uso de mi ubicación en tiempo real, incluso en segundo plano.
                    </label>

                    <div style={{ marginTop: 24, display: "flex", flexDirection: "column", gap: 12 }}>
                      <button
                        onClick={openApp}
                        disabled={!consent}
                      >
                        Abrir app
                      </button>
                      <button
                        onClick={installApp}
                        disabled={!consent}
                      >
                        Instalar app
                      </button>
                      <button
                        onClick={openPlayStoreApp}
                        disabled={!consent}
                      >
                        Abrir en Play Store
                      </button>
                      <button
                        onClick={openInBrowser}
                        disabled={!consent}
                      >
                        Continuar en navegador
                      </button>
                    </div>

                    <p className="mt-4 text-xs text-slate-500">
                      Estado: {status}
                    </p>
                  </div>
                </div>
              );
            }