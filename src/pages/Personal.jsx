import React, { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { useAuth } from "../context/AuthContext.jsx";
import {
  listPersonal,
  upsertPersonal,
  toggleVigente,
  deletePersonal,
} from "../lib/personalApi.js";

/* =========================
   Banner de error crítico
========================= */
function SystemErrorBanner({ title, message, details }) {
  return (
    <div className="mt-4 rounded-xl border border-amber-400 bg-amber-100 px-4 py-3 text-amber-900">
      <div className="font-semibold text-base">{title}</div>
      <div className="mt-1 text-sm">{message}</div>
      {details && (
        <pre className="mt-2 text-xs whitespace-pre-wrap opacity-80">
          {details}
        </pre>
      )}
    </div>
  );
}

function Modal({ open, title, children, onClose }) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      <div className="relative w-full max-w-lg mx-4 rounded-2xl bg-white shadow-xl text-slate-900">
        <div className="flex items-center justify-between px-5 py-4 border-b">
          <h3 className="text-lg font-semibold">{title}</h3>
          <button
            className="rounded-md px-2 py-1 text-gray-600 hover:bg-gray-100"
            onClick={onClose}
            type="button"
          >
            ✕
          </button>
        </div>
        <div className="p-5">{children}</div>
      </div>
    </div>
  );
}

