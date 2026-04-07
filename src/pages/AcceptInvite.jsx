
import { useEffect, useState } from "react";
import { useNavigate, useParams, Navigate, useLocation } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { supabase } from "../supabaseClient";

export default function AcceptInvite() {
  const { token } = useParams();
  const navigate = useNavigate();
  const location = useLocation();
  const { t } = useTranslation();

  const [checked, setChecked] = useState(false);
  const [session, setSession] = useState(null);
  const [errorMsg, setErrorMsg] = useState("");

  const tt = (key, fallback, options = {}) =>
    t(key, { defaultValue: fallback, ...options });

  useEffect(() => {
    let mounted = true;

    supabase.auth.getSession().then(({ data }) => {
      if (!mounted) return;
      setSession(data.session);
      setChecked(true);
    });

    const { data: sub } = supabase.auth.onAuthStateChange((_e, s) => {
      setSession(s);
    });

    return () => sub?.subscription?.unsubscribe();
  }, []);

  if (!checked) return null;

  if (!session) {
    const next = encodeURIComponent(`/accept-invite/${token}`);
    return <Navigate to={`/login?next=${next}`} replace />;
  }

  const accept = async () => {
    setErrorMsg("");

    const { data, error } = await supabase.rpc("accept_invitation", {
      p_token: token,
    });

    if (error) {
      setErrorMsg(
        error.message ||
          tt(
            "acceptInvite.errors.acceptFailed",
            "Could not accept the invitation."
          )
      );
      return;
    }

    // Persist tracker session/org locally so tracker-gps can boot immediately
    // without re-resolving from email flow.
    try {
      const orgId = String(data?.org_id || "").trim();

      const { data: sessionData } = await supabase.auth.getSession();
      const currentSession = sessionData?.session || null;

      const accessToken = String(currentSession?.access_token || "").trim();
      const refreshToken = String(currentSession?.refresh_token || "").trim();

      const trackerAuthPayload = {
        access_token: accessToken,
        refresh_token: refreshToken,
        session: currentSession,
      };

      localStorage.setItem("geocercas-tracker-auth", JSON.stringify(trackerAuthPayload));
      if (orgId) {
        localStorage.setItem("org_id", orgId);
      }

      if (window.Android?.saveSession && accessToken) {
        window.Android.saveSession(accessToken, orgId);
      }
      if (window.Android?.startService) {
        window.Android.startService();
      }
    } catch (bridgeErr) {
      console.warn("[AcceptInvite] Android bridge call failed", bridgeErr);
    }

    const resolvedOrgId = String(data?.org_id || localStorage.getItem("org_id") || "").trim();
    const deepLinkParams = new URLSearchParams(location.search || "");
    if (resolvedOrgId) {
      deepLinkParams.set("org_id", resolvedOrgId);
    }

    const hasInviteContext =
      deepLinkParams.has("token") ||
      deepLinkParams.has("invite_token") ||
      deepLinkParams.has("invite_id");

    if (!hasInviteContext && token) {
      deepLinkParams.set("invite_token", token);
    }

    const targetQuery = deepLinkParams.toString();
    const target = targetQuery ? `/tracker-gps?${targetQuery}` : "/tracker-gps";

    const ua = typeof navigator !== "undefined" ? String(navigator.userAgent || "") : "";
    const isAndroidMobile = /Android/i.test(ua);
    if (isAndroidMobile) {
      // Use app link URL so Android can open the tracker app directly.
      const appLinkUrl = `https://preview.tugeocercas.com${target}`;
      window.location.replace(appLinkUrl);
      return;
    }

    navigate(target, { replace: true });
  };

  return (
    <div className="p-6">
      <h1 className="text-xl font-semibold mb-2">
        {tt("acceptInvite.title", "Accept invitation")}
      </h1>

      {errorMsg && (
        <div className="border border-red-300 bg-red-50 text-red-800 p-3 rounded mb-3">
          {errorMsg}
        </div>
      )}

      <button onClick={accept} className="bg-black text-white rounded px-4 py-2">
        {tt("acceptInvite.actions.accept", "Accept")}
      </button>
    </div>
  );
}
