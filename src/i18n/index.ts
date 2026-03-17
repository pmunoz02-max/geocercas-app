import i18n from "i18next";
import { initReactI18next } from "react-i18next";

import { es } from "./locales/es";
import { en } from "./locales/en";
import { fr } from "./locales/fr";

i18n
  .use(initReactI18next)
  .init({
    resources: {
      es: { translation: es },
      en: { translation: en },
      fr: { translation: fr },
    },
    lng: "es", // 👈 DEFAULT FORZADO
    fallbackLng: "es",
    interpolation: {
      escapeValue: false,
    },
  });

export default i18n;