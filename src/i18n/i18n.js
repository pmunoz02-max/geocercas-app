import i18n from "i18next";
import { initReactI18next } from "react-i18next";

import es from "./es.json";
import en from "./en.json";
import fr from "./fr.json";

/**
 * i18n DEFINITIVO – App Geocercas
 * - Fuente única del idioma: localStorage.app_lang (si existe)
 * - Fallback seguro: ES
 * - Sincroniza <html lang="..">
 * - Compatible Web / WebView / TWA
 */

const SUPPORTED = ["es", "en", "fr"];

function getInitialLanguage() {
  // 1) Preferencia guardada por el usuario
  try {
    const saved = localStorage.getItem("app_lang");
    if (saved && SUPPORTED.includes(saved)) return saved;
  } catch {
    // ignorar si localStorage no está disponible
  }

  // 2) Idioma del navegador
  if (typeof navigator !== "undefined") {
    const nav = String(navigator.language || "").slice(0, 2).toLowerCase();
    if (SUPPORTED.includes(nav)) return nav;
  }

  // 3) Fallback
  return "es";
}

const initialLang = getInitialLanguage();

i18n.use(initReactI18next).init({
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

// sincroniza <html lang="..">
if (typeof document !== "undefined") {
  document.documentElement.lang = initialLang;
}

// persiste y sincroniza cambios futuros
i18n.on("languageChanged", (lng) => {
  try {
    localStorage.setItem("app_lang", lng);
  } catch {
    // ignore
  }
  if (typeof document !== "undefined") {
    document.documentElement.lang = lng;
  }
});

export default i18n;
