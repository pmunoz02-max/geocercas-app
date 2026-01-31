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

function normalizeEmail(raw: string) {
  return raw.trim().toLowerCase();
}

function defaultOrgNameFromEmail(email: string) {
  const part = email.split("@")[0] || email;
  // limpia caracteres raros para que sea un nombre presentable
  const clean = part.replace(/[^a-z0-9._-]/gi, " ").replace(/\s+/g, " ").trim();
  return clean ? `Org de ${clean}` : "Organización personal";
}

export default function AdminAssign() {
  const [email, setEmail] = useState("");
  const [orgName, setOrgName] = useState("");
  const [loading, setLoading] = useState(false);
  const [notice, setNotice] = useState<Notice | null>(null);
  const [invite, setInvite] = useState<InviteResult | null>(null);

  const targetEmail = useMemo(() => normalizeEmail(email), [email]);

  const canSend = useMemo(() => {
    // validación simple y universal (evita emails vacíos)
    return targetEmail.includes("@") && targetEmail.includes(".") && targetEmail.length > 5 && !loading;
  }, [targetEmail, loading]);

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
    const e = targetEmail;
    if (!e || !e.includes("@")) {
      setNotice({ type: "err", text: "Ingresa un email válido." });
      return;
    }

    // IMPORTANTE: Este nombre es para la ORG PERSONAL del invitado
    const suggestedPersonalOrgName = (orgName || "").trim() || defaultOrgNameFromEmail(e);

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

      /**
       * Payload UNIVERSAL:
       * - NO enviamos org_id
       * - role está implícito en la Edge Function (owner)
       * - enviamos personal_org_name y también org_name por compatibilidad (si tu Edge aún usa org_name)
       */
      const payload = {
        email: e,
        personal_org_name: suggestedPersonalOrgName,
        org_name: suggestedPersonalOrgName, // compat
        role: "owner", // por claridad (la Edge puede ignorarlo)
      };

      const { data, error } = await supabase.functions.invoke("invite_admin_pending", {
        body: payload,
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

      setInvite({ claim_code: claim, expires_at: inv?.expires_at, email: inv?.email || e });
      setNotice({
        type: "ok",
        text: "✅ Invitación creada. Comparte el email + el código. El OWNER creará su organización PERSONAL al reclamar.",
      });
    } catch (ex: any) {
      console.error("Invite pending exception:", ex);
      setNotice({ type: "err", text: `❌ Error: ${errText(ex)}` });
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="mx-auto max-w-3xl p-4">
      <h1 className="text-2xl font-semibold mb-2">Invitar nuevo administrador (OWNER)</h1>

      <div className="mb-4 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
        <div className="font-semibold mb-1">Regla importante</div>
        <div>
          Este flujo crea un OWNER que <b>NO se unirá a tu organización</b>. Al reclamar el código, el invitado nace con
          su <b>propia organización PERSONAL</b> y queda como <b>OWNER</b> (membership default = true).
        </div>
      </div>

      <p className="text-sm text-slate-600 mb-4">
        Variante B (permanente): se genera un <b>código</b>. El invitado debe iniciar sesión con ese email y luego
        reclamar el código en <b>/claim</b>.
      </p>

      {notice && <div className={`mb-4 rounded border p-3 text-sm ${noticeClass}`}>{notice.text}</div>}

      <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
        <div className="grid gap-3">
          <label className="text-sm">
            Email del nuevo OWNER
            <input
              className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2"
              value={email}
              onChange={(ev) => setEmail(ev.target.value)}
              placeholder="nuevoowner@dominio.com"
              autoComplete="email"
            />
            <div className="mt-1 text-xs text-slate-500">
              El invitado debe <b>iniciar sesión con este mismo email</b> para poder reclamar.
            </div>
          </label>

          <label className="text-sm">
            Nombre de la organización PERSONAL del invitado (opcional)
            <input
              className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2"
              value={orgName}
              onChange={(ev) => setOrgName(ev.target.value)}
              placeholder="Ej: Agro Fenice (org personal del invitado)"
            />
            <div className="mt-1 text-xs text-slate-500">
              Esto <b>no</b> es tu organización. Este nombre se usará para crear (o reutilizar) la org personal del
              invitado durante el <b>CLAIM</b>.
            </div>
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

              <div className="mt-3 text-xs text-slate-700">
                <div className="font-semibold mb-1">Instrucciones para el invitado</div>
                <ol className="list-decimal pl-5 space-y-1">
                  <li>
                    Inicia sesión con <b>{invite.email || targetEmail}</b>
                  </li>
                  <li>
                    Ve a <b>/claim</b>
                  </li>
                  <li>Pega el código y reclama</li>
                </ol>
                <div className="mt-2 text-slate-600">
                  Resultado: se crea su <b>org personal</b> + membership <b>OWNER</b> con <b>default=true</b>.
                </div>
              </div>

              {invite.expires_at ? (
                <p className="text-xs text-slate-500 mt-2">Expira: {String(invite.expires_at)}</p>
              ) : null}
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}
