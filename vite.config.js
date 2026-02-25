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

      // 🔥 EVITA duplicación de React/Context por resolver copias distintas
      dedupe: ["react", "react-dom", "react-router-dom"],
    },

    define: {
      "process.env": {},
      global: "window",
    },

    build: {
      sourcemap: true,
      minify: DEBUG_BUILD ? false : "esbuild",
      target: "es2020",
    },

    esbuild: {
      keepNames: DEBUG_BUILD,
    },
  };
});