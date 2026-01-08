import React, { useState } from "react";
import { useAuth } from "../../context/AuthContext";
import { supabase } from "../../supabaseClient";
import { useTranslation } from "react-i18next";

export default function NoOrgSelected() {
  const { t } = useTranslation();
  const { user, orgs, setCurrentOrg } = useAuth();

  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const canSelect = Array.isArray(orgs) && orgs.length > 0;

  async function refreshHard() {
    // AuthContext actual no expone refreshContext, así que forzamos recarga:
    window.location.reload();
  }

  async function createOrg() {
    const trimmed = name.trim();
    if (!trimmed) {
      setError(t("common.orgNameRequired"));
      return;
    }

    setBusy(true);
    setError("");
    try {
      const { data, error } = await supabase
        .from("organizations")
        .insert([{ name: trimmed, owner_id: user.id }])
        .select("id, name")
        .single();

      if (error) throw error;

      // Selecciona de inmediato (UX)
      if (data?.id) setCurrentOrg({ id: data.id, name: data.name });

      // Recarga para que el resto de pantallas tomen el estado limpio
      await refreshHard();
    } catch (e) {
      setError(e?.message || "Error");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="min-h-[70vh] flex items-center justify-center p-4">
      <div className="w-full max-w-xl rounded-2xl shadow-sm border bg-white p-6">
        <h1 className="text-xl font-semibold">
          {t("common.noOrganizationTitle")}
        </h1>

        <p className="mt-2 text-sm opacity-80">
          {t("common.noOrganizationDescription")}
        </p>

        {canSelect && (
          <div className="mt-5">
            <div className="text-sm font-medium">{t("common.selectOrganization")}</div>
            <div className="mt-2 grid gap-2">
              {orgs.map((o) => (
                <button
                  key={o.id}
                  onClick={() => setCurrentOrg(o)}
                  className="w-full text-left rounded-xl border p-3 hover:bg-gray-50"
                >
                  <div className="text-sm font-semibold">{o.name}</div>
                  <div className="text-xs opacity-70">{o.id}</div>
                </button>
              ))}
            </div>
          </div>
        )}

        <div className="mt-6 rounded-xl border p-4">
          <div className="text-sm font-medium">{t("common.createOrganization")}</div>

          <div className="mt-3 flex flex-col sm:flex-row gap-2">
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder={t("common.orgNamePlaceholder")}
              className="w-full rounded-lg border px-3 py-2 text-sm"
              disabled={busy}
            />
            <button
              onClick={createOrg}
              disabled={busy}
              className="rounded-lg px-4 py-2 text-sm font-medium border bg-black text-white disabled:opacity-60"
            >
              {busy ? t("common.creating") : t("common.createOrganization")}
            </button>
          </div>

          <div className="mt-3">
            <button
              onClick={refreshHard}
              className="rounded-lg px-4 py-2 text-sm font-medium border"
              disabled={busy}
            >
              {t("common.refreshContext")}
            </button>
          </div>

          {error ? <div className="mt-3 text-sm text-red-600">{error}</div> : null}
        </div>
      </div>
    </div>
  );
}
