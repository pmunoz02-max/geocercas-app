import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "path";

export default defineConfig(() => {
  const DEBUG_BUILD = process.env.VITE_DEBUG_BUILD === "1";

  return {
    plugins: [react()],

    resolve: {
      alias: {
        "@": path.resolve(__dirname, "./src"),
        process: "process/browser",
      },
    },

    define: {
      "process.env": {},
      global: "window",
    },

    build: {
      sourcemap: true,

      // 🔥 CLAVE: para un deploy diagnóstico
      minify: DEBUG_BUILD ? false : "esbuild",

      // ayuda a que nombres sobrevivan un poco más
      target: "es2020",
    },

    esbuild: {
      // mantiene nombres de funciones/clases en debug
      keepNames: DEBUG_BUILD,
    },
  };
});
