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

function normalizeLng(input) {
  if (!input || typeof input !== "string") return null;
  const raw = input.trim().toLowerCase();

  // acepta "en-US" -> "en"
  const base = raw.split("-")[0];
  if (SUPPORTED.includes(base)) return base;
  return null;
}

function getQueryLang() {
  try {
    const url = new URL(window.location.href);
    return normalizeLng(url.searchParams.get("lang"));
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
    const nav = navigator.language || (navigator.languages && navigator.languages[0]);
    return normalizeLng(nav);
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

function ensureBundles() {
  // Importante: SIEMPRE asegurar que los 3 idiomas estén cargados
  // deep=true, overwrite=true para reinyectar si alguien inicializó mal antes
  const bundles = { es, en, fr };
  for (const lng of SUPPORTED) {
    const res = bundles[lng];
    if (!res) continue;

    if (!i18n.hasResourceBundle(lng, NS)) {
      i18n.addResourceBundle(lng, NS, res, true, true);
    } else {
      // reinyecta por si estaba incompleto
      i18n.addResourceBundle(lng, NS, res, true, true);
    }
  }
}

function applyHtmlLang(lng) {
  try {
    document.documentElement.lang = lng || DEFAULT_LNG;
  } catch {
    // ignore
  }
}

function persistLang(lng) {
  try {
    localStorage.setItem(STORAGE_KEY, lng);
  } catch {
    // ignore
  }
}

let _initPromise = null;

export async function ensureInit(forceLanguage) {
  if (_initPromise) {
    // si ya hay init en curso, espera y luego aplica idioma
    await _initPromise;
    ensureBundles();
    const lng = normalizeLng(forceLanguage) || computeInitialLanguage();
    if (i18n.language !== lng) await i18n.changeLanguage(lng);
    return i18n;
  }

  _initPromise = (async () => {
    // Si alguien inicializó i18n ANTES que este módulo:
    // - no reiniciamos (evita warnings y duplicación)
    // - pero SÍ reinyectamos bundles y forzamos opciones clave
    ensureBundles();

    const lng = normalizeLng(forceLanguage) || computeInitialLanguage();

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
          nonExplicitSupportedLngs: true,
          ns: [NS],
          defaultNS: NS,
          interpolation: { escapeValue: false },
          react: {
            useSuspense: false,
          },
          // Evita comportamientos raros con claves vacías
          returnEmptyString: false,
        });
    } else {
      // Ya inicializado: asegura bundles y opciones importantes
      ensureBundles();
      i18n.options = {
        ...i18n.options,
        fallbackLng: DEFAULT_LNG,
        supportedLngs: SUPPORTED,
        nonExplicitSupportedLngs: true,
        ns: [NS],
        defaultNS: NS,
        returnEmptyString: false,
      };

      if (i18n.language !== lng) {
        await i18n.changeLanguage(lng);
      }
    }

    // Listener único (evita duplicados)
    if (!i18n.__geocercasLangListenerAttached) {
      i18n.__geocercasLangListenerAttached = true;

      i18n.on("languageChanged", (newLng) => {
        const safe = normalizeLng(newLng) || DEFAULT_LNG;
        persistLang(safe);
        applyHtmlLang(safe);
      });
    }

    // Set inicial html lang + persist (por si se inicia con querylang)
    persistLang(i18n.language);
    applyHtmlLang(i18n.language);

    // Debug global para tu checklist
    try {
      window.__i18n = i18n;
    } catch {
      // ignore
    }

    return i18n;
  })();

  return _initPromise;
}

export async function setLanguage(lng) {
  const safe = normalizeLng(lng);
  if (!safe) return false;
  await ensureInit(safe);
  if (i18n.language !== safe) await i18n.changeLanguage(safe);
  return true;
}

export default i18n;
