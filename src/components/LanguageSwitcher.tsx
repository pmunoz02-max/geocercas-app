import React, { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";

const LANGS = [
  { code: "es", label: "ES" },
  { code: "en", label: "EN" },
  { code: "fr", label: "FR" },
] as const;

const SUPPORTED = new Set(["es", "en", "fr"]);

function setUrlLang(code: string) {
  try {
    const url = new URL(window.location.href);
    url.searchParams.set("lang", code);
    window.history.replaceState({}, "", url.pathname + url.search + url.hash);
  } catch {}
}

export default function LanguageSwitcher() {
  const { i18n, t } = useTranslation();

  const tr = (key: string, fallback: string, options = {}) =>
    t(key, { defaultValue: fallback, ...options });

  const initial = useMemo(() => {
    const raw = String(i18n?.resolvedLanguage || i18n?.language || "es").toLowerCase();
    const code = raw.slice(0, 2);
    return SUPPORTED.has(code) ? code : "es";
  }, [i18n?.language, i18n?.resolvedLanguage]);

  const [current, setCurrent] = useState<string>(initial);

  useEffect(() => {
    const onChanged = (lng: unknown) => {
      const code = String(lng || "es").toLowerCase().slice(0, 2);
      setCurrent(SUPPORTED.has(code) ? code : "es");
    };

    i18n?.on?.("languageChanged", onChanged);
    onChanged(i18n?.resolvedLanguage || i18n?.language || "es");

    return () => {
      i18n?.off?.("languageChanged", onChanged);
    };
  }, [i18n]);

  useEffect(() => {
    const onChanged = (lng: unknown) => {
      console.log("[LANG_SWITCH] languageChanged event", lng);
    };

    i18n?.on?.("languageChanged", onChanged);
    return () => {
      i18n?.off?.("languageChanged", onChanged);
    };
  }, [i18n]);

  const handle = async (code: string) => {
    try {
      console.log("[LANG_SWITCH] click", {
        code,
        current,
        i18nLanguage: i18n.language,
        resolvedLanguage: i18n.resolvedLanguage,
      });

      if (!SUPPORTED.has(code)) {
        console.warn("[LANG_SWITCH] unsupported", code);
        return;
      }

      if (code === current) {
        console.warn("[LANG_SWITCH] already current", code);
        return;
      }

      await i18n.changeLanguage(code);

      console.log("[LANG_SWITCH] changed", {
        code,
        i18nLanguage: i18n.language,
        resolvedLanguage: i18n.resolvedLanguage,
      });

      setUrlLang(code);
      setCurrent(code);
    } catch (error) {
      console.error("[LANG_SWITCH] failed", error);
    }
  };

  return (
    <div className="flex items-center gap-2 text-xs sm:text-sm relative z-50 pointer-events-auto">
      {LANGS.map((lang) => {
        const active = current === lang.code;

        return (
          <button
            key={lang.code}
            type="button"
            onClick={() => handle(lang.code)}
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