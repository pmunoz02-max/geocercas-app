import { useEffect, useMemo, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";

const ANDROID_PACKAGE_ID = "com.fenice.geocercas";
const PLAY_STORE_WEB_URL = `https://play.google.com/store/apps/details?id=${ANDROID_PACKAGE_ID}`;
const PLAY_STORE_MARKET_URL = `market://details?id=${ANDROID_PACKAGE_ID}`;
const APP_LINK_ORIGIN = "https://preview.tugeocercas.com";

function getTrackerTarget(search) {
  const incoming = new URLSearchParams(search || "");
  const out = new URLSearchParams();

  [
    "org_id",
    "lang",
    "invite_id",
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

function buildIntentUrl(targetPath) {
  const normalized = String(targetPath || "/tracker-gps");
  const cleanPath = normalized.startsWith("/") ? normalized : `/${normalized}`;
  const fallback = encodeURIComponent(PLAY_STORE_WEB_URL);

  return `intent://preview.tugeocercas.com${cleanPath}#Intent;scheme=https;package=${ANDROID_PACKAGE_ID};S.browser_fallback_url=${fallback};end`;
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

  const appLinkUrl = `${APP_LINK_ORIGIN}${targetPath}`;
  const intentUrl = useMemo(() => buildIntentUrl(targetPath), [targetPath]);

  useEffect(() => {
    if (!isAndroid) {
      setStatus("non-android");
      return;
    }

    const timer = window.setTimeout(() => {
      setStatus("opening");
      window.location.href = intentUrl;
    }, 150);

    return () => window.clearTimeout(timer);
  }, [intentUrl, isAndroid]);

  function openApp() {
    if (isAndroid) {
      window.location.href = intentUrl;
      return;
    }
    window.location.href = appLinkUrl;
  }

  function installApp() {
    window.location.href = PLAY_STORE_WEB_URL;
  }

  function openPlayStoreApp() {
    if (isAndroid) {
      window.location.href = PLAY_STORE_MARKET_URL;
      return;
    }
    window.location.href = PLAY_STORE_WEB_URL;
  }

  function openInBrowser() {
    navigate(targetPath, { replace: true });
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

        <p className="mt-4 text-xs text-slate-500">
          Estado: {status}
        </p>
      </div>
    </div>
  );
}