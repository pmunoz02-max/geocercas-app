// src/i18n/index.js
import i18n from "i18next";
import { initReactI18next } from "react-i18next";

import es from "./es.json";
import en from "./en.json";
import fr from "./fr.json";

export const SUPPORTED = ["es", "en", "fr"];
const STORAGE_KEY = "i18nextLng";

const norm2 = (v) => String(v || "").toLowerCase().slice(0, 2);
const isOk = (v) => SUPPORTED.includes(norm2(v));

function readUrlLang() {
  try {
    const url = new URL(window.location.href);
    const v = url.searchParams.get("lang");
    return isOk(v) ? norm2(v) : null;
  } catch {
    return null;
  }
}

function readStoredLang() {
  try {
    const v = localStorage.getItem(STORAGE_KEY);
    return isOk(v) ? norm2(v) : null;
  } catch {
    return null;
  }
}

function readNavigatorLang() {
  try {
    const v = navigator.language;
    return isOk(v) ? norm2(v) : null;
  } catch {
    return null;
  }
}

function persistLang(code) {
  const c = isOk(code) ? norm2(code) : "es";
  try {
    localStorage.setItem(STORAGE_KEY, c);
  } catch {}
  try {
    document.documentElement.lang = c;
  } catch {}
  return c;
}

const initial = persistLang(readUrlLang() || readStoredLang() || readNavigatorLang() || "es");

i18n.use(initReactI18next).init({
  resources: {
    es: { translation: es },
    en: { translation: en },
    fr: { translation: fr },
  },

  // 🔒 clave para fr-FR / en-US
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

i18n.on("languageChanged", (lng) => {
  persistLang(lng);
});

// Debug (temporal)
if (typeof window !== "undefined") {
  window.__i18n = i18n;
}

export default i18n;
