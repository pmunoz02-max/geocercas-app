import i18n from "i18next";
import { initReactI18next } from "react-i18next";

import es from "./es.json";
import en from "./en.json";
import fr from "./fr.json";

/**
 * i18n v2 (BLINDADO)
 * Prioridad:
 * 1) ?lang=es|en|fr (sin depender de JS; útil en WebView/TWA)
 * 2) localStorage.app_lang
 * 3) navigator.language
 * 4) fallback: es
 */

const SUPPORTED = ["es", "en", "fr"];

function readUrlLang() {
  try {
    if (typeof window === "undefined") return null;
    const url = new URL(window.location.href);
    const v = (url.searchParams.get("lang") || "").toLowerCase().slice(0, 2);
    return SUPPORTED.includes(v) ? v : null;
  } catch {
    return null;
  }
}

function readStoredLang() {
  try {
    const v = (localStorage.getItem("app_lang") || "").toLowerCase().slice(0, 2);
    return SUPPORTED.includes(v) ? v : null;
  } catch {
    return null;
  }
}

function readNavigatorLang() {
  try {
    const v = (navigator.language || "").toLowerCase().slice(0, 2);
    return SUPPORTED.includes(v) ? v : null;
  } catch {
    return null;
  }
}

function setHtmlLang(code) {
  try {
    if (typeof document !== "undefined") document.documentElement.lang = code;
  } catch {}
}

function persistLang(code) {
  try {
    localStorage.setItem("app_lang", code);
  } catch {}
}

const initial = readUrlLang() || readStoredLang() || readNavigatorLang() || "es";
persistLang(initial);
setHtmlLang(initial);

i18n.use(initReactI18next).init({
  resources: {
    es: { translation: es },
    en: { translation: en },
    fr: { translation: fr },
  },
  lng: initial,
  fallbackLng: "es",
  interpolation: { escapeValue: false },
  react: { useSuspense: false },
  returnEmptyString: false,
  returnNull: false,
});

i18n.on("languageChanged", (lng) => {
  const code = String(lng || "es").toLowerCase().slice(0, 2);
  if (!SUPPORTED.includes(code)) return;
  persistLang(code);
  setHtmlLang(code);
});

export default i18n;
