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
    return items.filter((x) =>
      `${x.full_name || ""} ${x.email || ""}`.toLowerCase().includes(s)
    );
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
          <div className="text-gray-400">
            {placeholder || t("common.search")}
          </div>
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
                {it.full_name || t("invite.noName")} —{" "}
                {it.email || t("invite.noEmail")}
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
  const { user, currentOrg } = useAuth();

  const orgId = resolveOrgId(currentOrg);
  const orgName =
    currentOrg?.name || currentOrg?.org_name || t("inviteTracker.orgFallback");

  const [people, setPeople] = useState([]);
  const [selectedPersonId, setSelectedPersonId] = useState("");
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");

  /* =========================
     Load personnel
  ========================= */
  const loadPersonnel = useCallback(async () => {
    if (!orgId) return;
    setLoading(true);
    setMessage("");
    try {
      const { data, error } = await supabase
        .from("personal")
        .select("id, full_name, email")
        .eq("org_id", orgId)
        .eq("active", true)
        .order("full_name");

      if (error) throw error;
      setPeople(data || []);
    } catch (e) {
      console.error(e);
      setMessage(t("invite.loadPersonalError"));
    } finally {
      setLoading(false);
    }
  }, [orgId, t]);

  useEffect(() => {
    loadPersonnel();
  }, [loadPersonnel]);

  useEffect(() => {
    const p = people.find((x) => String(x.id) === String(selectedPersonId));
    if (p?.email) setEmail(p.email);
  }, [selectedPersonId, people]);

  /* =========================
     Actions
  ========================= */
  async function sendInvite(resend = false) {
    if (!email) {
      setMessage(t("inviteTracker.errors.emailRequired"));
      return;
    }

    setLoading(true);
    setMessage("");

    try {
      const { data, error } = await supabase.functions.invoke(
        "invite-tracker",
        {
          body: {
            email,
            org_id: orgId,
            resend,
          },
        }
      );

      if (error) throw error;

      setMessage(
        t("inviteTracker.messages.invited", {
          email,
          orgName,
        })
      );
    } catch (e) {
      console.error(e);
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
      <h1 className="text-xl font-semibold mb-1">
        {t("inviteTracker.title")}
      </h1>
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
            placeholder={t("inviteTracker.form.selectPlaceholder")}
            t={t}
          />
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
