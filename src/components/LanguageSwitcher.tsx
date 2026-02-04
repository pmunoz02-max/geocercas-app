// src/components/LanguageSwitcher.tsx
import React from "react";
import { useTranslation } from "react-i18next";

function cx(...arr: Array<string | false | null | undefined>) {
  return arr.filter(Boolean).join(" ");
}

type LangBtnProps = {
  code: "es" | "en" | "fr";
  current: string;
  onClick: (code: "es" | "en" | "fr") => void;
};

function LangBtn({ code, current, onClick }: LangBtnProps) {
  const active = current === code;

  return (
    <button
      type="button"
      onClick={() => onClick(code)}
      aria-pressed={active}
      className={cx(
        "px-3 py-1.5 rounded-full text-xs font-extrabold tracking-wide transition",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500/60",
        // ✅ BLINDAJE: fuerza colores aunque haya CSS global
        active
          ? "!bg-emerald-600 !text-white shadow-sm"
          : "!bg-transparent !text-slate-900 hover:!bg-slate-100"
      )}
    >
      {code.toUpperCase()}
    </button>
  );
}

/**
 * LanguageSwitcher (LIGHT + blindado)
 * - Texto ES/EN/FR siempre visible
 * - Persistencia la maneja i18n (languageChanged)
 */
export default function LanguageSwitcher() {
  const { i18n } = useTranslation();
  const current = String(i18n.language || "es").slice(0, 2);

  const setLang = (lng: "es" | "en" | "fr") => {
    const code = String(lng || "es").toLowerCase().slice(0, 2) as "es" | "en" | "fr";
    if (!["es", "en", "fr"].includes(code)) return;
    i18n.changeLanguage(code);
  };

  return (
    <div className={cx("inline-flex items-center gap-1 p-1 rounded-full", "border border-slate-200 bg-white shadow-sm")}>
      <LangBtn code="es" current={current} onClick={setLang} />
      <LangBtn code="en" current={current} onClick={setLang} />
      <LangBtn code="fr" current={current} onClick={setLang} />
    </div>
  );
}
