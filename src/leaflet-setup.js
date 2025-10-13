// src/leaflet-setup.js

import L from "leaflet";
import "leaflet/dist/leaflet.css";

// ¡PUBLICA Leaflet en el global ANTES de cargar leaflet-draw!
window.L = L;

import "leaflet-draw/dist/leaflet.draw.css";
import "leaflet-draw"; // este plugin asume que existe window.L
