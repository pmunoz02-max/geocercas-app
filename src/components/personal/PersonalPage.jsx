// src/components/persona/PersonalPage.jsx
import { useEffect, useMemo, useState } from "react";
import { supabase } from "../../supabaseClient";
import { useAuth } from "../../context/AuthContext.jsx";
import { useTranslation } from "react-i18next";

const emptyForm = () => ({
  org_people_id: null,
  person_id: null,
  nombre: "",
  apellido: "",
  email: "",
  telefono: "",
  vigente: true,
});

function asE164OrThrow(raw, t) {
  const tel = (raw || "").trim();
  if (!tel) return "";
  if (!tel.startsWith("+")) throw new Error(t("personal.errorPhonePolicy"));
  return tel;
}

function normEmail(v) {
  const s = (v || "").trim().toLowerCase();
  return s || null;
}
function normPhone(v) {
  const s = (v || "").trim();
  return s || null;
}

function dedupePersonalRows(rows) {
  const arr = Array.isArray(rows) ? rows : [];
  const score = (r) =>
    new Date(
      r?.op_updated_at ||
        r?.op_created_at ||
        r?.p_updated_at ||
        r?.p_created_at ||
        0
    ).getTime() || 0;

  const map = new Map();
  for (const r of arr) {
    const e = normEmail(r?.email);
    const p = normPhone(r?.telefono);
    const key = e ? `e:${e}` : p ? `p:${p}` : `pid:${r?.person_id}`;

    const prev = map.get(key);
    if (!prev) {
      map.set(key, r);
      continue;
    }
    const prevScore = score(prev);
    const curScore = score(r);
    if (curScore > prevScore) map.set(key, r);
    else if (curScore === prevScore && String(r?.person_id) > String(prev?.person_id)) {
      map.set(key, r);
    }
  }
  return Array.from(map.values());
}

function isUniqueViolation(err) {
  return err?.code === "23505" || /duplicate key|unique/i.test(err?.message || "");
}

/**
 * Detecta cuando el error de unique corresponde al límite de 1 tracker por organización.
 * Esto depende del nombre real del constraint/índice en tu BD, por eso usamos varias heurísticas.
 */
