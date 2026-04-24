import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";

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

function getGeoErrorMessage(error, t) {
  const code = error?.code;
  const raw = String(error?.message || "").toLowerCase();

  if (code === 1 || raw.includes("permission")) {
    return t("tracker.invite.errors.blockedSite");
  }

  if (code === 2) {
    return t("tracker.invite.errors.locationUnavailable");
  }

  if (code === 3 || raw.includes("timeout")) {
    return t("tracker.invite.errors.locationTimeout");
  }

  return t("tracker.invite.errors.permissionFailed");
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

async function ensureGeolocationPermissionByPrompt(t) {
  const state = await getPermissionState();

  if (state === "granted") {
    return { ok: true, permissionState: "granted" };
  }

  if (state === "denied") {
    return {
      ok: false,
      permissionState: "denied",
      message: t("tracker.invite.errors.blockedChrome"),
    };
  }

  try {
    await requestCurrentPositionOnce();
    return { ok: true, permissionState: "prompt_or_unknown" };
  } catch (error) {
    return {
      ok: false,
      permissionState: state,
      message: getGeoErrorMessage(error, t),
    };
  }
}

export default function TrackerInviteStart() {
  const navigate = useNavigate();
  const { t } = useTranslation();

  const [acceptError, setAcceptError] = useState("");
  const [status, setStatus] = useState("ready");
  const [consent, setConsent] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const { inviteToken, orgId } = getInviteParams();

  useEffect(() => {
    if (inviteToken) {
      localStorage.setItem("inviteToken", inviteToken);
      sessionStorage.setItem("inviteToken", inviteToken);
      console.log("[tracker] inviteToken saved", inviteToken);
    } else {
      console.warn("[tracker] inviteToken missing in URL");
    }

    if (orgId) {
      localStorage.setItem("tracker_org_id", orgId);
      sessionStorage.setItem("tracker_org_id", orgId);
      console.log("[tracker] orgId saved", orgId);
    } else {
      console.warn("[tracker] orgId missing in URL");
    }
  }, [inviteToken, orgId]);

  const authToken = inviteToken || null;

  const resolvedOrgId =
    orgId ||
    localStorage.getItem("tracker_org_id") ||
    sessionStorage.getItem("tracker_org_id") ||
    (typeof window !== "undefined" ? window.orgId || null : null);

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
    const persistedOrgId =
      data?.org_id ||
      resolvedOrgId ||
      null;
    const inviteId = data?.invite_id || null;

    if (!runtimeToken || !resolvedTrackerUserId || !persistedOrgId) {
      throw new Error("accept_response_missing_runtime_fields");
    }

    clearLegacyTrackerTokens();

    setStorageItem("tracker_runtime_token", runtimeToken);
    setStorageItem("tracker_access_token", runtimeToken);

    setStorageItem("tracker_user_id", resolvedTrackerUserId);
    setStorageItem("user_id", resolvedTrackerUserId);

    setStorageItem("tracker_org_id", persistedOrgId);
    setStorageItem("org_id", persistedOrgId);

    if (inviteId) {
      setStorageItem("tracker_invite_id", inviteId);
    }

    if (typeof window !== "undefined") {
      window.runtimeInviteToken = runtimeToken;
      window.trackerUserId = resolvedTrackerUserId;
      window.orgId = persistedOrgId;
    }

    console.log("[tracker] final session snapshot", {
      tracker_runtime_token: localStorage.getItem("tracker_runtime_token"),
      tracker_user_id: localStorage.getItem("tracker_user_id"),
      tracker_org_id: localStorage.getItem("tracker_org_id"),
      inviteToken: localStorage.getItem("inviteToken"),
    });

    console.log("[TRACKER_RUNTIME_PERSISTED]", {
      hasRuntimeToken: !!runtimeToken,
      hasTrackerUserId: !!resolvedTrackerUserId,
      hasOrgId: !!persistedOrgId,
      inviteId: inviteId || null,
    });
  }

  async function acceptInviteAndContinue() {
    if (!authToken) {
      setStatus("missing_invite_token");
      setAcceptError(t("tracker.invite.errors.missingToken"));
      return;
    }

    try {
      setSubmitting(true);
      setAcceptError("");
      setStatus("accepting");

      // Limpiar storage para evitar contaminación futura
      localStorage.removeItem("inviteToken");
      sessionStorage.removeItem("inviteToken");

      console.log("inviteToken usado:", authToken);

      const response = await fetch("/api/accept-tracker-invite", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${authToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          inviteToken: authToken,
          org_id: resolvedOrgId || null,
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

      // Redirigir pasando los datos como query params (con encodeURIComponent)
      const runtimeToken = data?.tracker_runtime_token;
      const resolvedTrackerUserId = data?.tracker_user_id;
      const persistedOrgId = data?.org_id;
      const trackerGpsUrl =
        `/tracker-gps?tracker_runtime_token=${encodeURIComponent(runtimeToken)}` +
        `&tracker_user_id=${encodeURIComponent(resolvedTrackerUserId)}` +
        `&org_id=${encodeURIComponent(persistedOrgId)}`;
      navigate(trackerGpsUrl, { replace: true });
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
      setAcceptError(t("tracker.invite.errors.consentRequired"));
      return;
    }

    if (!authToken) {
      setStatus("missing_invite_token");
      setAcceptError(t("tracker.invite.errors.missingToken"));
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
        setAcceptError(t("tracker.invite.errors.blockedSite"));
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

      const geo = await ensureGeolocationPermissionByPrompt(t);

      if (!geo.ok) {
        setStatus("geo_permission_required");
        setAcceptError(geo.message);
        return;
      }

      await acceptInviteAndContinue();
    } catch (error) {
      console.error("[tracker-invite] handleGrantLocation failed", error);
      setStatus("geo_permission_required");
      setAcceptError(t("tracker.invite.errors.locationUnavailableShort"));
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
          {t("tracker.invite.title")}
        </h1>

        <div className="mt-4 rounded-xl border border-slate-200 bg-slate-50 p-4 text-sm text-slate-700 leading-6">
          <p>
            {t("tracker.invite.intro")}
          </p>
          <p className="mt-2">
            {t("tracker.invite.introStep.before")} <strong>{t("tracker.invite.introStep.allow")}</strong>{t("tracker.invite.introStep.after")}
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
          <span>{t("tracker.invite.consentLabel")}</span>
        </label>

        {!showPermissionCard && !showBlockedCard && (
          <button
            type="button"
            onClick={startPermissionStep}
            disabled={submitting}
            className="w-full mt-5 rounded-xl bg-black text-white py-3 font-medium disabled:opacity-60"
          >
            {submitting && status === "accepting"
              ? t("tracker.invite.processing")
              : t("tracker.invite.acceptContinue")}
          </button>
        )}

        {showPermissionCard && (
          <div className="mt-4 rounded-xl border border-blue-200 bg-blue-50 p-4">
            <p className="text-blue-800 font-semibold">
              {t("tracker.invite.permissionCardTitle")}
            </p>

            <p className="mt-2 text-sm text-blue-700">
              {t("tracker.invite.permissionCardBody.before")}
              <strong> {t("tracker.invite.introStep.allow")}</strong>
              {t("tracker.invite.permissionCardBody.after")}
            </p>

            <button
              type="button"
              onClick={handleGrantLocation}
              disabled={submitting}
              className="w-full mt-3 rounded-lg bg-black text-white py-3 font-medium disabled:opacity-60"
            >
              {submitting && status === "requesting_geo_permission"
                ? t("tracker.invite.requestingPermission")
                : t("tracker.invite.permissionAction")}
            </button>

            <p className="mt-3 text-xs text-blue-700">
              {t("tracker.invite.permissionAutoContinue")}
            </p>
          </div>
        )}

        {showBlockedCard && (
          <div className="mt-4 rounded-xl border border-red-200 bg-red-50 p-4">
            <p className="text-red-700 font-semibold">
              {t("tracker.invite.blockedTitle")}
            </p>

            <p className="mt-2 text-sm text-red-600">
              {t("tracker.invite.blockedBody")}
            </p>

            {acceptError ? (
              <p className="mt-2 text-sm text-red-600">{acceptError}</p>
            ) : null}

            <button
              type="button"
              onClick={retryGeolocation}
              className="w-full mt-3 rounded-lg bg-black text-white py-3 font-medium"
            >
              {t("common.actions.retry")}
            </button>

            {isAndroid ? (
              <>
                <button
                  type="button"
                  onClick={openApp}
                  className="w-full mt-2 rounded-lg border border-slate-300 bg-white py-3 font-medium text-slate-800"
                >
                  {t("common.actions.openApp")}
                </button>

                <button
                  type="button"
                  onClick={openPlayStore}
                  className="w-full mt-2 rounded-lg border border-slate-300 bg-white py-3 font-medium text-slate-800"
                >
                  {t("common.actions.installApp")}
                </button>
              </>
            ) : null}

            {isInAppBrowser ? (
              <p className="mt-3 text-xs text-red-500">
                {t("tracker.invite.inAppBrowserHint.before")} <strong>{t("common.actions.openApp")}</strong>.
              </p>
            ) : null}

            <div className="mt-3 rounded-lg border border-red-100 bg-white/70 p-3 text-xs text-red-700">
              {t("tracker.invite.chromePath")}
            </div>
          </div>
        )}

        {!showPermissionCard && !showBlockedCard && acceptError ? (
          <div className="mt-3 text-sm text-red-600">{acceptError}</div>
        ) : null}

        <p className="mt-4 text-xs text-slate-500">{t("tracker.invite.statusLabel")}: {status}</p>
      </div>
    </div>
  );
}