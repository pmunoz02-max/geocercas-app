// src/i18n/index.js
import i18n from "i18next";
import { initReactI18next } from "react-i18next";

import es from "./es.json";
import en from "./en.json";
import fr from "./fr.json";

/**
 * i18n BLINDADO – ÚNICA fuente de verdad
 *
 * Lee (en orden):
 * 1) ?lang=es|en|fr
 * 2) localStorage.i18nextLng
 * 3) localStorage.app_lang (legacy / compat)
 * 4) navigator.language
 * 5) fallback: es
 *
 * Guarda SIEMPRE:
 * - localStorage.i18nextLng
 * - localStorage.app_lang  (compat)
 * - document.documentElement.lang
 */

export const SUPPORTED = ["es", "en", "fr"];
const KEY_MAIN = "i18nextLng";
const KEY_COMPAT = "app_lang";

function norm2(v) {
  return String(v || "").toLowerCase().slice(0, 2);
}

function ensureSupported(code) {
  const c = norm2(code);
  return SUPPORTED.includes(c) ? c : null;
}

function readUrlLang() {
  try {
    const url = new URL(window.location.href);
    return ensureSupported(url.searchParams.get("lang"));
  } catch {
    return null;
  }
}

function readLocal(key) {
  try {
    return ensureSupported(localStorage.getItem(key));
  } catch {
    return null;
  }
}

function readNavigatorLang() {
  try {
    return ensureSupported(navigator.language);
  } catch {
    return null;
  }
}

function persistLang(code) {
  const c = ensureSupported(code) || "es";
  try {
    localStorage.setItem(KEY_MAIN, c);
    localStorage.setItem(KEY_COMPAT, c);
  } catch {}
  try {
    document.documentElement.lang = c;
  } catch {}
  return c;
}

const initial = persistLang(
  readUrlLang() ||
    readLocal(KEY_MAIN) ||
    readLocal(KEY_COMPAT) ||
    readNavigatorLang() ||
    "es"
);

i18n.use(initReactI18next).init({
  resources: {
    es: { translation: es },
    en: { translation: en },
    fr: { translation: fr },
  },

  // 🔒 Acepta fr-FR / en-US / es-EC y normaliza
  supportedLngs: SUPPORTED,
  nonExplicitSupportedLngs: true,
  load: "languageOnly",

  lng: initial,
  fallbackLng: "es",

  interpolation: { escapeValue: false },
  react: { useSuspense: false },

  returnEmptyString: false,
  returnNull: false,
});

// Persistencia garantizada
i18n.on("languageChanged", (lng) => {
  persistLang(lng);
});

// (Opcional) expone para debug. Puedes borrarlo luego.
if (typeof window !== "undefined") {
  window.__i18n = i18n;
}

export default i18n;
