// src/pages/ClaimInvite.jsx
import React, { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "../lib/supabaseClient";
import { useAuth } from "../context/AuthContext.jsx";

function errText(e) {
  if (!e) return "Error desconocido";
  if (typeof e === "string") return e;
  return e?.message || e?.error_description || e?.hint || JSON.stringify(e);
}

export default function ClaimInvite() {
  const navigate = useNavigate();
  const { refreshContext } = useAuth();

  const [code, setCode] = useState("");
  const [loading, setLoading] = useState(false);
  const [notice, setNotice] = useState(null);

  const claimCode = useMemo(() => String(code || "").trim(), [code]);
  const canClaim = useMemo(() => claimCode.length >= 8 && !loading, [claimCode, loading]);

  const noticeClass =
    notice?.type === "ok"
      ? "bg-emerald-50 border-emerald-200 text-emerald-800"
      : notice?.type === "err"
      ? "bg-red-50 border-red-200 text-red-800"
      : "bg-slate-50 border-slate-200 text-slate-800";

  async function onClaim() {
    if (!claimCode || claimCode.length < 8) {
      setNotice({ type: "err", text: "Ingresa un código válido." });
      return;
    }

    setLoading(true);
    setNotice({ type: "info", text: "Reclamando invitación..." });

    try {
      const { data, error } = await supabase.rpc("claim_pending_invite", {
        p_claim_code: claimCode,
      });

      if (error) {
        setNotice({ type: "err", text: `❌ Error: ${error.message || "RPC error"}` });
        return;
      }

      const row = Array.isArray(data) ? data[0] : data; // por si retorna tabla
      if (!row?.ok) {
        setNotice({ type: "err", text: `❌ No se pudo reclamar: ${row?.message || "Invite inválido"}` });
        return;
      }

      setNotice({ type: "ok", text: "✅ Invitación reclamada. Actualizando tu sesión..." });

      // refrescar contexto (org + role + default)
      try {
        await refreshContext?.();
      } catch {
        // si falla refresh, igual seguimos
      }

      navigate("/inicio", { replace: true });
    } catch (e) {
      setNotice({ type: "err", text: `❌ Error: ${errText(e)}` });
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="mx-auto max-w-xl p-4">
      <h1 className="text-2xl font-semibold mb-2">Reclamar invitación</h1>
      <p className="text-sm text-slate-600 mb-4">
        Pega el <b>código</b> que te compartieron. Debes haber iniciado sesión con el mismo email al que te invitaron.
      </p>

      {notice && <div className={`mb-4 rounded border p-3 text-sm ${noticeClass}`}>{notice.text}</div>}

      <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
        <label className="text-sm">
          Código de invitación (claim_code)
          <input
            className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2"
            value={code}
            onChange={(e) => setCode(e.target.value)}
            placeholder="Pega aquí el código..."
            autoComplete="off"
          />
        </label>

        <div className="flex gap-2 pt-4">
          <button
            className="rounded-md bg-emerald-600 px-4 py-2 text-white disabled:opacity-50"
            onClick={onClaim}
            disabled={!canClaim}
          >
            {loading ? "Procesando..." : "Reclamar"}
          </button>

          <button
            className="rounded-md border border-slate-300 bg-white px-4 py-2 text-slate-700 hover:bg-slate-50"
            onClick={() => navigate("/inicio")}
            type="button"
          >
            Volver
          </button>
        </div>

        <p className="text-xs text-slate-500 pt-3">
          Si el código expira, pídele al ROOT que genere uno nuevo.
        </p>
      </div>
    </div>
  );
}
