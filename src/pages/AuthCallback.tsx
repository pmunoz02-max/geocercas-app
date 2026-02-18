// src/pages/AuthCallback.tsx
import { useEffect, useMemo, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { supabase, setMemoryAccessToken } from "../lib/supabaseClient";

function safeNextPath(next: string) {
  if (!next) return "/inicio";
  if (next.startsWith("/")) return next;
  return "/inicio";
}

function sanitizeLang(v: string) {
  const l = String(v || "").trim().toLowerCase().slice(0, 2);
  return l === "en" || l === "fr" || l === "es" ? l : "es";
}

function ensureLangInUrlPath(path: string, lang: string) {
  // path puede venir como "/tracker-gps?org_id=...". Asegura lang=xx en query.
  try {
    const u = new URL(path, window.location.origin);
    if (!u.searchParams.get("lang")) u.searchParams.set("lang", lang);
    return u.pathname + (u.search ? u.search : "") + (u.hash ? u.hash : "");
  } catch {
    // fallback simple
    if (path.includes("lang=")) return path;
    return path.includes("?") ? `${path}&lang=${encodeURIComponent(lang)}` : `${path}?lang=${encodeURIComponent(lang)}`;
  }
}

async function apiBootstrap(accessToken: string) {
  const res = await fetch("/api/auth/bootstrap", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${accessToken}`,
    },
    credentials: "include",
    body: JSON.stringify({ access_token: accessToken }),
  });

  if (!res.ok) {
    const txt = await res.text().catch(() => "");
    throw new Error(`bootstrap_failed (${res.status}): ${txt || res.statusText}`);
  }
}

export default function AuthCallback() {
  const location = useLocation();
  const navigate = useNavigate();
  const { t, i18n } = useTranslation();

  const lang = useMemo(() => {
    const qp = new URLSearchParams(location.search);
    return sanitizeLang(qp.get("lang") || "");
  }, [location.search]);

  const next = useMemo(() => {
    const qp = new URLSearchParams(location.search);
    const n = qp.get("next") || "/inicio";
    return safeNextPath(n);
  }, [location.search]);

  const [status, setStatus] = useState<string>("");

  // 0) Aplicar idioma lo antes posible (para que esta página y el login salgan en el idioma correcto)
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        if (i18n?.resolvedLanguage !== lang) {
          await i18n.changeLanguage(lang);
        }
      } catch {
        // ignore
      } finally {
        if (!cancelled) setStatus(t("auth.processing", { defaultValue: "Processing authentication…" }));
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [i18n, lang, t]);

  useEffect(() => {
    let cancelled = false;

    async function run() {
      try {
        // 1) Leer hash tokens (implicit flow)
        const hash = window.location.hash || "";
        const hashParams = new URLSearchParams(hash.startsWith("#") ? hash.slice(1) : hash);

        const access_token = hashParams.get("access_token") || "";
        const refresh_token = hashParams.get("refresh_token") || "";

        // 👇 Supabase recovery/invite puede venir como type en hash
        const hashType = (hashParams.get("type") || "").toLowerCase().trim();

        // 2) Si ya hay sesión, úsala
        const { data: existing } = await supabase.auth.getSession();
        let accessToken = existing?.session?.access_token || "";

        if (!accessToken) {
          // 3) Si llegaron tokens por hash, setear sesión en el cliente
          if (!access_token || !refresh_token) {
            throw new Error("missing_access_token_or_refresh_token");
          }

          setStatus(t("auth.processing", { defaultValue: "Processing authentication…" }));
          const { data, error } = await supabase.auth.setSession({
            access_token,
            refresh_token,
          });
          if (error) throw error;

          accessToken = data?.session?.access_token || "";
          if (!accessToken) throw new Error("no_access_token_after_setSession");
        }

        // ✅ Guardar token en memoria para fetch wrapper (si algo lo usa)
        setMemoryAccessToken(accessToken);

        // 4) Bootstrap cookie tg_at para tu backend
        setStatus(t("auth.processing", { defaultValue: "Processing authentication…" }));
        await apiBootstrap(accessToken);

        // 5) Limpiar hash para que no quede el token en la URL
        if (!cancelled) {
          const clean = new URL(window.location.href);
          clean.hash = "";
          window.history.replaceState({}, "", clean.toString());
        }

        // 6) Redirección final:
        //    - Si es recovery => forzar /reset-password (UpdatePassword)
        //    - Caso normal => next
        const targetBase = hashType === "recovery" ? "/reset-password" : next;
        const target = ensureLangInUrlPath(targetBase, lang);

        setStatus(t("auth.processing", { defaultValue: "Processing authentication…" }));
        if (!cancelled) navigate(target, { replace: true });
      } catch (e: any) {
        const msg = e?.message || "auth_failed";
        if (!cancelled) {
          // Mantén lang también en login y next
          const loginNext = ensureLangInUrlPath(next, lang);
          navigate(
            `/login?lang=${encodeURIComponent(lang)}&next=${encodeURIComponent(loginNext)}&err=${encodeURIComponent(msg)}`,
            { replace: true }
          );
        }
      }
    }

    run();
    return () => {
      cancelled = true;
    };
  }, [navigate, next, lang, t]);

  return (
    <div className="min-h-[60vh] flex items-center justify-center p-6">
      <div className="w-full max-w-md rounded-2xl border bg-white p-6 shadow-sm">
        <h1 className="text-xl font-semibold text-gray-900">{t("auth.processing", { defaultValue: "Auth" })}</h1>
        <p className="mt-3 text-sm text-gray-700">
          {status || t("auth.processing", { defaultValue: "Processing authentication…" })}
        </p>
      </div>
    </div>
  );
}
