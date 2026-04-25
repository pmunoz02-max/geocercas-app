
import React, { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { applyLanguageSafely } from "@/i18n/i18n";


const LANGS = [
  { code: "es", label: "ES" },
  { code: "en", label: "EN" },
  { code: "fr", label: "FR" },
];
const SUPPORTED = new Set(["es", "en", "fr"]);


export default function LanguageSwitcher() {
  const { i18n, t } = useTranslation();
  const [current, setCurrent] = useState(() => {
    const params = new URLSearchParams(window.location.search);
    const urlLang = params.get("lang");
    if (urlLang && SUPPORTED.has(urlLang)) return urlLang;
    return String(i18n.resolvedLanguage || i18n.language || "es").toLowerCase().slice(0, 2);
  });

  // Sync with URL param and i18n
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const urlLang = params.get("lang");
    if (urlLang && SUPPORTED.has(urlLang) && urlLang !== i18n.language) {
      applyLanguageSafely(urlLang);
      setCurrent(urlLang);
    } else if (!urlLang && i18n.language !== current) {
      setCurrent(String(i18n.language).toLowerCase().slice(0, 2));
    }
    // eslint-disable-next-line
  }, [window.location.search, i18n.language]);

  // When i18n language changes, update URL if needed
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get("lang") !== current) {
      params.set("lang", current);
      const url = window.location.pathname + "?" + params.toString();
      window.history.replaceState({}, "", url);
    }
  }, [current]);

  function handleLanguageChange(e: React.MouseEvent<HTMLButtonElement>, code: string) {
    e.preventDefault();
    e.stopPropagation();
    if (!SUPPORTED.has(code)) return;
    setCurrent(code);
    applyLanguageSafely(code);
  }

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
            onClick={(e) => handleLanguageChange(e, lang.code)}
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