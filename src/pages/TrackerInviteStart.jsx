  const [androidBridgeAvailable, setAndroidBridgeAvailable] = useState(() => typeof window !== "undefined" && !!window.Android);

  useEffect(() => {
    if (typeof window !== "undefined") {
      setAndroidBridgeAvailable(!!window.Android);
    }
  }, []);
import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";

const INVITE_TOKEN_KEYS = [
  "token",
  "invite_token",
  "inviteToken",
  "t",
  "access_token",
];

const ORG_ID_KEYS = ["org_id", "organization_id", "orgId"];

function readParamFromSearchAndHash(keys) {
  if (typeof window === "undefined") return "";

  const sources = [
    window.location.search || "",
    window.location.hash?.includes("?")
      ? window.location.hash.slice(window.location.hash.indexOf("?"))
      : "",
    window.location.hash?.startsWith("#")
      ? `?${window.location.hash.slice(1)}`
      : "",
  ];

  for (const source of sources) {
    if (!source) continue;

    try {
      const params = new URLSearchParams(source.startsWith("?") ? source : `?${source}`);
      for (const key of keys) {
        const value = params.get(key);
        if (value && value.trim()) return value.trim();
      }
    } catch {
      // keep checking other sources
    }
  }

  return "";
}

function getInviteParams() {
  return {
    inviteToken: readParamFromSearchAndHash(INVITE_TOKEN_KEYS),
    orgId: readParamFromSearchAndHash(ORG_ID_KEYS),
  };
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

function getStorageItem(key) {
  try {
    return localStorage.getItem(key) || sessionStorage.getItem(key) || "";
  } catch {
    return "";
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

  const initialInviteParams = useMemo(() => getInviteParams(), []);

  const [acceptError, setAcceptError] = useState("");
  const [status, setStatus] = useState("ready");
  const [consent, setConsent] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [inviteToken, setInviteToken] = useState(initialInviteParams.inviteToken || "");
  const [orgId, setOrgId] = useState(initialInviteParams.orgId || "");

  useEffect(() => {
    const latest = getInviteParams();

    if (latest.inviteToken && latest.inviteToken !== inviteToken) {
      setInviteToken(latest.inviteToken);
    }

    if (latest.orgId && latest.orgId !== orgId) {
      setOrgId(latest.orgId);
    }

    console.log("INVITE_TOKEN", latest.inviteToken || inviteToken || null);
    console.log("INVITE_ORG_ID", latest.orgId || orgId || null);
  }, [inviteToken, orgId]);

  useEffect(() => {
    if (!inviteToken) {
      setStatus("missing_invite_token");
      setAcceptError(t("tracker.invite.errors.missingToken"));
      return;
    }

    setStorageItem("inviteToken", inviteToken);
    console.log("[tracker] inviteToken saved", inviteToken);

    if (orgId) {
      setStorageItem("tracker_org_id", orgId);
      console.log("[tracker] orgId saved", orgId);
    }
  }, [inviteToken, orgId, t]);

  const authToken = inviteToken || null;

  const resolvedOrgId =
    orgId ||
    getStorageItem("tracker_org_id") ||
    getStorageItem("org_id") ||
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
    const persistedOrgId = data?.org_id || resolvedOrgId || null;
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

      console.log("[tracker-invite] accepting invite", {
        hasInviteToken: !!authToken,
        hasOrgId: !!resolvedOrgId,
      });

      const response = await fetch("/api/accept-tracker-invite", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${authToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          inviteToken: authToken,
          token: authToken,
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

      const runtimeToken = data?.tracker_runtime_token;
      const resolvedTrackerUserId = data?.tracker_user_id;
      const persistedOrgId = data?.org_id || resolvedOrgId;

      if (window.Android?.startTracking) {
        console.log("[TrackerInviteStart] Android bridge disponible, llamando startTracking", {
          runtimeToken,
          trackerUserId: resolvedTrackerUserId,
          orgId: persistedOrgId,
        });
        window.Android.startTracking(runtimeToken, resolvedTrackerUserId, persistedOrgId);
        console.log("[TrackerInviteStart] Android bridge: startTracking llamado");
      } else {
        console.warn("[TrackerInviteStart] Android bridge no disponible, fallback web");
        const url = `/tracker-gps?inviteToken=${encodeURIComponent(runtimeToken)}&org_id=${encodeURIComponent(persistedOrgId)}`;
        window.location.href = url;
      }
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


  const handleOpenApp = () => {
    const params = new URLSearchParams(window.location.search);
    const inviteToken = params.get("inviteToken");
    const orgId = params.get("org_id");

    let url = "/tracker-gps";

    if (inviteToken && orgId) {
      url += `?inviteToken=${inviteToken}&org_id=${orgId}`;
    }

    window.location.href = url;
  };


  const handleInstall = () => {
    window.location.href = "/tracker-gps";
  };

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
          <p>{t("tracker.invite.intro")}</p>
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
          androidBridgeAvailable ? (
            <button
              type="button"
              onClick={startPermissionStep}
              disabled={submitting || !authToken}
              className="w-full mt-5 rounded-xl bg-black text-white py-3 font-medium disabled:opacity-60"
            >
              {submitting && status === "accepting"
                ? t("tracker.invite.processing")
                : t("tracker.invite.acceptContinue")}
            </button>
          ) : (
            <button
              type="button"
              onClick={() => {
                const token = inviteToken || authToken;
                const org = orgId || resolvedOrgId;
                window.location.href = `geocercas://tracker?token=${encodeURIComponent(token)}&org_id=${encodeURIComponent(org)}`;
              }}
              className="w-full mt-5 rounded-xl bg-blue-600 text-white py-3 font-medium"
            >
              {t("tracker.invite.openAppButton")}
            </button>
          )
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
                  onClick={handleOpenApp}
                  className="w-full mt-2 rounded-lg border border-slate-300 bg-white py-3 font-medium text-slate-800"
                >
                  {t("common.actions.openApp")}
                </button>

                <button
                  type="button"
                  onClick={handleInstall}
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

        <p className="mt-4 text-xs text-slate-500">
          {t("tracker.invite.statusLabel")}: {status}
        </p>
      </div>
    </div>
  );
}
