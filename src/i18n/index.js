import i18n from "i18next";
import { initReactI18next } from "react-i18next";

import es from "./es.json";
import en from "./en.json";
import fr from "./fr.json";

i18n
  .use(initReactI18next)
  .init({
    resources: {
      es: { translation: es },
      en: { translation: en },
      fr: { translation: fr },
    },

    lng: "es",
    fallbackLng: "en",

    supportedLngs: ["es", "en", "fr"],
    load: "languageOnly",          // 🔴 CLAVE
    nonExplicitSupportedLngs: true,

    interpolation: {
      escapeValue: false,
    },
  });

export default i18n;
