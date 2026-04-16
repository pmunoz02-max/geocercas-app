// src/pages/Errors/NotAuthorized.jsx
import { useTranslation } from "react-i18next";

export default function NotAuthorized() {
  const { t } = useTranslation();
  return (
    <div className="p-10 text-center">
      <h1 className="text-3xl font-bold mb-3 text-red-600">{t("errors.notAuthorized.title")}</h1>
      <p className="text-gray-600">
        {t("errors.notAuthorized.body")}
      </p>
    </div>
  );
}
