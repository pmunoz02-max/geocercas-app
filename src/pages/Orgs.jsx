// src/pages/Orgs.jsx
import { useTranslation } from 'react-i18next';

export default function Orgs() {
  const { t } = useTranslation();
  return (
    <div className="p-4">
      <h1 className="text-2xl font-semibold">{t('orgs.title')}</h1>
      <p className="text-gray-600">Módulo en construcción.</p>
    </div>
  );
}
