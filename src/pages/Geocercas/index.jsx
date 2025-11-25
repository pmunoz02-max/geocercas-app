import React from 'react';
import GeoMap from '@/components/GeoMap'; // <-- nombre y ruta correctos

export default function GeocercasIndex() {
  return (
    <section className="space-y-3">
      <h1 className="text-lg font-semibold">Geocercas</h1>
      <GeoMap />
    </section>
  );
}
