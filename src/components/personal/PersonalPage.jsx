// src/components/personal/PersonalPage.jsx
import { useEffect, useState } from "react";
import { supabase } from "../../supabaseClient";
import { useAuth } from "../../context/AuthContext.jsx";
import { useTranslation } from "react-i18next";

/**
 * Versión simplificada de la página de Personal:
 * - Ignora personalApi.js
 * - Lee directamente de Supabase:
 *     SELECT * FROM personal
 *     WHERE owner_id = auth.uid() AND is_deleted = false
 * - Muestra tabla y permite ver/editar/crear/eliminar (soft delete).
 */

const emptyForm = () => ({
  id: null,
  nombre: "",
  apellido: "",
  email: "",
  telefono: "",
  vigente: true,
});

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

  const [items, setItems] = useState([]);
  const [selectedId, setSelectedId] = useState(null);
  const [form, setForm] = useState(emptyForm());
  const [banner, setBanner] = useState({
    type: "ok",
    msg: "",
  });
  const [loading, setLoading] = useState(false);
  const [q, setQ] = useState("");
  const [onlyActive, setOnlyActive] = useState(true);

  // ===================== Carga inicial =====================

  useEffect(() => {
    if (!authLoading && user) {
      loadPersonal();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authLoading, user, onlyActive, q, t]);

  async function loadPersonal() {
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

      let query = supabase
        .from("personal")
        .select("*")
        .eq("owner_id", authUser.id)
        .eq("is_deleted", false)
        .order("nombre", { ascending: true });

      if (onlyActive) {
        query = query.eq("vigente", true);
      }

      const { data, error } = await query;

      console.log("[PersonalPage] Resultado SELECT personal:", {
        authUserId: authUser.id,
        data,
        error,
      });

      if (error) {
        throw error;
      }

      let rows = data || [];

      const search = q.trim().toLowerCase();
      if (search) {
        rows = rows.filter((r) => {
          const campos = [
            r.nombre || "",
            r.apellido || "",
            r.email || "",
            r.telefono || "",
          ]
            .join(" ")
            .toLowerCase();
          return campos.includes(search);
        });
      }

      setItems(rows);
      setBanner({ type: "ok", msg: t("personal.bannerRefreshedOk") });
    } catch (err) {
      console.error("[PersonalPage] Error cargando personal:", err);
      setItems([]);
      setBanner({
        type: "err",
        msg: err.message || t("personal.errorLoad"),
      });
    } finally {
      setLoading(false);
    }
  }

  // ===================== Handlers básicos =====================

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
    setBanner({
      type: "ok",
      msg: t("personal.bannerSelected"),
    });
  }

  function onNuevo() {
    if (!canEdit) {
      setBanner({
        type: "err",
        msg: t("personal.errorNoPermissionCreate"),
      });
      return;
    }
    setSelectedId(null);
    setForm(emptyForm());
    setBanner({
      type: "ok",
      msg: t("personal.bannerNewMode"),
    });
  }

  function onEditar() {
    if (!canEdit) {
      setBanner({
        type: "err",
        msg: t("personal.errorNoPermissionEdit"),
      });
      return;
    }
    if (!selectedId) {
      setBanner({
        type: "err",
        msg: t("personal.errorMustSelectForEdit"),
      });
      return;
    }
    setBanner({
      type: "ok",
      msg: t("personal.bannerEditMode"),
    });
  }

  function onChange(e) {
    const { name, value, type, checked } = e.target;
    setForm((f) => ({
      ...f,
      [name]: type === "checkbox" ? checked : value,
    }));
  }

  async function onGuardar() {
    try {
      if (!canEdit) {
        setBanner({
          type: "err",
          msg: t("personal.errorNoPermissionSave"),
        });
        return;
      }

      setLoading(true);

      const {
        data: { user: authUser },
        error: userError,
      } = await supabase.auth.getUser();

      if (userError || !authUser) {
        throw new Error(t("personal.errorMissingUser"));
      }

      const nombre = form.nombre.trim();
      const apellido = form.apellido.trim();
      const email = form.email.trim().toLowerCase();
      const telefono = form.telefono.trim();

      if (!nombre) throw new Error(t("personal.errorMissingName"));
      if (!email) throw new Error(t("personal.errorMissingEmail"));

      if (telefono && !telefono.startsWith("+")) {
        throw new Error(t("personal.errorPhonePolicy"));
      }

      const payload = {
        nombre,
        apellido,
        email,
        telefono,
        vigente: !!form.vigente,
      };

      let query;
      if (form.id) {
        query = supabase
          .from("personal")
          .update({
            ...payload,
            updated_at: new Date().toISOString(),
          })
          .eq("id", form.id)
          .eq("owner_id", authUser.id)
          .eq("is_deleted", false)
          .select("*")
          .maybeSingle();
      } else {
        const now = new Date().toISOString();
        query = supabase
          .from("personal")
          .insert({
            ...payload,
            owner_id: authUser.id,
            org_id: currentOrg?.id || null,
            created_at: now,
            updated_at: now,
          })
          .select("*")
          .maybeSingle();
      }

      const { data, error } = await query;

      console.log("[PersonalPage] Resultado upsert:", { data, error });

      if (error) throw error;
      if (!data) throw new Error(t("personal.errorSaveNoRecord"));

      setBanner({
        type: "ok",
        msg: form.id
          ? t("personal.bannerUpdated")
          : t("personal.bannerCreated"),
      });
      setSelectedId(data.id);
      setForm({
        id: data.id,
        nombre: data.nombre || "",
        apellido: data.apellido || "",
        email: data.email || "",
        telefono: data.telefono || "",
        vigente: !!data.vigente,
      });

      await loadPersonal();
    } catch (err) {
      console.error("[PersonalPage] Error onGuardar:", err);
      setBanner({
        type: "err",
        msg: err.message || t("personal.errorSave"),
      });
    } finally {
      setLoading(false);
    }
  }

  async function onEliminar() {
    try {
      if (!canEdit) {
        setBanner({
          type: "err",
          msg: t("personal.errorNoPermissionDelete"),
        });
        return;
      }
      if (!selectedId) {
        setBanner({
          type: "err",
          msg: t("personal.errorMustSelectForDelete"),
        });
        return;
      }

      const confirmed = window.confirm(t("personal.confirmDelete"));
      if (!confirmed) return;

      setLoading(true);

      const {
        data: { user: authUser },
        error: userError,
      } = await supabase.auth.getUser();

      if (userError || !authUser) {
        throw new Error(t("personal.errorMissingUser"));
      }

      const now = new Date().toISOString();

      const { data, error } = await supabase
        .from("personal")
        .update({
          is_deleted: true,
          vigente: false,
          deleted_at: now,
          updated_at: now,
        })
        .eq("id", selectedId)
        .eq("owner_id", authUser.id)
        .eq("is_deleted", false)
        .select("*")
        .maybeSingle();

      console.log("[PersonalPage] Resultado delete (soft):", { data, error });

      if (error) throw error;

      setBanner({
        type: "ok",
        msg: t("personal.bannerDeletedOk"),
      });
      setSelectedId(null);
      setForm(emptyForm());

      await loadPersonal();
    } catch (err) {
      console.error("[PersonalPage] Error onEliminar:", err);
      setBanner({
        type: "err",
        msg: err.message || t("personal.errorDelete"),
      });
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
        <div
          className={`pg-banner ${
            banner.type === "ok" ? "pg-ok" : "pg-err"
          }`}
        >
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
              <strong>
                {currentOrg?.name || t("personal.orgFallback")}
              </strong>{" "}
              · {t("personal.roleLabel")}{" "}
              <strong>{effectiveRole}</strong>
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
              onChange={(e) => {
                setOnlyActive(e.target.checked);
              }}
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
            {items.length === 0 && (
              <tr>
                <td colSpan={5} className="pg-empty">
                  {t("personal.tableNoResults")}
                </td>
              </tr>
            )}
            {items.map((r, i) => {
              const active = r.id === selectedId;
              return (
                <tr
                  key={r.id}
                  className={active ? "active" : i % 2 === 0 ? "even" : "odd"}
                  onClick={() => onSelect(r)}
                >
                  <td className="strong">{r.nombre || "—"}</td>
                  <td>{r.apellido || "—"}</td>
                  <td>
                    <span title={r.email || ""} className="truncate">
                      {r.email || "—"}
                    </span>
                  </td>
                  <td className="mono">{r.telefono || "—"}</td>
                  <td>
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

/* ============ estilos mínimos (los mismos que venías usando, con btn rojo) ============ */
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
  border-radius:10px; font-weight:600; box-shadow:0 6px 20px rgba(0,0,0,.25);
}
.pg-banner.pg-ok{ background:var(--ok); color:var(--ok-ink); }
.pg-banner.pg-err{ background:var(--err); color:#fff; }
.pg-card{
  max-width:1200px; margin:0 auto 16px; padding:14px;
  background:var(--card); border:1px solid #1f2a44; border-radius:14px;
  box-shadow:0 10px 30px rgba(0,0,0,.35);
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
.pg-input:focus{ border-color:#22c55e; box-shadow:0 0 0 2px rgba(34,197,94,.25); }
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
.pg-btn-accent{ background:var(--accent); border-color:#1d4ed8; }
.pg-btn-accent:hover{ background:#3b82f6; }
.pg-btn-danger{ background:var(--danger); border-color:#b91c1c; }
.pg-btn-danger:hover{ background:#ef4444; }

.pg-tableWrap{
  max-width:1200px; margin:0 auto; border-radius:16px; overflow:auto;
  border:1px solid var(--ring); background:var(--white);
  box-shadow:0 18px 40px rgba(2,6,23,.5);
}
.pg-table{ width:100%; border-collapse:separate; border-spacing:0; color:var(--ink-strong); font-size:15px; }
.pg-table thead th{
  position:sticky; top:0; z-index:5;
  background:#f1f5f9;
  padding:12px 14px; text-align:left; text-transform:uppercase; font-size:12.5px; letter-spacing:.06em;
  border-bottom:1px solid #e2e8f0;
}
.pg-table tbody td{ padding:12px 14px; border-bottom:1px solid #eef2f7; }
.pg-table tbody tr.even{ background:#ffffff; }
.pg-table tbody tr.odd{ background:#f8fafc; }
.pg-table tbody tr:hover{ background:#eef6ff; }
.pg-table tbody tr.active{ background:#e8fff3; outline:2px solid #86efac; }

.pg-table .strong{ font-weight:600; }
.pg-table .mono{ font-family:ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace; }
.pg-table .truncate{ display:inline-block; max-width:44ch; overflow:hidden; text-overflow:ellipsis; vertical-align:bottom; }
.pg-table .w-xxl{ width:40rem; }
.pg-table .w-lg{ width:18rem; }
.pg-table .w-sm{ width:8rem; }
.pg-empty{ text-align:center; color:#64748b; padding:28px 0; }

.pill{ display:inline-flex; align-items:center; gap:6px; font-weight:700; font-size:12px;
  padding:4px 10px; border-radius:999px; border:1px solid #c7e2d6; }
.pill i{ display:inline-block; width:8px; height:8px; border-radius:50%; background:#666; }
.pill.ok{ color:#065f46; background:#dcfce7; border-color:#86efac; }
.pill.ok i{ background:#10b981; }
.pill.off{ color:#475569; background:#e2e8f0; border-color:#cbd5e1; }
.pill.off i{ background:#64748b; }
`;
