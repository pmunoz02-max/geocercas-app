// src/pages/InvitarTracker.jsx
import { useEffect, useMemo, useRef, useState, useCallback } from "react";
import { useTranslation } from "react-i18next";
import { useAuth } from "../context/AuthContext";
import { supabase } from "../lib/supabaseClient";

/* =========================
   Utils
========================= */
function isUuid(v) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
    String(v || "").trim()
  );
}

function resolveOrgId(currentOrg) {
  const raw =
    typeof currentOrg === "string"
      ? currentOrg
      : currentOrg?.id || currentOrg?.org_id || currentOrg?.orgId || null;

  const s = String(raw || "").trim();
  return isUuid(s) ? s : "";
}

function useClickOutside(ref, onOutside) {
  useEffect(() => {
    function onDown(e) {
      if (!ref.current) return;
      if (!ref.current.contains(e.target)) onOutside?.();
    }
    document.addEventListener("mousedown", onDown, true);
    document.addEventListener("touchstart", onDown, true);
    return () => {
      document.removeEventListener("mousedown", onDown, true);
      document.removeEventListener("touchstart", onDown, true);
    };
  }, [ref, onOutside]);
}

/* =========================
   ORDEN UNIVERSAL (igual a Personal.jsx)
========================= */
function norm(v) {
  return String(v || "").trim().toLowerCase();
}

function isDeletedRow(r) {
  return !!r?.is_deleted || !!r?.deleted_at;
}

function isVigenteActivaRow(r) {
  if (isDeletedRow(r)) return false;
  const vigente = r?.vigente !== false;
  // En Personal se calcula activo con flags, pero para invitar usamos vigente
  return vigente;
}

function rankRow(r) {
  if (isDeletedRow(r)) return 2;
  if (isVigenteActivaRow(r)) return 0;
  return 1;
}

function sortPersonal(rows) {
  const arr = Array.isArray(rows) ? [...rows] : [];
  arr.sort((a, b) => {
    const ra = rankRow(a);
    const rb = rankRow(b);
    if (ra !== rb) return ra - rb;

    const last = norm(a?.apellido).localeCompare(norm(b?.apellido));
    if (last !== 0) return last;

    const first = norm(a?.nombre).localeCompare(norm(b?.nombre));
    if (first !== 0) return first;

    const email = norm(a?.email).localeCompare(norm(b?.email));
    if (email !== 0) return email;

    return norm(a?.id).localeCompare(norm(b?.id));
  });
  return arr;
}

function buildFullName(p) {
  const full = `${p?.nombre || ""} ${p?.apellido || ""}`.trim();
  return full || p?.email || String(p?.id || "");
}

