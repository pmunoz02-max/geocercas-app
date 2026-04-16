import React from "react";
import { useTranslation } from "react-i18next";

const LANGS = [
  { code: "es", label: "ES" },
  { code: "en", label: "EN" },
  { code: "fr", label: "FR" },
] as const;

const SUPPORTED = new Set(["es", "en", "fr"]);

function goToLang(code: string) {
  try {
    const url = new URL(window.location.href);
    url.searchParams.set("lang", code);

    try {
      localStorage.setItem("app_lang", code);
    } catch {}

    window.location.href = url.pathname + url.search + url.hash;
  } catch {
    window.location.href = `?lang=${code}`;
  }
}

export default function LanguageSwitcher() {
  const { i18n, t } = useTranslation();

  const current = String(i18n.resolvedLanguage || i18n.language || "es")
    .toLowerCase()
    .slice(0, 2);

  const tr = (key: string, fallback: string, options = {}) =>
    t(key, { defaultValue: fallback, ...options });

  return (
    <div className="flex items-center gap-2 text-xs sm:text-sm relative z-[9999] pointer-events-auto">
      {LANGS.map((lang) => {
        const active = current === lang.code;

        return (
          <button
            key={lang.code}
            type="button"
            onMouseDown={(e) => {
              e.preventDefault();
              e.stopPropagation();

              if (!SUPPORTED.has(lang.code)) return;
              if (lang.code === current) return;

              goToLang(lang.code);
            }}
            className={
              "px-2 py-1 rounded-full border transition select-none cursor-pointer pointer-events-auto " +
              (active
                ? "bg-emerald-500 text-white border-emerald-500 shadow-sm"
                : "bg-sky-500 text-white border-sky-500 hover:bg-sky-400")
            }
            aria-pressed={active}
            aria-label={tr(
              "languageSwitcher.aria.changeTo",
              "Change language to {{lang}}",
              { lang: lang.label }
            )}
            title={tr(
              "languageSwitcher.title.changeTo",
              "Change to {{lang}}",
              { lang: lang.label }
            )}
          >
            {lang.label}
          </button>
        );
      })}
    </div>
  );
}