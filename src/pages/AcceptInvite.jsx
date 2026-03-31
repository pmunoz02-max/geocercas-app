
import { useEffect, useState } from "react";
import { useNavigate, useParams, Navigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { supabase } from "../supabaseClient";

export default function AcceptInvite() {
  const { token } = useParams();
  const navigate = useNavigate();
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

    navigate("/tracker-gps", { replace: true });
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
