import React, { useState } from "react";
import { useAuth } from "../../context/AuthContext";
import { supabase } from "../../supabaseClient";
import { useTranslation } from "react-i18next";

export default function NoOrgSelected() {
  const { t } = useTranslation();
  const { user, refreshContext } = useAuth();

  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function createOrg() {
    if (!name.trim()) {
      setError(t("common.orgNameRequired"));
      return;
    }

    setBusy(true);
    setError("");

    try {
      const { error } = await supabase
        .from("organizations")
        .insert([{ name: name.trim(), owner_id: user.id }]);

      if (error) throw error;

      await refreshContext();
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="min-h-[70vh] flex items-center justify-center p-4">
      <div className="max-w-md w-full bg-white border rounded-xl p-6">
        <h1 className="text-xl font-semibold">
          {t("common.noOrganizationTitle")}
        </h1>

        <p className="mt-2 text-sm opacity-80">
          {t("common.noOrganizationDescription")}
        </p>

        <div className="mt-4">
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder={t("common.orgNamePlaceholder")}
            className="w-full border rounded-lg px-3 py-2 text-sm"
          />
        </div>

        <div className="mt-3 flex gap-2">
          <button
            onClick={createOrg}
            disabled={busy}
            className="px-4 py-2 rounded-lg bg-black text-white text-sm disabled:opacity-60"
          >
            {busy ? t("common.creating") : t("common.createOrganization")}
          </button>
        </div>

        {error && <div className="mt-3 text-sm text-red-600">{error}</div>}
      </div>
    </div>
  );
}
