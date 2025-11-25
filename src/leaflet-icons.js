import L from 'leaflet';

try {
  // Evita el fetch de rutas relativas rotas en producción
  delete L.Icon.Default.prototype._getIconUrl;

  L.Icon.Default.mergeOptions({
    iconRetinaUrl: new URL('leaflet/dist/images/marker-icon-2x.png', import.meta.url).toString(),
    iconUrl: new URL('leaflet/dist/images/marker-icon.png', import.meta.url).toString(),
    shadowUrl: new URL('leaflet/dist/images/marker-shadow.png', import.meta.url).toString(),
  });
} catch (e) {
  // no-op en SSR o si L no está disponible
}