function isTrackerLimitViolation(err) {
  if (!isUniqueViolation(err)) return false;
  const msg = (err?.message || "").toLowerCase();
  const details = (err?.details || "").toLowerCase();
  // Si tu índice se llama parecido a esto, lo capturamos
  if (msg.includes("one_active") || msg.includes("tracker_limit") || msg.includes("max_trackers")) return true;
  if (msg.includes("org_people") && msg.includes("org_id") && msg.includes("unique")) return true;
  // Heurística: duplicates por org_id solamente (sin mencionar person_id) suele ser el limit por org
  if (details.includes("(org_id)") && details.includes("already exists") && !details.includes("(person_id)")) return true;
  return false;
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
  const [selectedOrgPeopleId, setSelectedOrgPeopleId] = useState(null);
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

  useEffect(() => {
    if (!authLoading && user) loadPersonal();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authLoading, user, onlyActive, orgId]);

  function mapRows(data) {
    const arr = Array.isArray(data) ? data : [];
    return arr.map((op) => {
      const p = op?.people || null;
      return {
        // org_people
        org_people_id: op?.id ?? null,
        org_id: op?.org_id ?? null,
        person_id: op?.person_id ?? null,
        vigente: !!op?.vigente,
        is_deleted: !!op?.is_deleted,
        deleted_at: op?.deleted_at ?? null,
        op_created_at: op?.created_at ?? null,
        op_updated_at: op?.updated_at ?? null,

        // people
        people_id: p?.id ?? op?.person_id ?? null,
        nombre: p?.nombre ?? "",
        apellido: p?.apellido ?? "",
        email: p?.email ?? "",
        telefono: p?.telefono ?? "",
        p_created_at: p?.created_at ?? null,
        p_updated_at: p?.updated_at ?? null,
      };
    });
  }

  async function loadPersonal() {
    try {
      setLoading(true);

      const {
        data: { user: authUser },
        error: userError,
      } = await supabase.auth.getUser();

      if (userError) throw new Error(t("personal.errorMissingUser"));
      if (!authUser) throw new Error(t("personal.errorNoAuthUser"));

      if (!orgId) {
        setItems([]);
        setBanner({ type: "err", msg: t("personal.errorNoOrgSelected") });
        return;
      }

      let query = supabase
        .from("org_people")
        .select(
          `
          id,
          org_id,
          person_id,
          vigente,
          is_deleted,
          deleted_at,
          created_at,
          updated_at,
          people:people (
            id,
            nombre,
            apellido,
            email,
            telefono,
            created_at,
            updated_at
          )
        `,
          { count: "exact" }
        )
        .eq("org_id", orgId)
        .eq("is_deleted", false)
        .order("created_at", { ascending: false });

      if (onlyActive) query = query.eq("vigente", true);

      const { data, error, count } = await query;

      console.log("[PersonalPage] Resultado SELECT personal:", {
        orgId,
        onlyActive,
        count,
        error,
        sample:
          Array.isArray(data) && data[0]
            ? { op_id: data[0].id, person_id: data[0].person_id }
            : null,
      });

      if (error) throw error;

      const mapped = mapRows(data);
      const clean = mapped.filter((r) => !r?.is_deleted);
      const deduped = dedupePersonalRows(clean);

      deduped.sort((a, b) => {
        const A = `${a?.nombre || ""} ${a?.apellido || ""} ${a?.email || ""}`.toLowerCase();
        const B = `${b?.nombre || ""} ${b?.apellido || ""} ${b?.email || ""}`.toLowerCase();
        return A.localeCompare(B);
      });

      setItems(deduped);

      console.log(
        "[PersonalPage] IDs cargados (dedup):",
        deduped.map((r) => ({ org_people_id: r.org_people_id, org_id: r.org_id, person_id: r.person_id }))
      );

      setBanner({ type: "ok", msg: t("personal.bannerRefreshedOk") });
    } catch (err) {
      console.error("[PersonalPage] Error cargando personal:", err);
      setItems([]);
      setBanner({ type: "err", msg: err?.message || t("personal.errorLoad") });
    } finally {
      setLoading(false);
    }
  }

  function onSelect(row) {
    setSelectedOrgPeopleId(row.org_people_id);
    setForm({
      org_people_id: row.org_people_id,
      person_id: row.person_id,
      nombre: row.nombre || "",
      apellido: row.apellido || "",
      email: row.email || "",
      telefono: row.telefono || "",
      vigente: !!row.vigente,
    });
    setBanner({ type: "ok", msg: t("personal.bannerSelected") });
  }

  function onNuevo() {
    if (!canEdit) return setBanner({ type: "err", msg: t("personal.errorNoPermissionCreate") });
    setSelectedOrgPeopleId(null);
    setForm(emptyForm());
    setBanner({ type: "ok", msg: t("personal.bannerNewMode") });
  }

  function onEditar() {
    if (!canEdit) return setBanner({ type: "err", msg: t("personal.errorNoPermissionEdit") });
    if (!selectedOrgPeopleId) return setBanner({ type: "err", msg: t("personal.errorMustSelectForEdit") });
    setBanner({ type: "ok", msg: t("personal.bannerEditMode") });
  }

  function onChange(e) {
    const { name, value, type, checked } = e.target;
    setForm((f) => ({ ...f, [name]: type === "checkbox" ? checked : value }));
  }

  async function getOrCreatePersonByEmail({ nombre, apellido, email, telefono }) {
    const emailNorm = normEmail(email);
    if (!emailNorm) throw new Error(t("personal.errorMissingEmail"));

    // 1) buscar
    const { data: found, error: findErr } = await supabase
      .from("people")
      .select("id,email")
      .eq("email_norm", emailNorm)
      .maybeSingle();

    if (findErr) throw findErr;

    // 2) si existe -> update (para mantener datos al día)
    if (found?.id) {
      const { data: upd, error: updErr } = await supabase
        .from("people")
        .update({ nombre, apellido, email: emailNorm, telefono })
        .eq("id", found.id)
        .select("id,email")
        .maybeSingle();

      if (updErr) throw updErr;
      if (!upd?.id) return found; // fallback
      return upd;
    }

    // 3) no existe -> insert
    const { data: ins, error: insErr } = await supabase
      .from("people")
      .insert({ nombre, apellido, email: emailNorm, telefono })
      .select("id,email")
      .maybeSingle();

    if (insErr) {
      // 4) si chocó unique, re-intenta buscar (condición de carrera)
      if (isUniqueViolation(insErr)) {
        const { data: found2, error: findErr2 } = await supabase
          .from("people")
          .select("id,email")
          .eq("email_norm", emailNorm)
          .maybeSingle();
        if (findErr2) throw findErr2;
        if (found2?.id) return found2;
      }
      throw insErr;
    }

    if (!ins?.id) throw new Error(t("personal.errorSave"));
    return ins;
  }

  async function onGuardar() {
    try {
      if (!canEdit) return setBanner({ type: "err", msg: t("personal.errorNoPermissionSave") });
      if (!orgId) return setBanner({ type: "err", msg: t("personal.errorNoOrgSelected") });

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

      // ✅ Reemplazo universal: sin on_conflict (evita 400)
      const person = await getOrCreatePersonByEmail({ nombre, apellido, email, telefono });
      const personId = person?.id;
      if (!personId) throw new Error(t("personal.errorSave"));

      if (form.org_people_id) {
        const { data: upd, error: opErr } = await supabase
          .from("org_people")
          .update({ vigente: !!form.vigente })
          .eq("id", form.org_people_id)
          .eq("org_id", orgId)
          .eq("is_deleted", false)
          .select("id, org_id, person_id, vigente, is_deleted, updated_at");

        console.log("[PersonalPage] Resultado update membership:", { orgId, form_org_people_id: form.org_people_id, upd, opErr });

        if (opErr) throw opErr;
        if (!Array.isArray(upd) || upd.length === 0) throw new Error(t("personal.errorUpdateNoRows"));

        setBanner({ type: "ok", msg: t("personal.bannerUpdated") });
      } else {
        const { data: ins, error: insErr } = await supabase
          .from("org_people")
          .insert({ org_id: orgId, person_id: personId, vigente: !!form.vigente })
          .select("id, org_id, person_id, vigente, is_deleted, created_at");

        console.log("[PersonalPage] Resultado insert membership:", { orgId, personId, ins, insErr });

        if (insErr) {
          if (isTrackerLimitViolation(insErr)) {
            throw new Error(
              t("personal.errorPlanLimitReached", {
                defaultValue: "Has alcanzado el límite del plan Starter (1 tracker).",
              })
            );
          }
          if (isUniqueViolation(insErr)) {
            // ya existe (por ejemplo: mismo person_id en esa org o duplicado de email en people)
            throw new Error(
              t("personal.errorDuplicate", { defaultValue: "Este tracker ya existe en tu organización." })
            );
          }
          throw insErr;
        }
        if (!Array.isArray(ins) || ins.length === 0) throw new Error(t("personal.errorSave"));

        setBanner({ type: "ok", msg: t("personal.bannerCreated") });
      }

      setSelectedOrgPeopleId(null);
      setForm(emptyForm());
      await loadPersonal();
    } catch (err) {
      console.error("[PersonalPage] Error onGuardar:", err);
      // Aquí dejamos el mensaje del error real si viene del backend; si no, cae a i18n
      {
        const rawMsg = (err?.message || "").toString();
        const msg =
          rawMsg ||
          t("personal.errorSave", { defaultValue: "No se pudo guardar. Intenta nuevamente." });
        setBanner({ type: "err", msg });
      }
    } finally {
      setLoading(false);
    }
  }

  async function onEliminar() {
    try {
      if (!canEdit) return setBanner({ type: "err", msg: t("personal.errorNoPermissionDelete") });
      if (!selectedOrgPeopleId) return setBanner({ type: "err", msg: t("personal.errorMustSelectForDelete") });
      if (!orgId) return setBanner({ type: "err", msg: t("personal.errorNoOrgSelected") });

      const confirmed = window.confirm(t("personal.confirmDelete"));
      if (!confirmed) return;

      setLoading(true);

      const {
        data: { user: authUser },
        error: userError,
      } = await supabase.auth.getUser();
      if (userError || !authUser) throw new Error(t("personal.errorMissingUser"));

      console.log("[PersonalPage] Delete init:", { orgId, selectedOrgPeopleId });

      const { data: exists, error: preErr } = await supabase
        .from("org_people")
        .select("id, org_id, person_id, vigente, is_deleted")
        .eq("id", selectedOrgPeopleId)
        .eq("org_id", orgId)
        .maybeSingle();

      console.log("[PersonalPage] Pre-check delete:", { orgId, selectedOrgPeopleId, exists, preErr });

      if (preErr) throw preErr;
      if (!exists?.id) throw new Error(t("personal.errorDeleteNoRows"));
      if (exists.is_deleted) throw new Error(t("personal.errorAlreadyDeleted"));

      const now = new Date().toISOString();

      const { data: updated, error: delErr } = await supabase
        .from("org_people")
        .update({
          is_deleted: true,
          vigente: false,
          deleted_at: now,
          updated_at: now,
        })
        .eq("id", selectedOrgPeopleId)
        .eq("org_id", orgId)
        .select("id, org_id, person_id, vigente, is_deleted, deleted_at, updated_at");

      console.log("[PersonalPage] Resultado delete (soft):", { orgId, selectedOrgPeopleId, delErr, updated });

      if (delErr) throw delErr;
      if (!Array.isArray(updated) || updated.length === 0) throw new Error(t("personal.errorDeleteNoRows"));

      setItems((prev) => (prev || []).filter((r) => r.org_people_id !== selectedOrgPeopleId));

      setBanner({ type: "ok", msg: t("personal.bannerDeletedOk") });
      setSelectedOrgPeopleId(null);
      setForm(emptyForm());

      await loadPersonal();
    } catch (err) {
      console.error("[PersonalPage] Error onEliminar:", err);
      setBanner({ type: "err", msg: err?.message || t("personal.errorDelete") });
    } finally {
      setLoading(false);
    }
  }

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
              {t("personal.roleLabel")} <strong>{effectiveRole}</strong> · OrgID:{" "}
              <strong>{orgId || "—"}</strong>
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
            <input type="checkbox" name="vigente" checked={form.vigente} onChange={onChange} />
            <span>{t("personal.fieldActive")}</span>
          </label>
        </div>
      </div>

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
              const active = r.org_people_id === selectedOrgPeopleId;
              return (
                <tr
                  key={r.org_people_id || `${r.person_id}-${i}`}
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
.pg-input.wide{ grid-column: span 2 / span 2; }
.w-300{ min-width:300px; }
.pg-check{ display:flex; align-items:center; gap:8px; color:var(--ink); }
.pg-btn{
  height:36px; padding:0 12px; border-radius:8px; border:1px solid #334155;
  background:#1f2937; color:#f8fafc; cursor:pointer; font-weight:600;
}
.pg-btn:hover{ background:#334155; }
.pg-btn-primary{ background:#059669; border-color:#047857; }
.pg-btn-danger{ background:var(--danger); border-color:#b91c1c; }
.pg-tableWrap{
  max-width:1200px; margin:0 auto; border-radius:16px; overflow:auto;
  border:1px solid var(--ring); background:var(--white);
}
.pg-table{ width:100%; border-collapse:separate; border-spacing:0; color:var(--ink-strong); font-size:15px; }
.pg-table thead th{
  position:sticky; top:0; z-index:5;
  background:#f1f5f9;
  padding:12px 14px; text-align:left; text-transform:uppercase; font-size:12.5px; letter-spacing:.06em;
  border-bottom:1px solid #e2e8f0;
}
.pg-table tbody td{ padding:12px 14px; border-bottom:1px solid #eef2f7; }
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
}
.pill i{ width:10px; height:10px; border-radius:999px; display:inline-block; }
.pill.ok{ background:rgba(5,150,105,0.18); color:#d1fae5; }
.pill.ok i{ background:#10b981; }
.pill.off{ background:rgba(148,163,184,0.18); color:#e2e8f0; }
.pill.off i{ background:#94a3b8; }
`;