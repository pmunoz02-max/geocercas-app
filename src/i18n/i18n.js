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
 * 1) ?lang=es|en|fr        (NO-JS friendly, TWA/WebView)
 * 2) localStorage.app_lang
 * 3) navigator.language
 * 4) fallback: es
 *
 * FIX UNIVERSAL:
 * - Si cambia ?lang= en la URL en SPA (sin recarga), i18n se sincroniza igual.
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
    if (typeof document !== "undefined") {
      document.documentElement.lang = code;
    }
  } catch {}
}

function persistLang(code) {
  try {
    localStorage.setItem("app_lang", code);
  } catch {}
}

/* =========================
   Resolución inicial
========================= */

const initialLang = readUrlLang() || readStoredLang() || readNavigatorLang() || "es";
persistLang(initialLang);
setHtmlLang(initialLang);

/* =========================
   Init i18next
========================= */

i18n.use(initReactI18next).init({
  resources: {
    es: { translation: es },
    en: { translation: en },
    fr: { translation: fr }
  },
  lng: initialLang,
  fallbackLng: "es",
  interpolation: { escapeValue: false },
  react: { useSuspense: false },
  returnEmptyString: false,
  returnNull: false
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

// Back/forward
try {
  if (typeof window !== "undefined") {
    window.addEventListener("popstate", syncFromUrl);
  }
} catch {}

// Hook pushState/replaceState (React Router)
try {
  if (typeof window !== "undefined" && window.history) {
    const _pushState = window.history.pushState;
    const _replaceState = window.history.replaceState;

    window.history.pushState = function () {
      // eslint-disable-next-line prefer-rest-params
      const ret = _pushState.apply(window.history, arguments);
      syncFromUrl();
      return ret;
    };

    window.history.replaceState = function () {
      // eslint-disable-next-line prefer-rest-params
      const ret = _replaceState.apply(window.history, arguments);
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
