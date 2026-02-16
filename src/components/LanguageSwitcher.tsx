import React, { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";

const LANGS = [
  { code: "es", label: "ES" },
  { code: "en", label: "EN" },
  { code: "fr", label: "FR" },
] as const;

const SUPPORTED = new Set(["es", "en", "fr"]);

function buildHref(code: string) {
  try {
    if (typeof window === "undefined") return `?lang=${code}`;
    const url = new URL(window.location.href);
    url.searchParams.set("lang", code);
    return url.pathname + url.search + url.hash;
  } catch {
    return `?lang=${code}`;
  }
}

function setHtmlLang(code: string) {
  try {
    if (typeof document !== "undefined") document.documentElement.lang = code;
  } catch {}
}

function persistLang(code: string) {
  try {
    localStorage.setItem("app_lang", code);
  } catch {}
}

function setUrlLang(code: string) {
  try {
    const url = new URL(window.location.href);
    url.searchParams.set("lang", code);
    window.history.replaceState({}, "", url.pathname + url.search + url.hash);
  } catch {}
}

export default function LanguageSwitcher() {
  const { i18n } = useTranslation();

  // Estado local para forzar re-render “sí o sí”
  const initial = useMemo(() => {
    const raw = String(i18n?.resolvedLanguage || i18n?.language || "es").toLowerCase();
    const code = raw.slice(0, 2);
    return SUPPORTED.has(code) ? code : "es";
  }, [i18n?.language, i18n?.resolvedLanguage]);

  const [current, setCurrent] = useState<string>(initial);

  useEffect(() => {
    // Suscripción explícita (blindaje)
    const onChanged = (lng: any) => {
      const code = String(lng || "es").toLowerCase().slice(0, 2);
      setCurrent(SUPPORTED.has(code) ? code : "es");
    };
    i18n?.on?.("languageChanged", onChanged);

    // Alinea una vez por si llega tarde
    onChanged(i18n?.resolvedLanguage || i18n?.language || "es");

    return () => {
      i18n?.off?.("languageChanged", onChanged);
    };
  }, [i18n]);

  const handle = (e: React.MouseEvent<HTMLAnchorElement>, code: string) => {
    // JS ON: cambia sin recargar.
    // JS OFF: deja que navegue el href con ?lang=
    try {
      if (!SUPPORTED.has(code)) return;
      if (code === current) return;

      e.preventDefault();
      e.stopPropagation();

      // Persistencia + html lang + URL visible (para “reacción” inmediata)
      persistLang(code);
      setHtmlLang(code);
      setUrlLang(code);

      // Cambia idioma i18next
      Promise.resolve(i18n.changeLanguage(code)).catch(() => {});

      // Estado local inmediato (aunque i18n tarde)
      setCurrent(code);
    } catch {
      // Si algo falla, deja navegación normal
    }
  };

  return (
    <div className="flex items-center gap-2 text-xs sm:text-sm relative z-50 pointer-events-auto">
      {LANGS.map((lang) => {
        const active = current === lang.code;
        return (
          <a
            key={lang.code}
            href={buildHref(lang.code)}
            onClickCapture={(e) => handle(e, lang.code)}
            className={
              "px-2 py-1 rounded-full border transition select-none cursor-pointer pointer-events-auto " +
              (active
                ? "bg-emerald-500 text-white border-emerald-500 shadow-sm"
                : "bg-sky-500 text-white border-sky-500 hover:bg-sky-400")
            }
            aria-pressed={active}
            aria-label={`Cambiar idioma a ${lang.label}`}
            title={`Cambiar a ${lang.label}`}
          >
            {lang.label}
          </a>
        );
      })}
    </div>
  );
}
