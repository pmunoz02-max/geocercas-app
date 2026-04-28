import { useEffect } from "react";
import { useSearchParams, useNavigate } from "react-router-dom";

export default function TrackerOpen() {
  const [params] = useSearchParams();
  const navigate = useNavigate();

  useEffect(() => {
    const token = params.get("token");
    const orgId = params.get("org_id");
    const userId = params.get("userId");

    if (!token) {
      console.warn("missing token");
      return;
    }

    localStorage.setItem("tracker_token", token);
    localStorage.setItem("tracker_org_id", orgId || "");
    localStorage.setItem("tracker_user_id", userId || "");

    const query = window.location.search || "";

    if (!window.Android?.startTracking) {
      navigate(`/tracker-install${query}`, { replace: true });
      return;
    }

    navigate("/tracker-gps", { replace: true });
  }, []);

  return <div>Abriendo app...</div>;
}
