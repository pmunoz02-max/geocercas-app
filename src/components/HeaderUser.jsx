// src/components/HeaderUser.jsx
import { useTranslation } from "react-i18next";
import { useAuth } from "@/context/auth.js";
import { useUserProfile } from "../hooks/useUserProfile";

export default function HeaderUser() {
  const { t } = useTranslation();
  const { signOut } = useAuth();
  const { profile, loading, err, refresh } = useUserProfile();

  return (
    <header className="w-full border-b bg-white/60 backdrop-blur sticky top-0 z-40">
      <div className="mx-auto max-w-6xl px-4 py-2 flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <div className="w-2.5 h-2.5 rounded-full bg-emerald-500" />
          <span className="font-semibold">{t("app.brand")}</span>
        </div>

        <div className="flex items-center gap-3">
          {loading ? (
            <span className="text-sm text-gray-500">{t("common.actions.loading")}</span>
          ) : err ? (
            <span className="text-sm text-red-600">
              {t("auth.errorTitle", { defaultValue: "Error" })}: {err}
            </span>
          ) : profile ? (
            <>
              <div className="flex flex-col leading-tight">
                <span className="text-sm">{profile.email ?? t("common.fallbacks.noEmail")}</span>
                <div className="flex items-center gap-2">
                  <span className="inline-flex items-center text-xs px-2 py-0.5 rounded-full border">
                    {t("home.labels.role", { defaultValue: "Rol:" })}{" "}
                    {profile.rol ?? t("common.roles.noRole")}
                  </span>
                  {profile.org_id && (
                    <span className="inline-flex items-center text-[11px] px-2 py-0.5 rounded-full bg-gray-50 border">
                      {t("app.header.organizationLabel", { defaultValue: "Org" })}:{" "}
                      {String(profile.org_id).slice(0, 8)}â€¦
                    </span>
                  )}
                </div>
              </div>

              <button
                onClick={refresh}
                title={t("common.refreshContext", { defaultValue: "Refrescar" })}
                className="text-sm border rounded px-3 py-1 hover:bg-gray-50"
              >
                {t("common.refreshContext", { defaultValue: "Refrescar" })}
              </button>

              <button
                onClick={signOut}
                className="text-sm border rounded px-3 py-1 hover:bg-gray-50"
              >
                {t("app.header.logout")}
              </button>
            </>
          ) : (
            <span className="text-sm text-gray-500">{t("common.fallbacks.noAuth")}</span>
          )}
        </div>
      </div>
    </header>
  );
}

