// src/components/LanguageSwitcher.jsx
import React from "react";
import { useTranslation } from "react-i18next";
import { SUPPORTED } from "../i18n/index.js";

function cx(...arr) {
  return arr.filter(Boolean).join(" ");
}

function LangButton({ lng, current, onClick }) {
  const active = current === lng;
  return (
    <button
      type="button"
      onClick={() => onClick(lng)}
      className={cx(
        "px-3 py-1.5 rounded-full text-xs font-bold transition",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500/70",
        active
          ? "bg-emerald-500 text-slate-950"
          : "bg-white/5 text-white/70 hover:bg-white/10 hover:text-white border border-white/10"
      )}
      aria-pressed={active}
    >
      {lng.toUpperCase()}
    </button>
  );
}

export default function LanguageSwitcher() {
  const { i18n } = useTranslation();
  const current = String(i18n.language || "es").slice(0, 2);

  const setLang = (lng) => {
    const code = String(lng || "es").toLowerCase().slice(0, 2);
    if (!SUPPORTED.includes(code)) return;
    i18n.changeLanguage(code); // persistencia la hace src/i18n/index.js
  };

  return (
    <div className="flex items-center gap-1 p-1 rounded-full bg-white/5 border border-white/10">
      <LangButton lng="es" current={current} onClick={setLang} />
      <LangButton lng="en" current={current} onClick={setLang} />
      <LangButton lng="fr" current={current} onClick={setLang} />
    </div>
  );
}
