const DEBUG_I18N =
  import.meta.env.DEV &&
  import.meta.env.MODE === "development" &&
  import.meta.env.VITE_ENABLE_I18N_DEBUG === "true";
// Auxiliar para resolver fallbackLng correctamente
function resolveFallbackLng(i18nInstance) {
  const fallbackLng = i18nInstance?.options?.fallbackLng;

  if (typeof fallbackLng === "function") {
    const resolved = fallbackLng(i18nInstance.language);
    if (Array.isArray(resolved)) return resolved[0] || "es";
    if (typeof resolved === "string") return resolved;
    if (resolved && typeof resolved === "object") {
      if (Array.isArray(resolved.default)) return resolved.default[0] || "es";
      if (typeof resolved.default === "string") {
        if (resolved.default.length === 1) return "es";
        return resolved.default;
      }
      return "es";
    }
    return "es";
  }

  if (Array.isArray(fallbackLng)) {
    return fallbackLng[0] || "es";
  }

  if (typeof fallbackLng === "string") {
    return fallbackLng;
  }

  if (fallbackLng && typeof fallbackLng === "object") {
    const current = i18nInstance.language;
    const byCurrent = fallbackLng[current];

    if (Array.isArray(byCurrent)) return byCurrent[0] || "es";
    if (typeof byCurrent === "string") return byCurrent;

    if (Array.isArray(fallbackLng.default)) return fallbackLng.default[0] || "es";
    if (typeof fallbackLng.default === "string") {
      if (fallbackLng.default.length === 1) return "es";
      return fallbackLng.default;
    }
  }

  return "es";
}
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

function logI18n(...args) {
  if (DEBUG_I18N) {
    console.log("[i18n]", ...args);
  }
}


const getInitialLang = () => {
  const params = new URLSearchParams(window.location.search);
  const lang = params.get("lang");
  return ["es", "en", "fr"].includes(lang) ? lang : "es";
};
const initialLang = getInitialLang();
logI18n("before-init", { initialLang });
setHtmlLang(initialLang);

// debug solo en desarrollo local y si VITE_ENABLE_I18N_DEBUG === 'true'
i18n.use(initReactI18next).init({
  debug: false,
  showSupportNotice: false,
  resources: {
    es: { translation: es },
    en: { translation: en },
    fr: { translation: fr },
  },

  lng: getInitialLang(),

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

i18n.on("languageChanged", (lng) => {
  const code = normalizeLang(lng);
  if (!code) return;
  setHtmlLang(code);
  if (DEBUG_I18N) logI18n("languageChanged", { changedTo: code });
});

i18n.on("initialized", (opts) => {
  if (DEBUG_I18N) logI18n("initialized", { opts });
});

if (import.meta.env.DEV) {
  const originalT = i18n.t.bind(i18n);

  i18n.t = function (key, options = {}) {
    const result = originalT(key, options);
    const lang = normalizeLang(i18n.language) || "es";
    const fallbackLng = resolveFallbackLng(i18n);
    // fallbackLng puede ser string o array
    const fallbackChain = Array.isArray(fallbackLng) ? fallbackLng : [fallbackLng];

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

  if (DEBUG_I18N) logI18n("applyLanguageSafely:start", { nextLang: safeLang, current });

  if (current === safeLang) {
    if (DEBUG_I18N) logI18n("applyLanguageSafely:skip", { reason: "same-language" });
    return;
  }

  i18n.changeLanguage(safeLang);
}

export default i18n;