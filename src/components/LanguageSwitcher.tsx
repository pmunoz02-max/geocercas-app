// src/components/LanguageSwitcher.jsx
import React from "react";
import { useTranslation } from "react-i18next";

export default function LanguageSwitcher() {
  const { i18n } = useTranslation();

  const set = (lng) => i18n.changeLanguage(lng);

  const Btn = ({ lng, children }) => (
    <button
      onClick={() => set(lng)}
      className={`px-3 py-1 rounded-full text-sm font-semibold ${
        i18n.language === lng ? "bg-slate-900 text-white" : "bg-slate-200 text-slate-900"
      }`}
      type="button"
    >
      {children}
    </button>
  );

  return (
    <div className="flex gap-2 items-center">
      <Btn lng="es">ES</Btn>
      <Btn lng="en">EN</Btn>
      <Btn lng="fr">FR</Btn>
    </div>
  );
}
