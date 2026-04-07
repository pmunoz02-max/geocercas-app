import { useEffect, useMemo, useState } from "react";
import { useLocation } from "react-router-dom";

const PACKAGE_ID = "com.fenice.geocercas";
const HOST = "preview.tugeocercas.com";
const PLAY_STORE_WEB_URL = `https://play.google.com/store/apps/details?id=${PACKAGE_ID}`;

function buildTrackerPath(search) {
  const input = new URLSearchParams(search || "");
  const out = new URLSearchParams();

  ["org_id", "lang", "invite_id", "invite_token", "token", "access_token"].forEach((k) => {
    const v = input.get(k);
    if (v) out.set(k, v);
  });

  const qs = out.toString();
  return qs ? `/tracker-gps?${qs}` : "/tracker-gps";
}

function buildIntentUrl(pathWithQuery) {
  const safePath = String(pathWithQuery || "/tracker-gps").replace(/^\//, "");
  return `intent://${HOST}/${safePath}#Intent;scheme=https;package=${PACKAGE_ID};end`;
}

export default function TrackerInviteStart() {
  const location = useLocation();
  const [status, setStatus] = useState("Abriendo app...");

  const isAndroid = useMemo(() => /Android/i.test(String(navigator.userAgent || "")), []);
  const targetPath = useMemo(() => buildTrackerPath(location.search), [location.search]);
  const intentUrl = useMemo(() => buildIntentUrl(targetPath), [targetPath]);

  useEffect(() => {
    if (!isAndroid) {
      window.location.replace(targetPath);
      return;
    }

    let appOpened = false;

    const onVisibilityChange = () => {
      if (document.hidden) appOpened = true;
    };

    document.addEventListener("visibilitychange", onVisibilityChange);

    window.location.replace(intentUrl);

    const fallbackTimer = window.setTimeout(() => {
      if (!appOpened) {
        setStatus("App no instalada. Redirigiendo a Google Play...");
        window.location.replace(PLAY_STORE_WEB_URL);
      }
    }, 1800);

    return () => {
      document.removeEventListener("visibilitychange", onVisibilityChange);
      window.clearTimeout(fallbackTimer);
    };
  }, [intentUrl, isAndroid, targetPath]);

  return (
    <div className="min-h-screen bg-slate-100 text-slate-900 flex items-center justify-center p-6">
      <div className="w-full max-w-md rounded-2xl bg-white border border-slate-200 shadow-xl p-6">
        <h1 className="text-2xl font-semibold tracking-tight">Tracker Invite</h1>
        <p className="mt-2 text-sm text-slate-600">{status}</p>
      </div>
    </div>
  );
}