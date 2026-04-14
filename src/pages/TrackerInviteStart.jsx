import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";

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

  return { inviteToken, orgId };
}

function setStorageItem(key, value) {
  try {
    if (value == null || value === "") return;
    localStorage.setItem(key, value);
    sessionStorage.setItem(key, value);
  } catch {
    // no-op
  }
}

function clearLegacyTrackerTokens() {
  try {
    [
      "auth_token",
      "owner_token",
      "session_token",
      "tracker_token",
      "access_token",
      "geocercas-tracker-auth",
    ].forEach((key) => {
      localStorage.removeItem(key);
      sessionStorage.removeItem(key);
    });
  } catch {
    // no-op
  }
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
    return "La ubicación está bloqueada para este sitio. Debes habilitarla manualmente para continuar.";
  }

  if (code === 2) {
    return "No se pudo obtener la ubicación. Activa el GPS y vuelve a intentar.";
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
    };
  }
}

export default function TrackerInviteStart() {
  const navigate = useNavigate();

  const [acceptError, setAcceptError] = useState("");
  const [status, setStatus] = useState("ready");
  const [consent, setConsent] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const { inviteToken, orgId } = getInviteParams();

  const authToken =
    inviteToken ||
    (typeof window !== "undefined" ? window.runtimeInviteToken || null : null);

  const isAndroid = useMemo(
    () => /Android/i.test(String(navigator.userAgent || "")),
    [],
  );

  const isInAppBrowser = useMemo(() => {
    const ua = String(navigator.userAgent || "").toLowerCase();
    return (
      ua.includes("wv") ||
      ua.includes("gmail") ||
      ua.includes("gsa") ||
      ua.includes("fbav") ||
      ua.includes("instagram") ||
      ua.includes("line") ||
      ua.includes("whatsapp")
    );
  }, []);

  async function persistTrackerSessionFromResponse(data) {
    const runtimeToken = data?.tracker_runtime_token || null;
    const resolvedTrackerUserId = data?.tracker_user_id || null;
    const resolvedOrgId = data?.org_id || orgId || null;
    const inviteId = data?.invite_id || null;

    if (!runtimeToken || !resolvedTrackerUserId || !resolvedOrgId) {
      throw new Error("accept_response_missing_runtime_fields");
    }

    clearLegacyTrackerTokens();

    setStorageItem("tracker_runtime_token", runtimeToken);
    setStorageItem("tracker_access_token", runtimeToken);

    setStorageItem("tracker_user_id", resolvedTrackerUserId);
    setStorageItem("user_id", resolvedTrackerUserId);

    setStorageItem("tracker_org_id", resolvedOrgId);
    setStorageItem("org_id", resolvedOrgId);

    if (inviteId) {
      setStorageItem("tracker_invite_id", inviteId);
    }

    if (typeof window !== "undefined") {
      window.runtimeInviteToken = runtimeToken;
      window.trackerUserId = resolvedTrackerUserId;
      window.orgId = resolvedOrgId;
    }

    console.log("[TRACKER_RUNTIME_PERSISTED]", {
      hasRuntimeToken: !!runtimeToken,
      hasTrackerUserId: !!resolvedTrackerUserId,
      hasOrgId: !!resolvedOrgId,
      inviteId: inviteId || null,
    });
  }

  async function acceptInviteAndContinue() {
    if (!authToken) {
      setStatus("missing_invite_token");
      setAcceptError("Invite token faltante.");
      return;
    }

    try {
      setSubmitting(true);
      setAcceptError("");
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
        throw new Error(
          data?.message ||
            data?.code ||
            data?.error ||
            "accept_tracker_invite_failed",
        );
      }

      await persistTrackerSessionFromResponse(data);

      setStatus(data?.idempotent ? "already_accepted" : "accepted");

      navigate("/tracker-gps", { replace: true });
    } catch (error) {
      console.error("[tracker-invite] accept failed", error);
      setStatus("accept_failed");
      setAcceptError(error?.message || "accept_tracker_invite_failed");
    } finally {
      setSubmitting(false);
    }
  }

  async function startPermissionStep(e) {
    e?.preventDefault?.();
    e?.stopPropagation?.();

    if (!consent) {
      setStatus("consent_required");
      setAcceptError("Debes aceptar el consentimiento antes de continuar.");
      return;
    }

    if (!authToken) {
      setStatus("missing_invite_token");
      setAcceptError("Invite token faltante.");
      return;
    }

    try {
      setAcceptError("");
      setStatus("checking_geo_permission");

      const permissionState = await getPermissionState();

      if (permissionState === "granted") {
        await acceptInviteAndContinue();
        return;
      }

      if (permissionState === "denied") {
        setStatus("geo_permission_required");
        setAcceptError(
          "La ubicación está bloqueada para este sitio. Debes habilitarla manualmente para continuar.",
        );
        return;
      }

      setStatus("geo_permission_step");
    } catch (error) {
      console.error("[tracker-invite] permission step failed", error);
      setStatus("geo_permission_step");
    }
  }

  async function handleGrantLocation() {
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

      await acceptInviteAndContinue();
    } catch (error) {
      console.error("[tracker-invite] handleGrantLocation failed", error);
      setStatus("geo_permission_required");
      setAcceptError("No se pudo obtener la ubicación.");
    } finally {
      setSubmitting(false);
    }
  }

  async function retryGeolocation() {
    await handleGrantLocation();
  }

  function openApp() {
    window.location.href = window.location.href;
  }

  function openPlayStore() {
    window.location.href =
      "https://play.google.com/store/apps/details?id=com.fenice.geocercas";
  }

  const showPermissionCard =
    status === "geo_permission_step" ||
    status === "requesting_geo_permission";

  const showBlockedCard = status === "geo_permission_required";

  return (
    <div className="min-h-screen flex items-center justify-center p-6 bg-slate-100">
      <div className="w-full max-w-md bg-white p-6 rounded-2xl shadow-xl">
        <h1 className="text-2xl font-semibold tracking-tight text-slate-900">
          Permiso de ubicación
        </h1>

        <div className="mt-4 rounded-xl border border-slate-200 bg-slate-50 p-4 text-sm text-slate-700 leading-6">
          <p>
            Esta invitación necesita tu ubicación para iniciar el tracker y
            validar recorridos y geocercas.
          </p>
          <p className="mt-2">
            Primero aceptas el aviso. Después verás una pantalla para permitir
            la ubicación. Solo necesitas tocar <strong>Permitir</strong>.
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
                if (
                  status === "consent_required" ||
                  status === "accept_failed"
                ) {
                  setStatus("ready");
                }
              }
            }}
            className="mt-1"
          />
          <span>Acepto el seguimiento de ubicación</span>
        </label>

        {!showPermissionCard && !showBlockedCard && (
          <button
            type="button"
            onClick={startPermissionStep}
            disabled={submitting}
            className="w-full mt-5 rounded-xl bg-black text-white py-3 font-medium disabled:opacity-60"
          >
            {submitting && status === "accepting"
              ? "Procesando..."
              : "Aceptar y continuar"}
          </button>
        )}

        {showPermissionCard && (
          <div className="mt-4 rounded-xl border border-blue-200 bg-blue-50 p-4">
            <p className="text-blue-800 font-semibold">
              Permitir el uso de ubicación
            </p>

            <p className="mt-2 text-sm text-blue-700">
              En el siguiente paso aparecerá el permiso del sistema. Toca
              <strong> Permitir</strong> para continuar.
            </p>

            <button
              type="button"
              onClick={handleGrantLocation}
              disabled={submitting}
              className="w-full mt-3 rounded-lg bg-black text-white py-3 font-medium disabled:opacity-60"
            >
              {submitting && status === "requesting_geo_permission"
                ? "Solicitando permiso..."
                : "Permitir el uso de ubicación"}
            </button>

            <p className="mt-3 text-xs text-blue-700">
              Si el navegador muestra el permiso, solo confirma y el tracker
              continuará automáticamente.
            </p>
          </div>
        )}

        {showBlockedCard && (
          <div className="mt-4 rounded-xl border border-red-200 bg-red-50 p-4">
            <p className="text-red-700 font-semibold">
              Necesitamos tu ubicación para continuar
            </p>

            <p className="mt-2 text-sm text-red-600">
              La ubicación está bloqueada o el navegador no pudo mostrar el
              permiso. Debes habilitarla manualmente para seguir.
            </p>

            {acceptError ? (
              <p className="mt-2 text-sm text-red-600">{acceptError}</p>
            ) : null}

            <button
              type="button"
              onClick={retryGeolocation}
              className="w-full mt-3 rounded-lg bg-black text-white py-3 font-medium"
            >
              Reintentar permisos
            </button>

            {isAndroid ? (
              <>
                <button
                  type="button"
                  onClick={openApp}
                  className="w-full mt-2 rounded-lg border border-slate-300 bg-white py-3 font-medium text-slate-800"
                >
                  Abrir app
                </button>

                <button
                  type="button"
                  onClick={openPlayStore}
                  className="w-full mt-2 rounded-lg border border-slate-300 bg-white py-3 font-medium text-slate-800"
                >
                  Instalar app
                </button>
              </>
            ) : null}

            {isInAppBrowser ? (
              <p className="mt-3 text-xs text-red-500">
                Estás dentro de Gmail o WhatsApp. Usa <strong>Abrir app</strong>.
              </p>
            ) : null}

            <div className="mt-3 rounded-lg border border-red-100 bg-white/70 p-3 text-xs text-red-700">
              Chrome → Configuración del sitio → Ubicación → Permitir
            </div>
          </div>
        )}

        {!showPermissionCard && !showBlockedCard && acceptError ? (
          <div className="mt-3 text-sm text-red-600">{acceptError}</div>
        ) : null}

        <p className="mt-4 text-xs text-slate-500">Estado: {status}</p>
      </div>
    </div>
  );
}