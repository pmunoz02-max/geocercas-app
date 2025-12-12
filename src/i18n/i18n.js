// src/i18n/i18n.js
import i18n from "i18next";
import { initReactI18next } from "react-i18next";

import es from "./es.json";
import en from "./en.json";
import fr from "./fr.json";

const FALLBACK_LANG = "es";
const SUPPORTED_LANGS = ["es", "en", "fr"];

function getInitialLanguage() {
  if (typeof window === "undefined") return FALLBACK_LANG;

  try {
    // 1) Query param ?lang=en|es|fr
    const params = new URLSearchParams(window.location.search);
    const fromQuery = params.get("lang");
    if (fromQuery && SUPPORTED_LANGS.includes(fromQuery)) {
      localStorage.setItem("app_lang", fromQuery);
      return fromQuery;
    }

    // 2) localStorage
    const saved = localStorage.getItem("app_lang");
    if (saved && SUPPORTED_LANGS.includes(saved)) {
      return saved;
    }

    // 3) Idioma del navegador (ej. "es-EC", "en-US")
    const navLang = (navigator.language || "").slice(0, 2);
    if (SUPPORTED_LANGS.includes(navLang)) {
      return navLang;
    }
  } catch {
    // ignorar errores de acceso a window/localStorage
  }

  // 4) fallback
  return FALLBACK_LANG;
}

const initialLang = getInitialLanguage();

i18n.use(initReactI18next).init({
  resources: {
    es: { translation: es },
    en: { translation: en },
    fr: { translation: fr },
  },

  lng: initialLang,
  fallbackLng: FALLBACK_LANG,

  // ✅ Evita resoluciones raras / “EN muestra ES”
  supportedLngs: SUPPORTED_LANGS,
  nonExplicitSupportedLngs: true, // "en-US" -> "en"
  load: "languageOnly",

  // ✅ Namespace único (tu estructura actual)
  defaultNS: "translation",
  ns: ["translation"],

  // ✅ No “caer” silenciosamente a ES por null/empty
  returnNull: false,
  returnEmptyString: false,

  // ✅ Fuerza re-render cuando cambia el idioma
  react: {
    useSuspense: false,
    bindI18n: "languageChanged",
    bindI18nStore: "added removed",
  },

  interpolation: {
    escapeValue: false, // React ya hace el XSS-escape
  },
});

// Mantener <html lang="..."> sincronizado SIEMPRE
if (typeof document !== "undefined") {
  document.documentElement.lang = initialLang;

  i18n.on("languageChanged", (lng) => {
    const safe = (lng || FALLBACK_LANG).slice(0, 2);
    document.documentElement.lang = safe;
    try {
      localStorage.setItem("app_lang", safe);
    } catch {
      // ignore
    }
  });
}

export default i18n;
