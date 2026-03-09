// src/i18n/i18n.js
import i18n from "i18next";
import { initReactI18next } from "react-i18next";

import es from "./es.json";
import en from "./en.json";
import fr from "./fr.json";

/**
 * i18n BLINDADO – App Geocercas
 *
 * Prioridad de idioma:
 * 1) ?lang=es|en|fr
 * 2) localStorage.app_lang
 * 3) navigator.language
 * 4) fallback: es
 */

const SUPPORTED = ["es", "en", "fr"];

/* =========================
   Helpers
========================= */

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
    if (typeof localStorage === "undefined") return null;
    const v = (localStorage.getItem("app_lang") || "").toLowerCase().slice(0, 2);
    return SUPPORTED.includes(v) ? v : null;
  } catch {
    return null;
  }
}

function readNavigatorLang() {
  try {
    if (typeof navigator === "undefined") return null;
    const v = (navigator.language || "").toLowerCase().slice(0, 2);
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
    if (typeof localStorage !== "undefined") {
      localStorage.setItem("app_lang", code);
    }
  } catch {}
}

/* =========================
   Resolución inicial
========================= */

const initialLang =
  readUrlLang() ||
  readStoredLang() ||
  readNavigatorLang() ||
  "es";

persistLang(initialLang);
setHtmlLang(initialLang);

/* =========================
   Init i18next
========================= */

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

  returnEmptyString: false,
  returnNull: false,
});

/* =========================
   Sync permanente con URL (?lang=)
========================= */

function syncFromUrl() {
  try {
    if (typeof window === "undefined") return;

    const urlLang = readUrlLang();
    if (!urlLang) return;

    const current = String(i18n.language || "es").toLowerCase().slice(0, 2);
    if (urlLang === current) return;

    i18n.changeLanguage(urlLang);
    persistLang(urlLang);
    setHtmlLang(urlLang);
  } catch {
    // ignore
  }
}

// Al cargar
syncFromUrl();

// Back / forward
try {
  if (typeof window !== "undefined") {
    window.addEventListener("popstate", syncFromUrl);
  }
} catch {
  // ignore
}

// Hook pushState / replaceState
try {
  if (typeof window !== "undefined" && window.history) {
    const originalPushState = window.history.pushState;
    const originalReplaceState = window.history.replaceState;

    window.history.pushState = function (...args) {
      const ret = originalPushState.apply(window.history, args);
      syncFromUrl();
      return ret;
    };

    window.history.replaceState = function (...args) {
      const ret = originalReplaceState.apply(window.history, args);
      syncFromUrl();
      return ret;
    };
  }
} catch {
  // ignore
}

/* =========================
   Persistencia al cambiar idioma
========================= */

i18n.on("languageChanged", (lng) => {
  const code = String(lng || "es").toLowerCase().slice(0, 2);
  if (!SUPPORTED.includes(code)) return;

  persistLang(code);
  setHtmlLang(code);
});

export default i18n;