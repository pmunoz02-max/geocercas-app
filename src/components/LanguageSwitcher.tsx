import React from "react";
import { useTranslation } from "react-i18next";

const LANGS = [
  { code: "es", label: "ES" },
  { code: "en", label: "EN" },
  { code: "fr", label: "FR" },
] as const;

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

export default function LanguageSwitcher() {
  const { i18n } = useTranslation();

  const current =
    ((i18n.resolvedLanguage || i18n.language || "es") as string).toLowerCase().slice(0, 2);

  const handle = (e: React.MouseEvent<HTMLAnchorElement>, code: string) => {
    // Si JS funciona, cambia sin recargar.
    // Si JS NO funciona, el href hace el trabajo (recarga con ?lang=).
    try {
      if (code === current) return;
      e.preventDefault();

      // Cambia idioma en runtime
      Promise.resolve(i18n.changeLanguage(code)).catch(() => {});

      // Persistencia: compatibilidad con tu app + compatibilidad con i18next estándar
      try {
        localStorage.setItem("app_lang", code);
      } catch {}
      try {
        localStorage.setItem("i18nextLng", code);
      } catch {}

      // html lang
      if (typeof document !== "undefined") document.documentElement.lang = code;

      // limpia ?lang= (opcional)
      try {
        const url = new URL(window.location.href);
        url.searchParams.delete("lang");
        window.history.replaceState({}, "", url.pathname + url.search + url.hash);
      } catch {}
    } catch {
      // deja navegar normal
    }
  };

  return (
    <div className="flex items-center gap-2 text-xs sm:text-sm">
      {LANGS.map((lang) => {
        const active = current === lang.code;
        return (
          <a
            key={lang.code}
            href={buildHref(lang.code)}
            onClick={(e) => handle(e, lang.code)}
            className={
              "px-2 py-1 rounded-full border transition select-none " +
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
