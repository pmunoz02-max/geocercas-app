import { useMemo, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";

function getInviteParams() {
  const url = new URL(window.location.href);

  const inviteToken =
    url.searchParams.get("inviteToken") ||
    url.searchParams.get("invite_token") ||
    url.searchParams.get("t") ||
    url.searchParams.get("token") ||
    url.searchParams.get("access_token") ||
    "";

  const orgId =
    url.searchParams.get("org_id") ||
    url.searchParams.get("organization_id") ||
    url.searchParams.get("orgId") ||
    "";

  const lang = url.searchParams.get("lang") || "es";

  return { inviteToken, orgId, lang };
}

function getTrackerTarget(search, fallbackOrgId = "") {
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

  if (!out.get("org_id") && fallbackOrgId) {
    out.set("org_id", fallbackOrgId);
  }

  const qs = out.toString();
  return qs ? `/tracker-gps?${qs}` : "/tracker-gps";
}

function requestCurrentPositionOnce() {
  return new Promise((resolve, reject) => {
    if (!navigator?.geolocation) {
      reject(new Error("Geolocation API not available"));
      return;
    }

    navigator.geolocation.getCurrentPosition(resolve, reject, {
      enableHighAccuracy: true,
      maximumAge: 0,
      timeout: 60000,
    });
  });
}

function getGeoErrorMessage(error) {
  const code = error?.code;
  const raw = String(error?.message || "").toLowerCase();

  if (code === 1 || raw.includes("permission")) {
    return "La ubicación está bloqueada para este sitio. Habilítala en Chrome para continuar.";
  }

  if (code === 2) {
    return "No se pudo obtener la ubicación. Activa GPS y vuelve a intentar.";
  }

  if (code === 3 || raw.includes("timeout")) {
    return "La ubicación tardó demasiado. Intenta de nuevo con mejor señal GPS.";
  }

  return "No se pudo obtener permiso de ubicación.";
}

async function getPermissionState() {
  try {
    if (!navigator?.permissions?.query) return "unknown";
    const result = await navigator.permissions.query({ name: "geolocation" });
    return result?.state || "unknown";
  } catch {
    return "unknown";
  }
}

async function ensureGeolocationPermissionByPrompt() {
  const state = await getPermissionState();

  if (state === "granted") {
    return { ok: true, permissionState: "granted" };
  }

  if (state === "denied") {
    return {
      ok: false,
      permissionState: "denied",
      message:
        "La ubicación está bloqueada para este sitio. En Chrome: Ajustes del sitio → Ubicación → Permitir.",
    };
  }

  try {
    await requestCurrentPositionOnce();
    return { ok: true, permissionState: "prompt_or_unknown" };
  } catch (error) {
    return {
      ok: false,
      permissionState: state,
      message: getGeoErrorMessage(error),
      rawError: error,
    };
  }
}

export default function TrackerInviteStart() {
  const location = useLocation();
  const navigate = useNavigate();

  const [acceptError, setAcceptError] = useState("");
  const [status, setStatus] = useState("ready");
  const [consent, setConsent] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const { inviteToken, orgId } = getInviteParams();

  const runtimeInviteToken =
    typeof window !== "undefined" ? window.runtimeInviteToken || null : null;
  const token =
    typeof window !== "undefined" ? window.token || null : null;

  const authToken = inviteToken || runtimeInviteToken || token || null;

  const authTokenDebug = authToken
    ? {
        length: authToken.length,
        prefix: authToken.slice(0, 8),
        suffix: authToken.slice(-6),
        source: inviteToken
          ? "inviteToken"
          : runtimeInviteToken
            ? "runtimeInviteToken"
            : token
              ? "token"
              : "none",
      }
    : null;

  const isAndroid = useMemo(
    () => /Android/i.test(String(navigator.userAgent || "")),
    [],
  );

const isInAppBrowser = useMemo(() => {
  const ua = String(navigator.userAgent || "").toLowerCase();

  return (
    ua.includes("wv") || // Android WebView
    ua.includes("version/") && ua.includes("chrome") === false || // webview fallback
    ua.includes("gmail") ||
    ua.includes("gsa") ||
    ua.includes("fbav") ||
    ua.includes("instagram") ||
    ua.includes("line")
  );
}, []);
  const targetPath = useMemo(
    () => getTrackerTarget(location.search, orgId),
    [location.search, orgId],
  );

  async function retryGeolocation() {
    try {
      setAcceptError("");
      setStatus("retrying_geo");

      const geo = await ensureGeolocationPermissionByPrompt();

      if (!geo.ok) {
        setStatus("geo_permission_required");
        setAcceptError(geo.message);
        return;
      }

      setStatus("ready");
    } catch (error) {
      console.error("[tracker-invite] retry geolocation failed", error);
      setStatus("geo_permission_required");
      setAcceptError("No se pudo volver a solicitar la ubicación.");
    }
  }

  function openInChrome() {
    try {
      const url = window.location.href;

      if (isAndroid) {
        const cleanUrl = url.replace(/^https?:\/\//, "");
        window.location.href = `intent://${cleanUrl}#Intent;scheme=https;package=com.android.chrome;end`;
        return;
      }

      window.open(url, "_blank", "noopener,noreferrer");
    } catch (error) {
      console.error("[tracker-invite] openInChrome failed", error);
      setAcceptError("No se pudo abrir en Chrome automáticamente.");
    }
  }

  async function handleAccept(e) {
    e?.preventDefault?.();
    e?.stopPropagation?.();

    if (!consent) {
      setStatus("consent_required");
      setAcceptError("Debes aceptar el consentimiento antes de continuar.");
      return;
    }

    if (!authToken) {
      setStatus("missing_invite_token");
      setAcceptError("Missing invite token.");
      return;
    }

    try {
      setSubmitting(true);
      setAcceptError("");

      setStatus("requesting_geo_permission");
      const geo = await ensureGeolocationPermissionByPrompt();

      if (!geo.ok) {
        setStatus("geo_permission_required");
        setAcceptError(geo.message);
        return;
      }

      setStatus("accepting");

      const response = await fetch("/api/accept-tracker-invite", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${authToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          inviteToken: authToken,
          org_id: orgId || null,
        }),
      });

      const data = await response.json().catch(() => ({}));

      console.log("[invite-accept] status", response.status);
      console.log("[invite-accept] response", data);

      if (!response.ok || !data?.ok) {
        throw new Error(
          data?.message ||
            data?.code ||
            data?.error ||
            `accept_tracker_invite_failed:${response.status}`,
        );
      }

      if (data.tracker_runtime_token) {
        localStorage.setItem("tracker_runtime_token", data.tracker_runtime_token);
        sessionStorage.setItem(
          "tracker_runtime_token",
          data.tracker_runtime_token,
        );
      }

      if (data.tracker_user_id) {
        localStorage.setItem("tracker_user_id", data.tracker_user_id);
        sessionStorage.setItem("tracker_user_id", data.tracker_user_id);
      }

      if (data.org_id) {
        localStorage.setItem("tracker_org_id", data.org_id);
        sessionStorage.setItem("tracker_org_id", data.org_id);
        localStorage.setItem("org_id", data.org_id);
        sessionStorage.setItem("org_id", data.org_id);
      }

      if (data.invite_id) {
        localStorage.setItem("tracker_invite_id", data.invite_id);
        sessionStorage.setItem("tracker_invite_id", data.invite_id);
      }

      setStatus(data.idempotent ? "already_accepted" : "accepted");

      const redirectTo =
        typeof data?.redirectTo === "string" && data.redirectTo
          ? data.redirectTo
          : targetPath;

      navigate(redirectTo, { replace: true });
    } catch (error) {
      console.error("[tracker-invite] accept failed", error);
      setStatus("accept_failed");
      setAcceptError(error?.message || "accept_tracker_invite_failed");
    } finally {
      setSubmitting(false);
    }
  }

  function installApp() {
    if (!consent) {
      setStatus("consent_required");
      setAcceptError("Debes aceptar el consentimiento antes de continuar.");
      return;
    }

    setStatus("opening_play_store");
    window.location.href =
      "https://play.google.com/store/apps/details?id=com.fenice.geocercas";
  }

  function openPlayStoreApp() {
    if (!consent) {
      setStatus("consent_required");
      setAcceptError("Debes aceptar el consentimiento antes de continuar.");
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
            onChange={(e) => {
              setConsent(e.target.checked);
              if (e.target.checked) {
                setAcceptError("");
                setStatus("ready");
              }
            }}
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
          {authTokenDebug && (
            <div className="mb-2 p-2 rounded bg-slate-50 border border-slate-200 text-xs text-slate-700">
              <strong>Invite Token Debug:</strong>
              <br />
              length: {authTokenDebug.length}
              <br />
              prefix: {authTokenDebug.prefix}
              <br />
              suffix: {authTokenDebug.suffix}
              <br />
              source: {authTokenDebug.source}
            </div>
          )}

          <button
            type="button"
            onClick={handleAccept}
            disabled={submitting}
            className="w-full rounded-xl bg-slate-900 text-white px-4 py-3 font-medium disabled:opacity-60"
          >
            {submitting ? "Aceptando..." : "Aceptar y continuar"}
          </button>

          {status === "geo_permission_required" ? (
            <div className="mt-3 rounded-xl border border-red-200 bg-red-50 p-4 text-sm">
              <p className="font-medium text-red-700">
                Necesitamos tu ubicación para continuar
              </p>

              <p className="mt-2 text-red-600">
                Tu navegador tiene la ubicación bloqueada o no pudo mostrar el
                permiso. Debes habilitarla manualmente para seguir.
              </p>

              {acceptError ? (
                <p className="mt-2 text-red-600">{acceptError}</p>
              ) : null}

              <div className="mt-3 space-y-2">
                <button
                  type="button"
                  onClick={retryGeolocation}
                  className="w-full rounded-lg bg-slate-900 px-4 py-2 text-white font-medium"
                >
                  Reintentar permisos
                </button>

                {isAndroid ? (
                  <button
                    type="button"
                    onClick={openInChrome}
                    className="w-full rounded-lg border border-slate-300 bg-white px-4 py-2 text-slate-800 font-medium"
                  >
                    Abrir en Chrome
                  </button>
                ) : null}
              </div>

              <div className="mt-3 rounded-lg bg-white/70 p-3 text-xs text-red-700 border border-red-100">
                <p className="font-medium">Cómo habilitarlo en Android:</p>
                <p className="mt-1">
                  Chrome → Configuración del sitio → Ubicación → Permitir
                </p>
              </div>
            </div>
          ) : acceptError ? (
            <div className="mt-2 text-sm text-red-600">{acceptError}</div>
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