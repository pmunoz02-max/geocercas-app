// src/buildMarker.js
export const BUILD_MARKER = "preview-7db5d01";

if (typeof window !== "undefined") {
  // visible en consola para confirmar deploy real
  console.log("[BUILD_MARKER]", BUILD_MARKER);
}