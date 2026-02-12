import { useEffect, useMemo, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { supabase } from "../lib/supabaseClient";

function getQueryParam(search: string, key: string) {
  const v = new URLSearchParams(search).get(key);
  return v ?? "";
}

function safeNextPath(next: string) {
  if (!next) return "/inicio";
  if (next.startsWith("/")) return next;
  return "/inicio";
}

export default function Login() {
  const location = useLocation();
  const navigate = useNavigate();

  const [email, setEmail] = useState("");
  const [nextInput, setNextInput] = useState("/inicio");

  const [sending, setSending] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  const nextFromUrl = useMemo(() => {
    const n = getQueryParam(location.search, "next");
    return safeNextPath(n || "/inicio");
  }, [location.search]);

  const inboundErr = useMemo(() => {
    const e = getQueryParam(location.search, "err");
    return e || "";
  }, [location.search]);

  useEffect(() => {
    if (inboundErr) setErr(inboundErr);
  }, [inboundErr]);

  useEffect(() => {
    // Si llega next por query, lo mostramos en el input
    setNextInput(nextFromUrl);
  }, [nextFromUrl]);

  const siteUrl = (import.meta.env.VITE_SITE_URL || "").trim();

  const redirectTo = useMemo(() => {
    const next = safeNextPath(nextInput);
    const url = new URL("/auth/callback", siteUrl);
    url.searchParams.set("next", next);
    return url.toString();
  }, [siteUrl, nextInput]);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setErr(null);
    setMsg(null);

    const cleanEmail = email.trim().toLowerCase();
    if (!cleanEmail || !cleanEmail.includes("@")) {
      setErr("Ingresa un correo válido.");
      return;
    }

    try {
      setSending(true);

      const { error } = await supabase.auth.signInWithOtp({
        email: cleanEmail,
        options: {
          emailRedirectTo: redirectTo,
        },
      });

      if (error) throw error;

      setMsg(
        "Listo. Te enviamos un Magic Link. Abre el enlace en el mismo navegador donde estás usando la app."
      );
    } catch (e: any) {
      setErr(e?.message || "No se pudo enviar el Magic Link.");
    } finally {
      setSending(false);
    }
  }

  return (
    <div className="min-h-[70vh] flex items-center justify-center p-6">
      <div className="w-full max-w-md rounded-2xl border bg-white p-6 shadow-sm">
        <h1 className="text-xl font-semibold">Ingresar</h1>

        {err && (
          <div className="mt-4 rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">
            {err}
          </div>
        )}
        {msg && (
          <div className="mt-4 rounded-xl border border-green-200 bg-green-50 p-3 text-sm text-green-700">
            {msg}
          </div>
        )}

        <form className="mt-6 space-y-4" onSubmit={onSubmit}>
          <div className="space-y-2">
            <label className="block text-sm font-medium">Email</label>
            <input
              className="w-full rounded-xl border px-3 py-2 outline-none focus:ring text-gray-900 placeholder:text-gray-400 bg-white autofill:text-gray-900"
              type="email"
              autoComplete="email"
              inputMode="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="tu@email.com"
            />
          </div>

          <div className="space-y-2">
            <label className="block text-sm font-medium">Ir a (next)</label>
            <input
              className="w-full rounded-xl border px-3 py-2 outline-none focus:ring text-gray-900 placeholder:text-gray-400 bg-white"
              type="text"
              value={nextInput}
              onChange={(e) => setNextInput(e.target.value)}
              placeholder="/inicio"
            />
            <p className="text-xs text-gray-500">
              Tip: usa rutas internas como <code className="px-1">/inicio</code>,{" "}
              <code className="px-1">/geocercas</code>, etc.
            </p>
          </div>

          <button
            className="w-full rounded-xl bg-black px-4 py-2 text-white disabled:opacity-60"
            disabled={sending}
            type="submit"
          >
            {sending ? "Enviando..." : "Enviar Magic Link"}
          </button>

          <button
            type="button"
            className="w-full rounded-xl border px-4 py-2"
            onClick={() => navigate("/")}
          >
            Volver
          </button>
        </form>

        <p className="mt-4 text-xs text-gray-500">
          Redirect configurado: <span className="break-all">{redirectTo}</span>
        </p>
      </div>
    </div>
  );
}
