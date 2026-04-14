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

  return { inviteToken, orgId };
}

function getTrackerTarget(search, fallbackOrgId = "") {
  const incoming = new URLSearchParams(search || "");
  const out = new URLSearchParams();

  [
    "org_id",
    "orgId",
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

async function ensureGeolocationPermissionByPrompt() {
  try {
    const state = await navigator.permissions.query({ name: "geolocation" });

    if (state.state === "granted") {
      return { ok: true };
    }

    if (state.state === "denied") {
      return {
        ok: false,
        message:
          "La ubicación está bloqueada. Debes habilitarla manualmente.",
      };
    }

    await new Promise((resolve, reject) => {
      navigator.geolocation.getCurrentPosition(resolve, reject);
    });

    return { ok: true };
  } catch (error) {
    return {
      ok: false,
      message: "No se pudo obtener la ubicación.",
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
  const authToken = inviteToken || window.runtimeInviteToken || null;

  const isAndroid = useMemo(
    () => /Android/i.test(navigator.userAgent || ""),
    []
  );

  const isInAppBrowser = useMemo(() => {
    const ua = (navigator.userAgent || "").toLowerCase();
    return (
      ua.includes("wv") ||
      ua.includes("gmail") ||
      ua.includes("gsa") ||
      ua.includes("fbav") ||
      ua.includes("instagram")
    );
  }, []);

  const targetPath = useMemo(
    () => getTrackerTarget(location.search, orgId),
    [location.search, orgId]
  );

  async function handleAccept(e) {
    e.preventDefault();

    if (!consent) {
      setAcceptError("Debes aceptar el consentimiento.");
      return;
    }

    if (!authToken) {
      setAcceptError("Invite token faltante.");
      return;
    }

    try {
      setSubmitting(true);
      setStatus("requesting_geo");

      const geo = await ensureGeolocationPermissionByPrompt();

      if (!geo.ok) {
        setStatus("geo_permission_required");
        setAcceptError(geo.message);
        return;
      }

      const res = await fetch("/api/accept-tracker-invite", {
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

      const data = await res.json();

      if (!res.ok || !data.ok) {
        throw new Error(data?.message || "Error aceptando invite");
      }

      if (data.tracker_runtime_token) {
        localStorage.setItem(
          "tracker_runtime_token",
          data.tracker_runtime_token
        );
      }

      navigate(data.redirectTo || targetPath, { replace: true });

    } catch (err) {
      setAcceptError(err.message);
    } finally {
      setSubmitting(false);
    }
  }

  function openApp() {
    // 🔥 clave: usar mismo URL HTTPS (App Links)
    window.location.href = window.location.href;
  }

  function openPlayStore() {
    window.location.href =
      "https://play.google.com/store/apps/details?id=com.fenice.geocercas";
  }

  return (
    <div className="min-h-screen flex items-center justify-center p-6 bg-slate-100">
      <div className="w-full max-w-md bg-white p-6 rounded-2xl shadow-xl">

        <h1 className="text-xl font-semibold">Permiso de ubicación</h1>

        <label className="mt-4 flex gap-2 text-sm">
          <input
            type="checkbox"
            checked={consent}
            onChange={(e) => setConsent(e.target.checked)}
          />
          Acepto el seguimiento de ubicación
        </label>

        <button
          onClick={handleAccept}
          disabled={submitting}
          className="w-full mt-4 bg-black text-white py-3 rounded-xl"
        >
          {submitting ? "Procesando..." : "Aceptar y continuar"}
        </button>

        {status === "geo_permission_required" && (
          <div className="mt-4 p-4 bg-red-50 border border-red-200 rounded-xl">

            <p className="text-red-700 font-medium">
              Necesitamos tu ubicación
            </p>

            <button
              onClick={handleAccept}
              className="w-full mt-2 bg-black text-white py-2 rounded-lg"
            >
              Reintentar permisos
            </button>

            {isAndroid && (
              <>
                <button
                  onClick={openApp}
                  className="w-full mt-2 border py-2 rounded-lg"
                >
                  Abrir app
                </button>

                <button
                  onClick={openPlayStore}
                  className="w-full mt-2 border py-2 rounded-lg"
                >
                  Instalar app
                </button>
              </>
            )}

            {isInAppBrowser && (
              <p className="text-xs mt-2 text-red-500">
                Estás dentro de Gmail/WhatsApp. Usa "Abrir app".
              </p>
            )}

          </div>
        )}
      </div>
    </div>
  );
}