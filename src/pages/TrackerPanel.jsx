import { useAuth } from "@/context/auth.js";
import { useTranslation } from "react-i18next";
import Button from "../components/ui/Button";

export default function TrackerPanel() {
  const { user, role, signOut } = useAuth();
  const { t } = useTranslation();

  return (
    <div className="min-h-screen bg-gray-50 p-6">
      <div className="max-w-3xl mx-auto flex flex-col gap-4">
        <header className="app-card p-4 flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
          <h2 className="text-base font-semibold">{t("tracker.panel.title")}</h2>
          <div className="text-sm text-gray-600">
            {user?.email} - <b>{role ? t("tracker.panel.statusActive") : t("tracker.panel.statusInactive")}</b>
          </div>
        </header>

        <main className="app-card p-4 flex flex-col gap-2">
          <p className="text-gray-700">{t("tracker.panel.statusActive")}</p>
          <p className="text-gray-700">{t("tracker.panel.statusInactive")}</p>
          <p className="text-gray-700">{t("tracker.panel.lastUpdateRecent")}</p>
        </main>

        <div className="app-card p-4 flex flex-col gap-2">
          <Button onClick={signOut} variant="danger">
            {t("common.actions.logout")}
          </Button>
        </div>
      </div>
    </div>
  );
}