/* =========================
   Dropdown (i18n-safe)
========================= */
function Dropdown({ items, value, onChange, placeholder, t }) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const boxRef = useRef(null);

  useClickOutside(boxRef, () => setOpen(false));

  const selected = useMemo(
    () => items.find((x) => String(x.id) === String(value)) || null,
    [items, value]
  );

  const filtered = useMemo(() => {
    const s = q.trim().toLowerCase();
    if (!s) return items;

    return items.filter((x) => {
      const blob = `${x.full_name || ""} ${x.email || ""} ${x.telefono || ""}`.toLowerCase();
      return blob.includes(s);
    });
  }, [items, q]);

  return (
    <div ref={boxRef} className="relative">
      <button
        type="button"
        className="w-full border rounded-lg px-3 py-2 bg-white text-left"
        onClick={(e) => {
          e.stopPropagation();
          setOpen((v) => !v);
        }}
      >
        {selected ? (
          <div className="font-medium">
            {selected.full_name || t("invite.noName")} —{" "}
            {selected.email || t("invite.noEmail")}
          </div>
        ) : (
          <div className="text-gray-400">{placeholder || t("common.search")}</div>
        )}
      </button>

      {open && (
        <div className="absolute z-20 mt-1 w-full border rounded-lg bg-white shadow">
          <input
            className="w-full px-3 py-2 border-b outline-none"
            placeholder={t("common.search")}
            value={q}
            onChange={(e) => setQ(e.target.value)}
          />
          <div className="max-h-60 overflow-auto">
            {filtered.length === 0 && (
              <div className="px-3 py-2 text-sm text-gray-500">
                {t("common.noResults")}
              </div>
            )}

            {filtered.map((it) => (
              <div
                key={it.id}
                className="px-3 py-2 cursor-pointer hover:bg-gray-100"
                onClick={() => {
                  onChange(it.id);
                  setOpen(false);
                }}
              >
                <div className="font-medium">
                  {it.full_name || t("invite.noName")}
                </div>
                <div className="text-xs text-gray-500">
                  {(it.email || t("invite.noEmail"))}
                  {it.vigente === false ? ` • ${t("personal.status.inactive", { defaultValue: "No vigente" })}` : ""}
                  {it.is_deleted || it.deleted_at ? ` • ${t("personal.status.deleted", { defaultValue: "Eliminado" })}` : ""}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

/* =========================
   Page
========================= */
export default function InvitarTracker() {
  const { t } = useTranslation();
  const auth = useAuth();

  const user = auth?.user;
  const currentOrg = auth?.currentOrg;

  // Compat: si existen flags, los respetamos; si no, seguimos con fallback
  const authLoading = auth?.loading ?? false;
  const contextLoading = auth?.contextLoading ?? false;
  const isAuthenticated = auth?.isAuthenticated ?? !!user;

  const orgId = resolveOrgId(currentOrg);
  const orgName =
    currentOrg?.name || currentOrg?.org_name || t("inviteTracker.orgFallback");

  const [people, setPeople] = useState([]);
  const [selectedPersonId, setSelectedPersonId] = useState("");
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");

  /* =========================
     Load personnel (MISMA BASE QUE Personal.jsx)
     - from("personal").select("*").eq("org_id", ...).limit(500)
     - orden universal en cliente
  ========================= */
  const loadPersonnel = useCallback(async () => {
    if (!isAuthenticated || !orgId) return;

    setLoading(true);
    setMessage("");

    try {
      const { data, error } = await supabase
        .from("personal")
        .select("*")
        .eq("org_id", orgId)
        .limit(500);

      if (error) throw error;

      const sorted = sortPersonal(Array.isArray(data) ? data : []);

      const mapped = sorted.map((p) => ({
        id: p.id,
        full_name: buildFullName(p),
        email: p.email || "",
        telefono: p.telefono || "",
        vigente: p.vigente !== false,
        is_deleted: !!p.is_deleted,
        deleted_at: p.deleted_at || null,
      }));

      setPeople(mapped);
    } catch (e) {
      console.error("[InvitarTracker] loadPersonnel error:", e);
      setPeople([]);
      setMessage(t("invite.loadPersonalError"));
    } finally {
      setLoading(false);
    }
  }, [isAuthenticated, orgId, t]);

  useEffect(() => {
    if (authLoading) return;
    if (isAuthenticated === false) return;
    if (contextLoading && !orgId) return;
    if (!orgId) return;

    loadPersonnel();
  }, [authLoading, isAuthenticated, contextLoading, orgId, loadPersonnel]);

  // Al seleccionar persona, autocompleta email (si lo tiene)
  useEffect(() => {
    const p = people.find((x) => String(x.id) === String(selectedPersonId));
    if (p?.email) setEmail(p.email);
  }, [selectedPersonId, people]);

  /* =========================
     Actions
  ========================= */
  async function sendInvite(resend = false) {
    setMessage("");

    if (!orgId) {
      setMessage(
        t("inviteTracker.errors.orgRequired") || t("inviteTracker.orgFallback")
      );
      return;
    }

    // Si escogieron una persona pero no tiene email, forzamos a ingresar manualmente
    const picked = people.find((x) => String(x.id) === String(selectedPersonId));
    if (picked && !picked.email && !email) {
      setMessage(
        t("inviteTracker.errors.selectedPersonNoEmail", {
          defaultValue:
            "Este personal no tiene correo registrado. Ingresa un correo manualmente.",
        })
      );
      return;
    }

    if (!email) {
      setMessage(t("inviteTracker.errors.emailRequired"));
      return;
    }

    setLoading(true);

    try {
      const { error } = await supabase.functions.invoke("invite-tracker", {
        body: { email, org_id: orgId, resend },
      });
      if (error) throw error;

      setMessage(
        t("inviteTracker.messages.invited", {
          email,
          orgName,
        })
      );
    } catch (e) {
      console.error("[InvitarTracker] sendInvite error:", e);
      setMessage(t("invite.sendFail"));
    } finally {
      setLoading(false);
    }
  }

  /* =========================
     Render
  ========================= */
  return (
    <div className="max-w-xl mx-auto mt-10">
      <h1 className="text-xl font-semibold mb-1">{t("inviteTracker.title")}</h1>
      <p className="text-gray-600 mb-6">
        {t("inviteTracker.subtitle", { orgName })}
      </p>

      <div className="bg-white border rounded-xl p-5 space-y-4">
        <div>
          <label className="block text-sm font-medium mb-1">
            {t("inviteTracker.form.selectLabel")}
          </label>

          <Dropdown
            items={people}
            value={selectedPersonId}
            onChange={setSelectedPersonId}
            placeholder={
              loading
                ? t("common.actions.loading")
                : t("inviteTracker.form.selectPlaceholder")
            }
            t={t}
          />

          <div className="mt-2 flex items-center justify-between">
            <div className="text-xs text-gray-500">
              {t("inviteTracker.form.loadedCount", {
                defaultValue: "Cargados: {{n}}",
                n: people.length,
              })}
            </div>
            <button
              type="button"
              onClick={loadPersonnel}
              className="text-xs px-3 py-1 rounded border hover:bg-gray-50 disabled:opacity-60"
              disabled={loading}
            >
              {t("common.actions.refresh", { defaultValue: "Refrescar" })}
            </button>
          </div>
        </div>

        <div>
          <label className="block text-sm font-medium mb-1">
            {t("inviteTracker.form.emailLabel")}
          </label>
          <input
            className="w-full border rounded-lg px-3 py-2"
            placeholder={t("inviteTracker.form.emailPlaceholder")}
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
          <div className="text-xs text-gray-500 mt-1">
            {t("inviteTracker.form.emailHelp")}
          </div>
        </div>

        {message && (
          <div className="text-sm text-blue-700 bg-blue-50 border border-blue-200 rounded-lg px-3 py-2">
            {message}
          </div>
        )}

        <div className="flex gap-3 pt-2">
          <button
            className="flex-1 bg-green-600 text-white rounded-lg py-2 disabled:opacity-50"
            disabled={loading}
            onClick={() => sendInvite(false)}
          >
            {loading
              ? t("inviteTracker.form.buttonSending")
              : t("inviteTracker.form.buttonSend")}
          </button>

          <button
            className="flex-1 bg-blue-600 text-white rounded-lg py-2 disabled:opacity-50"
            disabled={loading}
            onClick={() => sendInvite(true)}
          >
            {t("inviteTracker.messages.magiclinkSent")}
          </button>
        </div>
      </div>
    </div>
  );
}
