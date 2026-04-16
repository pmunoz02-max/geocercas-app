import React from 'react';
import { useTranslation } from 'react-i18next';
import GeoMap from '@/components/GeoMap'; // <-- nombre y ruta correctos

export default function GeocercasIndex() {
  const { t } = useTranslation();
  return (
    <section className="space-y-3">
      <h1 className="text-lg font-semibold">{t('geocercas.pageTitle')}</h1>
      <GeoMap />
    </section>
  );
}
