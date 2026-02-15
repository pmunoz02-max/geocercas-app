import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuthSafe } from "../context/AuthContext.jsx";

function normalizeEmail(v) {
  return String(v || "").trim().toLowerCase();
}

export default function InvitarTracker() {
  const navigate = useNavigate();
  const auth = useAuthSafe();

  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);

  const [okMsg, setOkMsg] = useState(null);
  const [errMsg, setErrMsg] = useState(null);

  const orgId = useMemo(() => {
    // ✅ Universal: usa org canónica del AuthContext (la que ya usa RequireOrg)
    const id =
      auth?.orgId ||
      auth?.currentOrgId ||
      auth?.org?.id ||
      auth?.org_id ||
      "";
    return String(id || "").trim();
  }, [auth]);

  const who = useMemo(() => {
    return {
      email: auth?.user?.email || "",
      user_id: auth?.user?.id || "",
      org_id: orgId,
    };
  }, [auth, orgId]);

  async function onSendInvite(e) {
    e.preventDefault();

    // ✅ Reset universal: nunca dejar mensaje viejo pegado
    setOkMsg(null);
    setErrMsg(null);

    const cleanEmail = normalizeEmail(email);
    if (!cleanEmail || !cleanEmail.includes("@")) {
      setErrMsg("Ingresa un email válido.");
      return;
    }

    if (!orgId) {
      setErrMsg("No hay organización activa. Ve a /inicio y selecciona tu organización.");
      return;
    }

    try {
      setBusy(true);

      const res = await fetch("/api/invite-tracker", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          email: cleanEmail,
          org_id: orgId,
          role: "tracker",
        }),
      });

      const text = await res.text().catch(() => "");
      let body = null;
      try {
        body = text ? JSON.parse(text) : null;
      } catch {
        body = { raw: text };
      }

      // ✅ Caso 1: HTTP no-ok => error real
      if (!res.ok) {
        const msg =
          body?.error ||
          body?.message ||
          body?.raw ||
          `HTTP ${res.status}`;
        setErrMsg(`Error invitaciones (${res.status}): ${msg}`);
        return;
      }

      // ✅ Caso 2: HTTP ok pero ok=false => upstream error real (403 etc)
      if (body && body.ok === false) {
        const upstreamStatus = body?.upstream_status || "";
        const upstreamMsg =
          body?.upstream?.error ||
          body?.error ||
          body?.message ||
          "UPSTREAM_ERROR";
        setErrMsg(
          `Error invitaciones (${upstreamStatus || "?"}): ${upstreamMsg}`
        );
        return;
      }

      // ✅ Caso 3: ok=true => éxito
      const actionLink = body?.action_link || "";
      const emailSent = body?.email_sent;

      let msg = `✅ Invitación generada para ${cleanEmail}.`;
      if (emailSent === true) msg += ` Correo enviado.`;
      if (emailSent === false && actionLink) msg += ` Si no llega, usa el enlace de respaldo.`;
      setOkMsg({ msg, actionLink, diag: body?.diag || null });
      setEmail("");
    } catch (err) {
      setErrMsg(String(err?.message || err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="min-h-[70vh] flex items-center justify-center p-6">
      <div className="w-full max-w-xl rounded-2xl border bg-white p-6 shadow-sm">
        <div className="flex items-center justify-between gap-3">
          <h1 className="text-xl font-semibold text-gray-900">Invitar Tracker</h1>
          <button
            type="button"
            onClick={() => navigate("/tracker")}
            className="rounded-xl border px-3 py-2 text-sm hover:bg-slate-50"
          >
            Volver a Tracker
          </button>
        </div>

        {/* Info diagnóstico (universal) */}
        <div className="mt-4 rounded-xl border bg-slate-50 p-3 text-xs text-slate-700">
          <div><b>Org usada:</b> {who.org_id || "—"}</div>
          <div><b>Usuario:</b> {who.email || "—"} ({who.user_id || "—"})</div>
        </div>

        {errMsg && (
          <div className="mt-4 rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">
            {errMsg}
          </div>
        )}

        {okMsg && (
          <div className="mt-4 rounded-xl border border-green-200 bg-green-50 p-3 text-sm text-green-700">
            <div>{okMsg.msg}</div>

            {okMsg.actionLink ? (
              <div className="mt-2 text-xs text-slate-700">
                <div className="font-semibold">Magic Link (respaldo):</div>
                <div className="mt-1 break-all rounded-lg border bg-white p-2">
                  {okMsg.actionLink}
                </div>
              </div>
            ) : null}
          </div>
        )}

        <form onSubmit={onSendInvite} className="mt-6 space-y-3">
          <div>
            <label className="block text-sm font-medium text-gray-900">Email del tracker</label>
            <input
              className="mt-1 w-full rounded-xl border px-3 py-2 outline-none focus:ring bg-white text-gray-900"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="tracker@email.com"
            />
          </div>

          <button
            type="submit"
            disabled={busy}
            className="w-full rounded-xl bg-black px-4 py-2 text-white disabled:opacity-60"
          >
            {busy ? "Enviando..." : "Enviar invitación"}
          </button>
        </form>
      </div>
    </div>
  );
}
