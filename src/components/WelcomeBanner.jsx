import { useCallback } from "react";
import { useTranslation } from "react-i18next";
import { useUserProfile } from "../hooks/useUserProfile";

export default function WelcomeBanner() {
  const { t } = useTranslation();
  const tr = useCallback((key, fallback, options = {}) => t(key, { defaultValue: fallback, ...options }), [t]);
  const { profile, loading, err, refresh } = useUserProfile();

  if (loading) return <p>{tr("welcomeBanner.states.loading", "Loading…")}</p>;

  if (err) {
    return (
      <div>
        {tr("welcomeBanner.errors.title", "Error")}: {err}{" "}
        <button onClick={refresh}>{tr("welcomeBanner.actions.retry", "Retry")}</button>
      </div>
    );
  }

  if (!profile) return <p>{tr("welcomeBanner.states.notAuthenticated", "Not authenticated")}</p>;

  const rol = profile.rol ?? tr("welcomeBanner.fallbacks.noRole", "no role");
  const noRoleValue = tr("welcomeBanner.fallbacks.noRole", "no role");

  return (
    <div>
      <h1>{tr("welcomeBanner.title", "Welcome")}</h1>
      <p>
        {profile.email} — {rol}
      </p>
      {rol === noRoleValue && (
        <p>
          {tr(
            "welcomeBanner.messages.noRoleAssigned",
            "Your account does not have an assigned role yet. Contact the administrator."
          )}
        </p>
      )}
      <button onClick={refresh} style={{ marginTop: 8 }}>
        {tr("welcomeBanner.actions.refresh", "Refresh")}
      </button>
    </div>
  );
}
