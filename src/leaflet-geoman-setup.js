import L from "leaflet";

// Necesario en Vite/ESM: el plugin se cuelga de window.L
if (typeof window !== "undefined") {
  // solo la 1ª vez
  if (!window.L) window.L = L;
}

// Importa el plugin y su CSS DESPUÉS de definir window.L
import "@geoman-io/leaflet-geoman-free";
import "@geoman-io/leaflet-geoman-free/dist/leaflet-geoman.css";
