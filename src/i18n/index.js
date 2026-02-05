// src/i18n/index.js
import i18n from "i18next";
import { initReactI18next } from "react-i18next";

import es from "./es.json";
import en from "./en.json";
import fr from "./fr.json";

export const SUPPORTED = ["es", "en", "fr"];
export const STORAGE_KEY = "i18nextLng";
const DEFAULT_LNG = "es";
const NS = "translation";

/* ---------------- helpers ---------------- */

function normalizeLng(input) {
  if (!input || typeof input !== "string") return null;
  const base = input.toLowerCase().split("-")[0];
  return SUPPORTED.includes(base) ? base : null;
}

function getQueryLang() {
  try {
    return normalizeLng(new URL(window.location.href).searchParams.get("lang"));
  } catch {
    return null;
  }
}

function getStoredLang() {
  try {
    return normalizeLng(localStorage.getItem(STORAGE_KEY));
  } catch {
    return null;
  }
}

function getNavigatorLang() {
  try {
    return normalizeLng(navigator.language || navigator.languages?.[0]);
  } catch {
    return null;
  }
}

export function computeInitialLanguage() {
  return (
    getQueryLang() ||
    getStoredLang() ||
    getNavigatorLang() ||
    DEFAULT_LNG
  );
}

/* ---------------- bundles ---------------- */

function hasBundle(lng) {
  return Boolean(i18n.store?.data?.[lng]?.[NS]);
}

function ensureBundles() {
  const bundles = { es, en, fr };

  for (const lng of SUPPORTED) {
    if (!hasBundle(lng)) {
      i18n.addResourceBundle(
        lng,
        NS,
        bundles[lng],
        true,  // deep
        true   // overwrite
      );
    }
  }
}

/* ---------------- persist ---------------- */

function persistLang(lng) {
  try {
    localStorage.setItem(STORAGE_KEY, lng);
    document.documentElement.lang = lng;
  } catch {}
}

/* ---------------- init ---------------- */

let initPromise = null;

export async function ensureInit(forceLng) {
  if (initPromise) {
    await initPromise;
    const lng = normalizeLng(forceLng) || computeInitialLanguage();
    if (i18n.language !== lng) await i18n.changeLanguage(lng);
    return i18n;
  }

  initPromise = (async () => {
    const lng = normalizeLng(forceLng) || computeInitialLanguage();

    if (!i18n.isInitialized) {
      await i18n
        .use(initReactI18next)
        .init({
          resources: {
            es: { [NS]: es },
            en: { [NS]: en },
            fr: { [NS]: fr },
          },
          lng,
          fallbackLng: DEFAULT_LNG,
          supportedLngs: SUPPORTED,
          ns: [NS],
          defaultNS: NS,
          interpolation: { escapeValue: false },
          react: { useSuspense: false },
        });
    }

    ensureBundles();

    if (i18n.language !== lng) {
      await i18n.changeLanguage(lng);
    }

    if (!i18n.__langListenerAttached) {
      i18n.__langListenerAttached = true;
      i18n.on("languageChanged", persistLang);
    }

    persistLang(i18n.language);

    // debug global
    window.__i18n = i18n;

    return i18n;
  })();

  return initPromise;
}

export async function setLanguage(lng) {
  const safe = normalizeLng(lng);
  if (!safe) return false;
  await ensureInit(safe);
  await i18n.changeLanguage(safe);
  return true;
}

export default i18n;
