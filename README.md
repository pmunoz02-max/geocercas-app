# Geocercas App (Starter)
React + Leaflet + Leaflet.Draw + Tailwind (Vite). Sin Google Sheets.

## Requisitos
- Node.js 18+
- npm 9+

## Uso
```bash
npm install
npm run dev
# abre la URL que te muestra (p. ej. http://localhost:5173)
```

### Probar datos
- En la UI, usa **Importar CSV Tracker** y selecciona `samples/tracker.csv`.
- Usa **Importar GeoJSON** y selecciona `samples/geocercas.geojson`.

### Construir para producción
```bash
npm run build
npm run preview
```

## Siguientes pasos
- Conectar a backend (Supabase + PostGIS) y exponer OpenAPI para Actions de ChatGPT.
