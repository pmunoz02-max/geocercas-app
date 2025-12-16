// src/components/LanguageSwitcher.tsx
import { useTranslation } from "react-i18next";

const LANGS = [
  { code: "es", label: "ES" },
  { code: "en", label: "EN" },
  { code: "fr", label: "FR" }
];

export default function LanguageSwitcher() {
  const { i18n } = useTranslation();
  const current = (i18n.language || "es").slice(0, 2);

  const handleChange = (code: string) => {
    if (code === current) return;

    i18n.changeLanguage(code);
    try {
      localStorage.setItem("app_lang", code);
    } catch {
      // ignorar si el navegador bloquea localStorage
    }

    if (typeof document !== "undefined") {
      document.documentElement.lang = code;
    }
  };

  return (
    <div className="flex items-center gap-2 text-xs sm:text-sm">
      {LANGS.map((lang) => {
        const active = current === lang.code;
        return (
          <button
            key={lang.code}
            type="button"
            onClick={() => handleChange(lang.code)}
            className={
              "px-2 py-1 rounded-full border transition " +
              (active
                ? "bg-emerald-500 text-white border-emerald-500 shadow-sm"
                : "bg-sky-500 text-white border-sky-500 hover:bg-sky-400")
            }
          >
            {lang.label}
          </button>
        );
      })}
    </div>
  );
}
