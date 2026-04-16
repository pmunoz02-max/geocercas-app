// src/i18n/i18n.js
import i18n from "i18next";
import { initReactI18next } from "react-i18next";

import es from "./es.json";
import en from "./en.json";
import fr from "./fr.json";

const SUPPORTED = ["es", "en", "fr"];

function normalizeLang(value) {
  const v = String(value || "").toLowerCase().slice(0, 2);
  return SUPPORTED.includes(v) ? v : null;
}

function readUrlLang() {
  try {
    if (typeof window === "undefined") return null;
    return normalizeLang(new URL(window.location.href).searchParams.get("lang"));
  } catch {
    return null;
  }
}

function readStoredLang() {
  try {
    if (typeof localStorage === "undefined") return null;
    return normalizeLang(localStorage.getItem("app_lang"));
  } catch {
    return null;
  }
}

function readNavigatorLang() {
  try {
    if (typeof navigator === "undefined") return null;
    return normalizeLang(navigator.language);
  } catch {
    return null;
  }
}

function persistLang(code) {
  try {
    if (typeof localStorage !== "undefined") {
      localStorage.setItem("app_lang", code);
    }
  } catch {}
}

function setHtmlLang(code) {
  try {
    if (typeof document !== "undefined") {
      document.documentElement.lang = code;
    }
  } catch {}
}

const initialLang =
  readUrlLang() ||
  readStoredLang() ||
  readNavigatorLang() ||
  "es";

persistLang(initialLang);
setHtmlLang(initialLang);

i18n.use(initReactI18next).init({
  resources: {
    es: { translation: es },
    en: { translation: en },
    fr: { translation: fr },
  },

  lng: initialLang,

  fallbackLng: (code) => {
    const lang = normalizeLang(code) || "es";
    if (lang === "fr") return ["fr", "en", "es"];
    if (lang === "en") return ["en", "es"];
    return ["es"];
  },

  supportedLngs: SUPPORTED,
  load: "languageOnly",
  nonExplicitSupportedLngs: true,

  interpolation: {
    escapeValue: false,
  },

  react: {
    useSuspense: false,
  },

  saveMissing: true,

  missingKeyHandler(lng, ns, key) {
    if (import.meta.env.DEV) {
      console.warn(`[i18n missing] lang=${lng} key=${key}`);
    }
  },

  returnEmptyString: false,
  returnNull: false,
});

i18n.on("languageChanged", (lng) => {
  const code = normalizeLang(lng);
  if (!code) return;
  persistLang(code);
  setHtmlLang(code);
});

if (import.meta.env.DEV) {
  const originalT = i18n.t.bind(i18n);

  i18n.t = function (key, options = {}) {
    const result = originalT(key, options);
    const lang = normalizeLang(i18n.language) || "es";
    const fallbackChain = i18n.options.fallbackLng(lang);

    for (const fallbackLang of fallbackChain) {
      const exists = i18n.exists(key, { lng: fallbackLang });
      if (exists && fallbackLang !== lang) {
        console.warn(`[i18n fallback] ${lang} -> ${fallbackLang} | key: ${key}`);
        break;
      }
    }

    return result;
  };
}

export default i18n;