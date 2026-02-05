// src/components/LanguageSwitcher.tsx
import React from "react";
import { useTranslation } from "react-i18next";
import { setLanguage, SUPPORTED } from "../i18n"; // <-- usa tu helper

function cx(...arr: Array<string | false | null | undefined>) {
  return arr.filter(Boolean).join(" ");
}

type Lang = "es" | "en" | "fr";

type LangBtnProps = {
  code: Lang;
  current: Lang;
  onClick: (code: Lang) => void;
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
        active ? "!bg-emerald-600 !text-white shadow-sm" : "!bg-transparent !text-slate-900 hover:!bg-slate-100"
      )}
    >
      {code.toUpperCase()}
    </button>
  );
}

function norm2(input: unknown): Lang {
  const base = String(input || "es").toLowerCase().split("-")[0].slice(0, 2) as Lang;
  return (SUPPORTED.includes(base) ? base : "es") as Lang;
}

export default function LanguageSwitcher() {
  const { i18n } = useTranslation();
  const current = norm2(i18n.resolvedLanguage || i18n.language);

  const setLang = async (lng: Lang) => {
    const code = norm2(lng);
    try {
      await setLanguage(code); // <-- esto asegura init + persist + html lang
    } catch (e) {
      console.error("[LanguageSwitcher] setLanguage failed:", e);
      try {
        await i18n.changeLanguage(code);
      } catch {}
    }
  };

  return (
    <div className={cx("inline-flex items-center gap-1 p-1 rounded-full", "border border-slate-200 bg-white shadow-sm")}>
      <LangBtn code="es" current={current} onClick={setLang} />
      <LangBtn code="en" current={current} onClick={setLang} />
      <LangBtn code="fr" current={current} onClick={setLang} />
    </div>
  );
}
