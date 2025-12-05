import L from "leaflet";
import "@geoman-io/leaflet-geoman-free";
import "@geoman-io/leaflet-geoman-free/dist/leaflet-geoman.css";

// Solo para ver en consola que se cargó:
console.log("Leaflet-Geoman cargado, pm existe?", !!L.Map.prototype.pm);
