// src/pages/AdminAssign.tsx
import { useMemo, useState } from "react";
import { supabase } from "../lib/supabaseClient";

type Notice = { type: "ok" | "err" | "info"; text: string };

function errText(e: any) {
  if (!e) return "Error desconocido";
  if (typeof e === "string") return e;
  return e?.message || e?.error_description || e?.hint || JSON.stringify(e);
}

export default function AdminAssign() {
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [notice, setNotice] = useState<Notice | null>(null);

  const targetEmail = useMemo(() => email.trim().toLowerCase(), [email]);
  const canSend = useMemo(() => targetEmail.length > 5 && !loading, [targetEmail, loading]);

  const noticeClass =
    notice?.type === "ok"
      ? "bg-emerald-50 border-emerald-200 text-emerald-800"
      : notice?.type === "err"
      ? "bg-red-50 border-red-200 text-red-800"
      : "bg-slate-50 border-slate-200 text-slate-800";

  async function sendInvite() {
    if (!targetEmail) {
      setNotice({ type: "err", text: "Ingresa un email válido." });
      return;
    }

    setLoading(true);
    setNotice({ type: "info", text: "Enviando invitación (Magic Link)..." });

    try {
      // Asegura sesión
      const { data: sess } = await supabase.auth.getSession();
      const token = sess?.session?.access_token;

      if (!token) {
        setNotice({ type: "err", text: "No hay sesión activa. Vuelve a iniciar sesión." });
        return;
      }

      // ✅ Llamada directa a Edge Function (con Bearer explícito)
      const { data, error } = await supabase.functions.invoke("invite_admin", {
        body: { email: targetEmail },
        headers: { Authorization: `Bearer ${token}` },
      });

      if (error || data?.ok === false) {
        setNotice({
          type: "err",
          text: `❌ No se pudo enviar la invitación: ${data?.error || error?.message || "Error desconocido"}`,
        });
        return;
      }

      setNotice({
        type: "ok",
        text: "✅ Invitación enviada. El nuevo administrador nacerá con su propia organización como OWNER.",
      });
      setEmail("");
    } catch (e: any) {
      console.error("Invite exception:", e);
      setNotice({ type: "err", text: `❌ Error: ${errText(e)}` });
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

          <div className="flex gap-2 pt-2">
            <button
              className="rounded-md bg-emerald-600 px-4 py-2 text-white disabled:opacity-50"
              onClick={sendInvite}
              disabled={!canSend}
            >
              {loading ? "Procesando..." : "Enviar invitación (Magic Link)"}
            </button>
          </div>

          <p className="text-xs text-slate-600 pt-2">
            El invitado debe abrir el link en el dispositivo donde usará la app.
          </p>
        </div>
      </div>
    </div>
  );
}