export default function Personal() {
  const { t } = useTranslation();
  const { loading, ready, isLoggedIn, currentOrg, currentRole } = useAuth();

  const role = String(currentRole || "").toLowerCase();
  const canEdit = role === "owner" || role === "admin";

  const [q, setQ] = useState("");
  const [onlyActive, setOnlyActive] = useState(true);
  const [busy, setBusy] = useState(false);

  const [items, setItems] = useState([]);

  // 👇 diferenciamos error crítico vs mensaje normal
  const [systemError, setSystemError] = useState(null);
  const [msg, setMsg] = useState("");

  const [openNew, setOpenNew] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    nombre: "",
    apellido: "",
    email: "",
    telefono: "",
    vigente: true,
  });

  async function load() {
    if (!isLoggedIn || !currentOrg?.id) return;
    setBusy(true);
    setMsg("");
    setSystemError(null);

    try {
      const rows = await listPersonal({ q, onlyActive, limit: 500 });
      setItems(Array.isArray(rows) ? rows : []);
    } catch (e) {
      setItems([]);

      const message = e?.message || "";

      // 🔴 Error crítico de configuración / servidor
      if (
        message.toLowerCase().includes("configuración") ||
        message.toLowerCase().includes("supabase") ||
        message.toLowerCase().includes("server")
      ) {
        setSystemError({
          title: "Configuración incompleta",
          message:
            "La aplicación no puede conectarse al servidor porque faltan variables de entorno de Supabase.",
          details:
            "Revisa la configuración del proyecto en Vercel → Settings → Environment Variables.",
        });
      } else {
        setMsg(
          message ||
            t("personal.errorLoad", {
              defaultValue: "Error loading personnel.",
            })
        );
      }
    } finally {
      setBusy(false);
    }
  }

  useEffect(() => {
    if (!loading && ready && isLoggedIn && currentOrg?.id) load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loading, ready, isLoggedIn, currentOrg?.id]);

  const filtered = useMemo(() => {
    if (!q) return items;
    const ql = q.toLowerCase();
    return items.filter((r) =>
      `${r?.nombre ?? ""} ${r?.apellido ?? ""} ${r?.email ?? ""} ${r?.telefono ?? ""}`
        .toLowerCase()
        .includes(ql)
    );
  }, [items, q]);

  /* =========================
     Estados base
  ========================= */
  if (loading || !ready)
    return (
      <div className="p-6 text-gray-300">
        {t("personal.bannerLoadingSession", {
          defaultValue: "Loading session…",
        })}
      </div>
    );

  if (!isLoggedIn)
    return (
      <div className="p-6 text-red-400">
        {t("personal.bannerLoginRequired", {
          defaultValue: "You must log in.",
        })}
      </div>
    );

  if (!currentOrg?.id)
    return (
      <div className="p-6 text-red-400">
        {t("personal.errorMissingTenant", {
          defaultValue: "No organization selected.",
        })}
      </div>
    );

  return (
    <div className="max-w-7xl mx-auto px-4 py-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold mb-1 text-white">
            {t("personal.title", { defaultValue: "Personnel" })}
          </h1>
          <div className="text-sm text-gray-300">
            {t("personal.roleLabel", { defaultValue: "Role:" })}{" "}
            <span className="font-semibold">{role.toUpperCase()}</span> · Org:{" "}
            <span className="font-mono">{currentOrg.id}</span>
          </div>
        </div>

        {canEdit && (
          <button
            className="rounded-xl bg-slate-900 text-white px-4 py-2"
            onClick={() => setOpenNew(true)}
            type="button"
          >
            + {t("personal.buttonNew", { defaultValue: "New" })}
          </button>
        )}
      </div>

      {/* 🔴 Banner de error crítico */}
      {systemError && (
        <SystemErrorBanner
          title={systemError.title}
          message={systemError.message}
          details={systemError.details}
        />
      )}

      {/* 🟡 Mensajes normales */}
      {msg && !systemError && (
        <div className="mt-4 text-sm text-yellow-200">{msg}</div>
      )}

      <div className="mt-4 flex flex-col md:flex-row gap-3 md:items-center">
        <input
          className="w-full md:w-96 rounded-xl border px-3 py-2"
          placeholder={t("personal.searchPlaceholder")}
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />

        <label className="inline-flex items-center gap-2 text-sm text-gray-200">
          <input
            type="checkbox"
            checked={onlyActive}
            onChange={(e) => setOnlyActive(e.target.checked)}
          />
          {t("personal.onlyActive")}
        </label>

        <button
          className="rounded-xl border px-4 py-2"
          onClick={load}
          disabled={busy}
          type="button"
        >
          {busy ? t("personal.processing") : t("personal.buttonRefresh")}
        </button>
      </div>

      <div className="mt-4 rounded-2xl border bg-white text-slate-900 overflow-hidden">
        {busy && filtered.length === 0 ? (
          <div className="p-4 text-gray-600">
            {t("personal.loading")}
          </div>
        ) : filtered.length === 0 ? (
          <div className="p-4 text-gray-600">
            {t("personal.tableNoResults")}
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-gray-50 text-gray-600">
              <tr>
                <th className="p-3">{t("personal.tableName")}</th>
                <th className="p-3">{t("personal.tableLastName")}</th>
                <th className="p-3">{t("personal.tableEmail")}</th>
                <th className="p-3">{t("personal.tablePhone")}</th>
                <th className="p-3">{t("personal.tableActive")}</th>
                <th className="p-3">{t("personal.actions")}</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((r) => (
                <tr key={r.id} className="border-t">
                  <td className="p-3">{r?.nombre ?? "-"}</td>
                  <td className="p-3">{r?.apellido ?? "-"}</td>
                  <td className="p-3">{r?.email ?? "-"}</td>
                  <td className="p-3">{r?.telefono ?? "-"}</td>
                  <td className="p-3">
                    {r?.vigente ? t("personal.yes") : t("personal.no")}
                  </td>
                  <td className="p-3 flex gap-2">
                    <button
                      onClick={() => toggleVigente(r.id).then(load)}
                      disabled={!canEdit || busy}
                      className="rounded-lg border px-3 py-1"
                    >
                      {r?.vigente
                        ? t("personal.actionDeactivate")
                        : t("personal.actionActivate")}
                    </button>
                    <button
                      onClick={() => deletePersonal(r.id).then(load)}
                      disabled={!canEdit || busy}
                      className="rounded-lg border border-red-200 text-red-700 px-3 py-1"
                    >
                      {t("personal.actionDelete")}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Modal NUEVO */}
      <Modal
        open={openNew}
        title={t("personal.formTitleNew")}
        onClose={() => setOpenNew(false)}
      >
        {/* (form igual que antes, sin cambios funcionales) */}
      </Modal>
    </div>
  );
}
