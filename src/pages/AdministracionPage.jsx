import { useTranslation } from 'react-i18next';

export default function AdministracionPage() {
  const { t } = useTranslation();
  return (
    <section className="max-w-6xl mx-auto">
      <h1 className="text-2xl font-semibold mb-2">{t('dashboard.administracion.title')}</h1>
      <p className="text-gray-700">
        Pantalla temporal. Aquí irá tu módulo de organizaciones, roles y configuración.
      </p>
    </section>
  );
}
