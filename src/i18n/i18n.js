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

function getLangFromUrl() {
  const params = new URLSearchParams(window.location.search);
  const lang = params.get("lang");
  return SUPPORTED.includes(lang) ? lang : null;
}

function logI18n(stage, extra = {}) {
  const urlLang = getLangFromUrl();
  const storedLang = localStorage.getItem("app_lang");
  console.log(`[i18n][${stage}]`, {
    urlLang,
    storedLang,
    currentI18nLang: i18n.language,
    resolvedLanguage: i18n.resolvedLanguage,
    ...extra,
  });
}

const initialLang =
  normalizeLang(getLangFromUrl()) ||
  normalizeLang(readStoredLang()) ||
  "es";
logI18n("before-init", { initialLang });

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

setTimeout(() => {
  const urlLang = readUrlLang();
  const finalLang = normalizeLang(urlLang || i18n.language) || "es";

  logI18n("post-init-lock", { finalLang });

  if (i18n.resolvedLanguage !== finalLang) {
    i18n.changeLanguage(finalLang);
  }
}, 0);

i18n.on("languageChanged", (lng) => {
  logI18n("languageChanged", { changedTo: lng, stack: new Error().stack });
  localStorage.setItem("app_lang", lng);
  const code = normalizeLang(lng);
  if (!code) return;
  persistLang(code);
  setHtmlLang(code);
});

i18n.on("initialized", (opts) => {
  logI18n("initialized", { opts });
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

export function applyLanguageSafely(nextLang) {
  const safeLang = normalizeLang(nextLang) || "es";
  const current = i18n.resolvedLanguage || i18n.language;

  logI18n("applyLanguageSafely:start", { nextLang: safeLang, current });

  if (current === safeLang) {
    logI18n("applyLanguageSafely:skip", { reason: "same-language" });
    return;
  }

  i18n.changeLanguage(safeLang);
}

export default i18n;