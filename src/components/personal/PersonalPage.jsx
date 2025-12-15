// src/components/persona/PersonalPage.jsx
import { useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "../../supabaseClient";
import { useAuth } from "../../context/AuthContext.jsx";
import { useTranslation } from "react-i18next";

/**
 * PersonalPage (universal multi-tenant, RLS-friendly)
 *
 * Objetivo:
 * - Funcione para cualquier org/usuario (no puntual para pruebatugeo)
 * - Respete RLS por org_id (multi-tenant)
 * - Evite errores típicos:
 *    - 403 por RLS al pedir "returning *" luego de soft-delete (is_deleted pasa a true)
 *    - filtros por owner_id que rompen cuando el modelo es por org
 *
 * Suposiciones:
 * - La tabla public.personal tiene columnas: id, nombre, apellido, email, telefono,
 *   vigente, org_id, is_deleted, deleted_at, updated_at, created_at, owner_id (opcional).
 * - Tu RLS permite:
 *    - SELECT de personal dentro de la org actual (org_id)
 *    - INSERT/UPDATE dentro de la org actual (org_id)
 *    - UPDATE para soft-delete dentro de la org actual
 *
 * Nota:
 * - Para evitar el 403 al eliminar: NO pedimos .select() después del update de soft-delete.
 */

const emptyForm = () => ({
  id: null,
  nombre: "",
  apellido: "",
  email: "",
  telefono: "",
  vigente: true,
});

function asE164OrThrow(raw, t) {
  const tel = (raw || "").trim();
  if (!tel) return "";
  if (!tel.startsWith("+")) {
    throw new Error(t("personal.errorPhonePolicy"));
  }
  return tel;
}

export default function PersonalPage() {
  const {
    user,
    currentOrg,
    currentRole,
    loading: authLoading,
    isAdmin,
    isOwner,
    role: legacyRole,
  } = useAuth();

  const { t } = useTranslation();

  const effectiveRole = currentRole || legacyRole || "tracker";
  const canEdit =
    isAdmin || isOwner || effectiveRole === "owner" || effectiveRole === "admin";

  const orgId = currentOrg?.id || null;

  const [items, setItems] = useState([]);
  const [selectedId, setSelectedId] = useState(null);
  const [form, setForm] = useState(emptyForm());
  const [banner, setBanner] = useState({ type: "ok", msg: "" });
  const [loading, setLoading] = useState(false);
  const [q, setQ] = useState("");
  const [onlyActive, setOnlyActive] = useState(true);

  const filteredItems = useMemo(() => {
    const search = q.trim().toLowerCase();
    if (!search) return items;
    return (items || []).filter((r) => {
      const campos = [r.nombre, r.apellido, r.email, r.telefono]
        .map((x) => (x || "").toString())
        .join(" ")
        .toLowerCase();
      return campos.includes(search);
    });
  }, [items, q]);

  
  // Evitar "reapariciones" por respuestas viejas (race condition)
  const fetchSeqRef = useRef(0);
  const mountedRef = useRef(true);

  useEffect(() => {
    return () => {
      mountedRef.current = false;
    };
  }, []);

useEffect(() => {
    if (!authLoading && user) {
      loadPersonal();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authLoading, user, onlyActive, orgId, t]);

  async function loadPersonal() {
    const seq = ++fetchSeqRef.current;
    try {
      setLoading(true);

      const {
        data: { user: authUser },
        error: userError,
      } = await supabase.auth.getUser();

      if (userError) {
        console.error("[PersonalPage] Error auth.getUser:", userError);
        throw new Error(t("personal.errorMissingUser"));
      }
      if (!authUser) {
        throw new Error(t("personal.errorNoAuthUser"));
      }
      if (!orgId) {
        // Si no hay org seleccionada, no intentamos consultar.
        setItems([]);
        setBanner({ type: "err", msg: t("personal.errorNoOrgSelected") });
        return;
      }

      let query = supabase
        .from("personal")
        .select("*")
        .eq("org_id", orgId)
        .eq("is_deleted", false)
        .order("nombre", { ascending: true });

      if (onlyActive) query = query.eq("vigente", true);

      const { data, error } = await query;

      console.log("[PersonalPage] Resultado SELECT personal:", {
        authUserId: authUser.id,
        orgId,
        count: Array.isArray(data) ? data.length : null,
        error,
      });

      if (error) throw error;
      if (!mountedRef.current || seq !== fetchSeqRef.current) return;
      setItems(data || []);
      setBanner({ type: "ok", msg: t("personal.bannerRefreshedOk") });
    } catch (err) {
      console.error("[PersonalPage] Error cargando personal:", err);
      setItems([]);
      setBanner({
        type: "err",
        msg: err?.message || t("personal.errorLoad"),
      });
    } finally {
      if (mountedRef.current && seq === fetchSeqRef.current) setLoading(false);
    }
  }

  function onSelect(row) {
    setSelectedId(row.id);
    setForm({
      id: row.id,
      nombre: row.nombre || "",
      apellido: row.apellido || "",
      email: row.email || "",
      telefono: row.telefono || "",
      vigente: !!row.vigente,
    });
    setBanner({ type: "ok", msg: t("personal.bannerSelected") });
  }

  function onNuevo() {
    if (!canEdit) {
      setBanner({ type: "err", msg: t("personal.errorNoPermissionCreate") });
      return;
    }
    setSelectedId(null);
    setForm(emptyForm());
    setBanner({ type: "ok", msg: t("personal.bannerNewMode") });
  }

  function onEditar() {
    if (!canEdit) {
      setBanner({ type: "err", msg: t("personal.errorNoPermissionEdit") });
      return;
    }
    if (!selectedId) {
      setBanner({ type: "err", msg: t("personal.errorMustSelectForEdit") });
      return;
    }
    setBanner({ type: "ok", msg: t("personal.bannerEditMode") });
  }

  function onChange(e) {
    const { name, value, type, checked } = e.target;
    setForm((f) => ({
      ...f,
      [name]: type === "checkbox" ? checked : value,
    }));
  }

  async function onGuardar() {
    fetchSeqRef.current += 1;
    try {
      if (!canEdit) {
        setBanner({ type: "err", msg: t("personal.errorNoPermissionSave") });
        return;
      }
      if (!orgId) {
        setBanner({ type: "err", msg: t("personal.errorNoOrgSelected") });
        return;
      }

      setLoading(true);

      const {
        data: { user: authUser },
        error: userError,
      } = await supabase.auth.getUser();

      if (userError || !authUser) throw new Error(t("personal.errorMissingUser"));

      const nombre = (form.nombre || "").trim();
      const apellido = (form.apellido || "").trim();
      const email = (form.email || "").trim().toLowerCase();
      const telefono = asE164OrThrow(form.telefono, t);

      if (!nombre) throw new Error(t("personal.errorMissingName"));
      if (!email) throw new Error(t("personal.errorMissingEmail"));

      const payload = {
        nombre,
        apellido,
        email,
        telefono,
        vigente: !!form.vigente,
      };

      // CLAVE (RLS-friendly):
      // - NO pedimos returning (sin .select()) para evitar 403 por RLS en el response.
      // - NO enviamos columnas de control (owner_id, created_at, updated_at, is_deleted).
      let result;
      if (form.id) {
        result = await supabase
          .from("personal")
          .update(payload)
          .eq("id", form.id)
          .eq("org_id", orgId)
          .eq("is_deleted", false);
      } else {
        result = await supabase.from("personal").insert({
          ...payload,
          org_id: orgId,
        });
      }

      const { error } = result;

      console.log("[PersonalPage] Resultado guardar (no-returning):", { error });

      if (error) throw error;

      setBanner({
        type: "ok",
        msg: form.id ? t("personal.bannerUpdated") : t("personal.bannerCreated"),
      });

      setSelectedId(null);
      setForm(emptyForm());

      await loadPersonal();
    } catch (err) {
      console.error("[PersonalPage] Error onGuardar:", err);
      setBanner({ type: "err", msg: err?.message || t("personal.errorSave") });
    } finally {
      setLoading(false);
    }
  }

  async function onEliminar() {
    // Invalida cualquier carga en vuelo para evitar que "reaparezca" el registro
    fetchSeqRef.current += 1;
    try {
      if (!canEdit) {
        setBanner({ type: "err", msg: t("personal.errorNoPermissionDelete") });
        return;
      }
      if (!selectedId) {
        setBanner({ type: "err", msg: t("personal.errorMustSelectForDelete") });
        return;
      }
      if (!orgId) {
        setBanner({ type: "err", msg: t("personal.errorNoOrgSelected") });
        return;
      }

      const confirmed = window.confirm(t("personal.confirmDelete"));
      if (!confirmed) return;

      setLoading(true);

      const {
        data: { user: authUser },
        error: userError,
      } = await supabase.auth.getUser();

      if (userError || !authUser) throw new Error(t("personal.errorMissingUser"));

      const now = new Date().toISOString();

      // IMPORTANTE:
      // No hacemos .select() aquí para evitar 403 cuando el SELECT policy exige is_deleted=false.
      const { error } = await supabase
        .from("personal")
        .update({
          is_deleted: true,
          vigente: false,
          deleted_at: now,
          updated_at: now,
        })
        .eq("id", selectedId)
        .eq("is_deleted", false);

      console.log("[PersonalPage] Resultado delete (soft):", { selectedId, error });

      if (error) throw error;

      // UX: reflejar inmediatamente en UI (y luego sincronizar con loadPersonal)
      setItems((prev) => (prev || []).filter((r) => r.id !== selectedId));

      setBanner({ type: "ok", msg: t("personal.bannerDeletedOk") });
      setSelectedId(null);
      setForm(emptyForm());

      await loadPersonal();
    } catch (err) {
      console.error("[PersonalPage] Error onEliminar:", err);
      setBanner({ type: "err", msg: err?.message || t("personal.errorDelete") });
    } finally {
      setLoading(false);
    }
  }

  // ===================== Render =====================

  if (authLoading) {
    return (
      <div className="pg-screen">
        <style>{baseStyles}</style>
        <div className="pg-card">{t("personal.bannerLoadingSession")}</div>
      </div>
    );
  }

  if (!user) {
    return (
      <div className="pg-screen">
        <style>{baseStyles}</style>
        <div className="pg-card">{t("personal.bannerLoginRequired")}</div>
      </div>
    );
  }

  return (
    <div className="pg-screen">
      <style>{baseStyles}</style>

      {banner.msg && (
        <div className={`pg-banner ${banner.type === "ok" ? "pg-ok" : "pg-err"}`}>
          {banner.type === "ok" ? "✔ " : "✖ "}
          {banner.msg}
        </div>
      )}

      <div className="pg-card">
        <div className="pg-headerRow">
          <div>
            <h1 className="pg-title">{t("personal.title")}</h1>
            <p className="pg-muted">
              {t("personal.orgInfoLabel")}{" "}
              <strong>{currentOrg?.name || t("personal.orgFallback")}</strong> ·{" "}
              {t("personal.roleLabel")} <strong>{effectiveRole}</strong>
            </p>
          </div>
          {canEdit ? (
            <span className="pill ok">
              <i /> {t("personal.pillCanEdit")}
            </span>
          ) : (
            <span className="pill off">
              <i /> {t("personal.pillReadOnly")}
            </span>
          )}
        </div>

        {/* Controles */}
        <div className="pg-row wrap">
          <input
            className="pg-input w-300"
            placeholder={t("personal.searchPlaceholder")}
            value={q}
            onChange={(e) => setQ(e.target.value)}
          />

          <label className="pg-check">
            <input
              type="checkbox"
              checked={onlyActive}
              onChange={(e) => setOnlyActive(e.target.checked)}
            />
            <span>{t("personal.onlyActive")}</span>
          </label>

          <button className="pg-btn" onClick={loadPersonal}>
            {t("personal.buttonRefresh")}
          </button>

          <button
            className="pg-btn"
            onClick={() => {
              setQ("");
              setOnlyActive(false);
              loadPersonal();
            }}
          >
            {t("personal.buttonFullList")}
          </button>

          <div className="pg-spacer" />

          {/* Botones de acción */}
          <button className="pg-btn" onClick={onNuevo}>
            {t("personal.buttonNew")}
          </button>
          <button className="pg-btn" onClick={onEditar}>
            {t("personal.buttonEdit")}
          </button>
          <button className="pg-btn pg-btn-primary" onClick={onGuardar}>
            {t("personal.buttonSave")}
          </button>
          <button className="pg-btn pg-btn-danger" onClick={onEliminar}>
            {t("personal.buttonDelete")}
          </button>
        </div>

        {/* Formulario */}
        <div className="pg-grid">
          <input
            name="nombre"
            value={form.nombre}
            onChange={onChange}
            placeholder={t("personal.fieldName")}
            className="pg-input"
          />
          <input
            name="apellido"
            value={form.apellido}
            onChange={onChange}
            placeholder={t("personal.fieldLastName")}
            className="pg-input"
          />
          <input
            name="email"
            value={form.email}
            onChange={onChange}
            placeholder={t("personal.fieldEmail")}
            className="pg-input wide"
          />
          <input
            name="telefono"
            value={form.telefono}
            onChange={onChange}
            placeholder={t("personal.fieldPhonePlaceholder")}
            className="pg-input"
          />
          <label className="pg-check">
            <input
              type="checkbox"
              name="vigente"
              checked={form.vigente}
              onChange={onChange}
            />
            <span>{t("personal.fieldActive")}</span>
          </label>
        </div>
      </div>

      {/* Tabla */}
      <div className="pg-tableWrap">
        <table className="pg-table">
          <thead>
            <tr>
              <th>{t("personal.tableName")}</th>
              <th>{t("personal.tableLastName")}</th>
              <th className="w-xxl">{t("personal.tableEmail")}</th>
              <th className="w-lg">{t("personal.tablePhone")}</th>
              <th className="w-sm">{t("personal.tableActive")}</th>
            </tr>
          </thead>
          <tbody>
            {filteredItems.length === 0 && (
              <tr>
                <td colSpan={5} className="pg-empty">
                  {t("personal.tableNoResults")}
                </td>
              </tr>
            )}

            {filteredItems.map((r, i) => {
              const active = r.id === selectedId;
              return (
                <tr
                  key={r.id}
                  className={active ? "active" : i % 2 === 0 ? "even" : "odd"}
                  onClick={() => onSelect(r)}
                  title={t("personal.tableClickToSelect")}
                >
                  <td>{r.nombre}</td>
                  <td>{r.apellido}</td>
                  <td className="w-xxl">{r.email}</td>
                  <td className="w-lg">{r.telefono}</td>
                  <td className="w-sm">
                    {r.vigente ? (
                      <span className="pill ok">
                        <i /> {t("personal.yes")}
                      </span>
                    ) : (
                      <span className="pill off">
                        <i /> {t("personal.no")}
                      </span>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {loading && <div className="pg-muted mt-8">{t("personal.processing")}</div>}
    </div>
  );
}

/* ============ estilos mínimos ============ */
const baseStyles = `
:root{
  --bg:#0f172a;
  --card:#0b1225;
  --ink:#e5e7eb;
  --ink-weak:#bac1cf;
  --ink-strong:#111827;
  --white:#ffffff;
  --muted:#64748b;
  --ok:#059669;
  --ok-ink:#ecfdf5;
  --err:#e11d48;
  --accent:#2563eb;
  --danger:#dc2626;
  --ring:#cbd5e1;
}
*{box-sizing:border-box;}
.pg-screen{
  min-height:100vh; padding:20px;
  background:var(--bg); color:var(--ink);
  font-family:ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, "Helvetica Neue", Arial;
}
.pg-banner{
  max-width:1200px; margin:0 auto 12px; padding:10px 14px;
  border-radius:10px; font-weight:600; box-shadow:0 6px 20px rgba(0,0,0,0.25);
}
.pg-banner.pg-ok{ background:var(--ok); color:var(--ok-ink); }
.pg-banner.pg-err{ background:var(--err); color:#fff; }
.pg-card{
  max-width:1200px; margin:0 auto 16px; padding:14px;
  background:var(--card); border:1px solid #1f2a44; border-radius:14px;
  box-shadow:0 10px 30px rgba(0,0,0,0.35);
}
.pg-headerRow{ display:flex; justify-content:space-between; align-items:center; gap:12px; }
.pg-title{ margin:0 0 6px; font-size:22px; color:var(--ink); }
.pg-muted{ color:var(--ink-weak); font-size:14px; }
.pg-row{ display:flex; gap:10px; align-items:center; margin-top:8px; }
.pg-row.wrap{ flex-wrap:wrap; }
.pg-spacer{ flex:1; }
.pg-grid{
  margin-top:10px; display:grid; grid-template-columns:repeat(6, minmax(0,1fr)); gap:10px;
}
.pg-input{
  height:36px; padding:6px 10px; border-radius:8px;
  border:1px solid var(--ring); background:#0e1a34; color:var(--ink);
  outline:none; width:100%;
}
.pg-input:focus{ border-color:#22c55e; box-shadow:0 0 0 2px rgba(34,197,94,0.25); }
.pg-input.wide{ grid-column: span 2 / span 2; }
.w-300{ min-width:300px; }
.pg-check{ display:flex; align-items:center; gap:8px; color:var(--ink); }
.pg-btn{
  height:36px; padding:0 12px; border-radius:8px; border:1px solid #334155;
  background:#1f2937; color:#f8fafc; cursor:pointer; font-weight:600;
}
.pg-btn:hover{ background:#334155; }
.pg-btn:disabled{
  cursor:not-allowed; opacity:0.6; background:#111827; border-color:#1f2937;
}
.pg-btn-primary{ background:#059669; border-color:#047857; }
.pg-btn-primary:hover{ background:#10b981; }
.pg-btn-danger{ background:var(--danger); border-color:#b91c1c; }
.pg-btn-danger:hover{ background:#ef4444; }

.pg-tableWrap{
  max-width:1200px; margin:0 auto; border-radius:16px; overflow:auto;
  border:1px solid var(--ring); background:var(--white);
  box-shadow:0 18px 40px rgba(2,6,23,0.15);
}
.pg-table{ width:100%; border-collapse:separate; border-spacing:0; color:var(--ink-strong); font-size:15px; }
.pg-table thead th{
  position:sticky; top:0; z-index:5;
  background:#f1f5f9;
  padding:12px 14px; text-align:left; text-transform:uppercase; font-size:12.5px; letter-spacing:.06em;
  border-bottom:1px solid #e2e8f0;
}
.pg-table tbody td{ padding:12px 14px; border-bottom:1px solid #eef2f7; }
.pg-table tr.even td{ background:#ffffff; }
.pg-table tr.odd td{ background:#f8fafc; }
.pg-table tr.active td{ background:#dbeafe; }
.pg-table tr:hover td{ background:#e0f2fe; cursor:pointer; }
.pg-empty{ text-align:center; padding:18px !important; color:#64748b; }
.w-sm{ width:110px; }
.w-lg{ width:220px; }
.w-xxl{ min-width:320px; }
.mt-8{ margin-top:8px; }
.pill{
  display:inline-flex; align-items:center; gap:8px;
  padding:6px 10px; border-radius:999px; font-weight:700; font-size:12.5px;
  border:1px solid rgba(255,255,255,0.15);
}
.pill i{ width:10px; height:10px; border-radius:999px; display:inline-block; }
.pill.ok{ background:rgba(5,150,105,0.18); color:#d1fae5; border-color:rgba(5,150,105,0.35); }
.pill.ok i{ background:#10b981; }
.pill.off{ background:rgba(148,163,184,0.18); color:#e2e8f0; border-color:rgba(148,163,184,0.35); }
.pill.off i{ background:#94a3b8; }
`;