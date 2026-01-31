// src/pages/AdminAssign.tsx
import { useMemo, useState } from "react";
import { supabase } from "../lib/supabaseClient";

type Notice = { type: "ok" | "err" | "info"; text: string };
type InviteResult = { claim_code: string; expires_at?: string; email?: string };

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
  const [invite, setInvite] = useState<InviteResult | null>(null);

  const targetEmail = useMemo(() => email.trim().toLowerCase(), [email]);
  const canSend = useMemo(() => targetEmail.length > 5 && !loading, [targetEmail, loading]);

  const noticeClass =
    notice?.type === "ok"
      ? "bg-emerald-50 border-emerald-200 text-emerald-800"
      : notice?.type === "err"
      ? "bg-red-50 border-red-200 text-red-800"
      : "bg-slate-50 border-slate-200 text-slate-800";

  async function copyToClipboard(text: string) {
    try {
      await navigator.clipboard.writeText(text);
      setNotice({ type: "ok", text: "✅ Código copiado al portapapeles." });
    } catch {
      setNotice({ type: "info", text: "No pude copiar automáticamente. Copia el código manualmente." });
    }
  }

  async function generateInvite() {
    if (!targetEmail) {
      setNotice({ type: "err", text: "Ingresa un email válido." });
      return;
    }

    setLoading(true);
    setInvite(null);
    setNotice({ type: "info", text: "Generando invitación (código)..." });

    try {
      const { data: sess } = await supabase.auth.getSession();
      const token = sess?.session?.access_token;
      if (!token) {
        setNotice({ type: "err", text: "No hay sesión activa. Vuelve a iniciar sesión." });
        return;
      }

      const { data, error } = await supabase.functions.invoke("invite_admin_pending", {
        body: { email: targetEmail, org_name: orgName.trim() || targetEmail },
        headers: { Authorization: `Bearer ${token}` },
      });

      if (error || data?.ok === false) {
        setNotice({
          type: "err",
          text: `❌ No se pudo generar: ${data?.message || data?.error || error?.message || "Error"}`,
        });
        return;
      }

      const inv = data?.invite;
      const claim = inv?.claim_code;
      if (!claim) {
        setNotice({ type: "err", text: "Respuesta inesperada: no llegó claim_code." });
        return;
      }

      setInvite({ claim_code: claim, expires_at: inv?.expires_at, email: inv?.email });
      setNotice({
        type: "ok",
        text: "✅ Invitación creada. Comparte el código con el invitado (email + código).",
      });
    } catch (e: any) {
      console.error("Invite pending exception:", e);
      setNotice({ type: "err", text: `❌ Error: ${errText(e)}` });
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="mx-auto max-w-3xl p-4">
      <h1 className="text-2xl font-semibold mb-2">Invitar nuevo administrador (OWNER)</h1>
      <p className="text-sm text-slate-600 mb-4">
        Variante B (permanente): se genera un <b>código</b>. El invitado debe iniciar sesión con ese email y luego
        reclamar con el código.
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
            Nombre sugerido de su organización personal (opcional)
            <input
              className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2"
              value={orgName}
              onChange={(e) => setOrgName(e.target.value)}
              placeholder="Mi Organización"
            />
          </label>

          <div className="flex gap-2 pt-2">
            <button
              className="rounded-md bg-emerald-600 px-4 py-2 text-white disabled:opacity-50"
              onClick={generateInvite}
              disabled={!canSend}
            >
              {loading ? "Procesando..." : "Generar código de invitación"}
            </button>
          </div>

          {invite?.claim_code ? (
            <div className="mt-4 rounded-lg border border-slate-200 bg-slate-50 p-3">
              <div className="text-sm font-semibold text-slate-800 mb-1">Código (claim_code)</div>
              <div className="flex items-center gap-2">
                <code className="flex-1 rounded bg-white border border-slate-200 px-3 py-2 text-xs break-all">
                  {invite.claim_code}
                </code>
                <button
                  className="rounded-md border border-slate-300 bg-white px-3 py-2 text-xs font-semibold hover:bg-slate-100"
                  onClick={() => copyToClipboard(invite.claim_code)}
                >
                  Copiar
                </button>
              </div>
              <p className="text-xs text-slate-600 mt-2">
                Instrucciones: el invitado inicia sesión con <b>{invite.email || targetEmail}</b> y luego usa este código
                en la pantalla “Claim”.
              </p>
              {invite.expires_at ? (
                <p className="text-xs text-slate-500 mt-1">Expira: {String(invite.expires_at)}</p>
              ) : null}
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}
