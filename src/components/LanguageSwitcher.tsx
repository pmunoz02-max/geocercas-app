import React from "react";
import { useTranslation } from "react-i18next";
import { applyLanguageSafely } from "@/i18n/i18n";

const LANGS = [
  { code: "es", label: "ES" },
  { code: "en", label: "EN" },
  { code: "fr", label: "FR" },
] as const;

const SUPPORTED = new Set(["es", "en", "fr"]);

export default function LanguageSwitcher() {
  const { i18n, t } = useTranslation();

  function handleLanguageChange(e: React.MouseEvent<HTMLButtonElement>, code: string) {
    e.preventDefault();
    e.stopPropagation();

    if (!SUPPORTED.has(code)) return;

    const normalized = String(code).toLowerCase().slice(0, 2);
    const url = new URL(window.location.href);
    url.searchParams.set("lang", normalized);
    window.history.replaceState({}, "", url.toString());

    applyLanguageSafely(normalized);
  }

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
            onClick={(e) => {
              if (!SUPPORTED.has(lang.code)) return;
              if (lang.code === current) return;

              handleLanguageChange(e, lang.code);
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