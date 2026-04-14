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
    return { ok: true };
  }

  if (state === "denied") {
    return {
      ok: false,
      message:
        "La ubicación está bloqueada para este sitio. En Chrome: Ajustes del sitio → Ubicación → Permitir.",
    };
  }

  try {
    await requestCurrentPositionOnce();
    return { ok: true };
  } catch (error) {
    return {
      ok: false,
      message: getGeoErrorMessage(error),
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

  const authToken = inviteToken || window.runtimeInviteToken || window.token || null;

  const isAndroid = useMemo(
    () => /Android/i.test(String(navigator.userAgent || "")),
    []
  );

  const isInAppBrowser = useMemo(() => {
    const ua = String(navigator.userAgent || "").toLowerCase();

    return (
      ua.includes("wv") ||
      ua.includes("gmail") ||
      ua.includes("gsa") ||
      ua.includes("fbav") ||
      ua.includes("instagram") ||
      ua.includes("line")
    );
  }, []);

  const targetPath = useMemo(
    () => getTrackerTarget(location.search, orgId),
    [location.search, orgId]
  );

  async function retryGeolocation() {
    setAcceptError("");
    setStatus("retrying_geo");

    const geo = await ensureGeolocationPermissionByPrompt();

    if (!geo.ok) {
      setStatus("geo_permission_required");
      setAcceptError(geo.message);
      return;
    }

    setStatus("ready");
  }

  function openInChrome() {
    try {
      const url = window.location.href;

      const newWindow = window.open(url, "_blank");

      if (!newWindow && isAndroid) {
        window.location.href = url;
      }
    } catch (error) {
      console.error("openInChrome failed", error);
      window.location.href = window.location.href;
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

      if (!response.ok || !data?.ok) {
        throw new Error(data?.message || "accept_failed");
      }

      if (data.tracker_runtime_token) {
        localStorage.setItem("tracker_runtime_token", data.tracker_runtime_token);
      }

      navigate(data.redirectTo || targetPath, { replace: true });

    } catch (error) {
      console.error(error);
      setStatus("accept_failed");
      setAcceptError(error?.message || "accept_failed");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center p-6 bg-slate-100">
      <div className="w-full max-w-md bg-white p-6 rounded-2xl shadow-xl">

        <h1 className="text-xl font-semibold">Background location</h1>

        <label className="mt-4 flex gap-2 text-sm">
          <input
            type="checkbox"
            checked={consent}
            onChange={(e) => setConsent(e.target.checked)}
          />
          I accept tracking
        </label>

        <button
          onClick={handleAccept}
          disabled={submitting}
          className="w-full mt-4 bg-black text-white py-3 rounded-xl"
        >
          Aceptar y continuar
        </button>

        {status === "geo_permission_required" && (
          <div className="mt-4 p-4 bg-red-50 border border-red-200 rounded-xl">
            <p className="text-red-700 font-medium">
              Necesitamos tu ubicación para continuar
            </p>

            <button
              onClick={retryGeolocation}
              className="w-full mt-2 bg-black text-white py-2 rounded-lg"
            >
              Reintentar permisos
            </button>

            {isAndroid && (
              <button
                onClick={openInChrome}
                className="w-full mt-2 border py-2 rounded-lg"
              >
                Abrir en Chrome
              </button>
            )}

            {isInAppBrowser && (
              <p className="text-xs mt-2 text-red-500">
                Estás dentro de una app (Gmail/WhatsApp). Abre en Chrome.
              </p>
            )}
          </div>
        )}

      </div>
    </div>
  );
}