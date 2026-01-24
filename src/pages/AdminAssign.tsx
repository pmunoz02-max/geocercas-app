// src/pages/AdminAssign.tsx
import { useMemo, useState } from "react";
import { supabase } from "../supabaseClient";

type Notice = { type: "ok" | "err" | "info"; text: string };

function errText(e: any) {
  if (!e) return "Error desconocido";
  if (typeof e === "string") return e;
  return e?.message || e?.error_description || e?.hint || JSON.stringify(e);
}

export default function AdminAssign() {
  const [email, setEmail] = useState("");
  const [orgName, setOrgName] = useState("");
  const [loading, setLoading] = useState(false);
  const [notice, setNotice] = useState<Notice | null>(null);

  const [lastStatus, setLastStatus] = useState<string | null>(null);
  const [createdOrgId, setCreatedOrgId] = useState<string | null>(null);

  const targetEmail = useMemo(() => email.trim().toLowerCase(), [email]);
  const canSendMagic = useMemo(() => targetEmail.length > 5 && !loading, [targetEmail, loading]);
  const canCreate = useMemo(() => targetEmail.length > 5 && !loading, [targetEmail, loading]);

  const noticeClass =
    notice?.type === "ok"
      ? "bg-emerald-50 border-emerald-200 text-emerald-800"
      : notice?.type === "err"
      ? "bg-red-50 border-red-200 text-red-800"
      : "bg-slate-50 border-slate-200 text-slate-800";

  async function sendMagicLink() {
    if (!targetEmail) {
      setNotice({ type: "err", text: "Ingresa un email válido." });
      return;
    }

    setLoading(true);
    setNotice({ type: "info", text: "Enviando Magic Link..." });

    try {
      const { error } = await supabase.auth.signInWithOtp({
        email: targetEmail,
        options: {
          emailRedirectTo: `${window.location.origin}/auth/callback`,
        },
      });

      if (error) {
        console.error("MagicLink error:", error);
        setNotice({ type: "err", text: `❌ No se pudo enviar el Magic Link: ${error.message}` });
        return;
      }

      setNotice({ type: "ok", text: "✅ Magic Link enviado. Revisa el correo (Inbox/Spam)." });
    } catch (e: any) {
      console.error("MagicLink exception:", e);
      setNotice({ type: "err", text: `❌ Error enviando Magic Link: ${errText(e)}` });
    } finally {
      setLoading(false);
    }
  }

  async function createOwnerOrg() {
    if (!targetEmail) {
      setNotice({ type: "err", text: "Ingresa un email válido." });
      return;
    }

    setLoading(true);
    setNotice({ type: "info", text: "Creando organización y asignando OWNER..." });
    setLastStatus(null);
    setCreatedOrgId(null);

    try {
      // Rol fijo por regla de negocio: owner
      const { data, error } = await supabase.rpc("admin_invite_new_admin", {
        p_email: targetEmail,
        p_role: "owner",
        p_org_name: orgName?.trim() ? orgName.trim() : null,
      });

      if (error) {
        console.error("RPC admin_invite_new_admin error:", error);
        setNotice({ type: "err", text: `❌ RPC falló: ${error.message}` });
        setLastStatus("RPC_ERROR");
        return;
      }

      const status = data?.status ?? "UNKNOWN";
      setLastStatus(status);

      if (status === "NEEDS_MAGIC_LINK") {
        setNotice({
          type: "info",
          text: "El usuario aún no existe en Auth. Primero envía Magic Link y cuando acepte, vuelve a presionar “Crear org + OWNER”.",
        });
        return;
      }

      if (status === "OK") {
        const orgId = data?.org_id ?? null;
        setCreatedOrgId(orgId);
        setNotice({
          type: "ok",
          text: `✅ Listo. Se creó una org nueva y el usuario quedó como OWNER.${orgId ? ` Org ID: ${orgId}` : ""}`,
        });
        return;
      }

      // Otros estados posibles
      setNotice({
        type: status === "FORBIDDEN" ? "err" : "info",
        text: data?.message ? String(data.message) : `Respuesta: ${status}`,
      });
    } catch (e: any) {
      console.error("RPC exception:", e);
      setNotice({ type: "err", text: `❌ Error: ${errText(e)}` });
      setLastStatus("EXCEPTION");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="mx-auto max-w-3xl p-4">
      <h1 className="text-2xl font-semibold mb-2">Invitar nuevo administrador (OWNER)</h1>
      <p className="text-sm text-slate-600 mb-4">
        Regla canónica: un nuevo administrador nace con su propia organización y queda como <b>OWNER</b>.
      </p>

      {notice && <div className={`mb-4 rounded border p-3 text-sm ${noticeClass}`}>{notice.text}</div>}

      <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
        <div className="grid gap-3">
          <label className="text-sm">
            Email del nuevo administrador
            <input
              className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="nuevoadmin@dominio.com"
              autoComplete="email"
            />
          </label>

          <label className="text-sm">
            Nombre de la organización (opcional)
            <input
              className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2"
              value={orgName}
              onChange={(e) => setOrgName(e.target.value)}
              placeholder="Org de Juan / Mi Empresa / etc."
            />
          </label>

          <div className="flex flex-wrap gap-2 pt-2">
            <button
              className="rounded-md bg-slate-900 px-4 py-2 text-white disabled:opacity-50"
              onClick={createOwnerOrg}
              disabled={!canCreate}
              title="Crea una org nueva y asigna OWNER al usuario"
            >
              {loading ? "Procesando..." : "Crear org + OWNER"}
            </button>

            <button
              className="rounded-md border border-slate-300 px-4 py-2 disabled:opacity-50"
              onClick={sendMagicLink}
              disabled={!canSendMagic}
              title="Úsalo si el RPC responde NEEDS_MAGIC_LINK"
            >
              {loading ? "Enviando..." : "Enviar Magic Link"}
            </button>
          </div>

          {(lastStatus || createdOrgId) && (
            <div className="mt-3 rounded border border-slate-200 bg-slate-50 p-3 text-xs text-slate-700">
              {lastStatus && (
                <div>
                  <b>Último status:</b> {lastStatus}
                </div>
              )}
              {createdOrgId && (
                <div>
                  <b>Org ID creada:</b> {createdOrgId}
                </div>
              )}
            </div>
          )}

          <p className="text-xs text-slate-600 pt-2">
            Flujo recomendado: (1) “Crear org + OWNER” → si responde NEEDS_MAGIC_LINK: (2) “Enviar Magic Link”
            → (3) cuando el usuario acepte, vuelve a “Crear org + OWNER”.
          </p>
        </div>
      </div>
    </div>
  );
}
