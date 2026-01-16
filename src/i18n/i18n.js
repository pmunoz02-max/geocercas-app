import i18n from "i18next";
import { initReactI18next } from "react-i18next";

import es from "./es.json";
import en from "./en.json";
import fr from "./fr.json";

/**
 * i18n DEFINITIVO – App Geocercas
 * - Fuente única de idioma: localStorage.app_lang
 * - Fallback seguro: ES
 * - Compatible Web / TWA / Google Play
 */

function getInitialLanguage() {
  try {
    const saved = localStorage.getItem("app_lang");
    if (saved && ["es", "en", "fr"].includes(saved)) return saved;
  } catch {
    // ignore (private mode / WebView)
  }

  // navegador
  if (typeof navigator !== "undefined") {
    const navLang = (navigator.language || "").slice(0, 2);
    if (["es", "en", "fr"].includes(navLang)) return navLang;
  }

  return "es";
}

const initialLang = getInitialLanguage();

i18n
  .use(initReactI18next)
  .init({
    resources: {
      es: { translation: es },
      en: { translation: en },
      fr: { translation: fr },
    },
    lng: initialLang,
    fallbackLng: "es",
    interpolation: {
      escapeValue: false,
    },
    react: {
      useSuspense: false,
    },
    returnEmptyString: false,
    returnNull: false,
  });

// sincroniza <html lang="">
if (typeof document !== "undefined") {
  document.documentElement.lang = initialLang;
}

// persiste cualquier cambio futuro
i18n.on("languageChanged", (lng) => {
  try {
    localStorage.setItem("app_lang", lng);
  } catch {}
  if (typeof document !== "undefined") {
    document.documentElement.lang = lng;
  }
});

export default i18n;
