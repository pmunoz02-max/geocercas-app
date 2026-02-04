// src/i18n/index.js
import i18n from "i18next";
import { initReactI18next } from "react-i18next";

import es from "./es.json";
import en from "./en.json";
import fr from "./fr.json";

/**
 * i18n UNIFICADO – App Geocercas
 *
 * Prioridad:
 * 1) ?lang=es|en|fr
 * 2) localStorage.app_lang
 * 3) navigator.language
 * 4) fallback: es
 *
 * Objetivos:
 * - Un solo init (evitar i18n duplicado)
 * - Persistencia real
 * - Funciona Web/PWA/TWA
 */

const SUPPORTED = ["es", "en", "fr"];
const STORAGE_KEY = "app_lang";

function normalize2(v) {
  return String(v || "").toLowerCase().slice(0, 2);
}

function readUrlLang() {
  try {
    if (typeof window === "undefined") return null;
    const url = new URL(window.location.href);
    const v = normalize2(url.searchParams.get("lang"));
    return SUPPORTED.includes(v) ? v : null;
  } catch {
    return null;
  }
}

function readStoredLang() {
  try {
    const v = normalize2(localStorage.getItem(STORAGE_KEY));
    return SUPPORTED.includes(v) ? v : null;
  } catch {
    return null;
  }
}

function readNavigatorLang() {
  try {
    const v = normalize2(navigator.language);
    return SUPPORTED.includes(v) ? v : null;
  } catch {
    return null;
  }
}

function setHtmlLang(code) {
  try {
    if (typeof document !== "undefined") {
      document.documentElement.lang = code;
    }
  } catch {}
}

function persistLang(code) {
  try {
    localStorage.setItem(STORAGE_KEY, code);
  } catch {}
}

const initialLang = readUrlLang() || readStoredLang() || readNavigatorLang() || "es";
persistLang(initialLang);
setHtmlLang(initialLang);

i18n.use(initReactI18next).init({
  resources: {
    es: { translation: es },
    en: { translation: en },
    fr: { translation: fr },
  },
  lng: initialLang,
  fallbackLng: "es",
  interpolation: { escapeValue: false },
  react: { useSuspense: false },

  // Evita mostrar null o strings vacíos
  returnEmptyString: false,
  returnNull: false,
});

i18n.on("languageChanged", (lng) => {
  const code = normalize2(lng) || "es";
  if (!SUPPORTED.includes(code)) return;
  persistLang(code);
  setHtmlLang(code);
});

export default i18n;
export { SUPPORTED, STORAGE_KEY };
