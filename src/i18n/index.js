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

function computeInitial() {
  return persistLang(readUrlLang() || readStoredLang() || readNavigatorLang() || "es");
}

// ✅ SIEMPRE asegura bundles (aunque i18n ya esté inicializado por otro lado)
function ensureBundles() {
  // deep=true, overwrite=true para “forzar” que queden iguales a tus JSON
  i18n.addResourceBundle("es", "translation", es, true, true);
  i18n.addResourceBundle("en", "translation", en, true, true);
  i18n.addResourceBundle("fr", "translation", fr, true, true);
}

function ensureInit() {
  const initial = computeInitial();

  // Si ya existe init previo, NO re-init: solo asegura bundles + opciones clave
  if (i18n.isInitialized) {
    ensureBundles();

    // refuerza settings importantes por si el init previo era distinto
    i18n.options.supportedLngs = SUPPORTED;
    i18n.options.nonExplicitSupportedLngs = true;
    i18n.options.load = "languageOnly";
    i18n.options.fallbackLng = "es";

    // asegura que el idioma actual sea válido
    const lng = isOk(i18n.language) ? norm2(i18n.language) : initial;
    if (norm2(i18n.language) !== lng) i18n.changeLanguage(lng);

    return;
  }

  i18n.use(initReactI18next).init({
    resources: {
      es: { translation: es },
      en: { translation: en },
      fr: { translation: fr },
    },
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
}

// ✅ Listener único (sin duplicar)
function onLanguageChanged(lng) {
  persistLang(lng);
}

function ensureListeners() {
  try {
    i18n.off("languageChanged", onLanguageChanged);
  } catch {}
  i18n.on("languageChanged", onLanguageChanged);
}

ensureInit();
ensureBundles();
ensureListeners();

// Debug
if (typeof window !== "undefined") {
  window.__i18n = i18n;
}

export default i18n;
