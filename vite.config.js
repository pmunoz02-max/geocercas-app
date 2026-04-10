import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "path";

export default defineConfig(() => {
  const DEBUG_BUILD = process.env.VITE_DEBUG_BUILD === "1";

  const BUILD_SHA =
    process.env.VERCEL_GIT_COMMIT_SHA ||
    process.env.VERCEL_GITHUB_COMMIT_SHA ||
    process.env.VERCEL_GITLAB_COMMIT_SHA ||
    "local";

  return {
    plugins: [react()],

    resolve: {
      alias: {
        "@": path.resolve(__dirname, "./src"),
        process: "process/browser",
      },
      dedupe: ["react", "react-dom", "react-router-dom"],
    },

    define: {
      "process.env": {},
      global: "window",
      __TG_BUILD_SHA__: JSON.stringify(BUILD_SHA),
    },


    // --- Build config: preview vs producción ---
    build: {
      sourcemap: process.env.VERCEL_ENV === "preview" ? true : false,
      minify: process.env.VERCEL_ENV === "preview" ? false : "esbuild",
      target: "es2020",
    },

    esbuild: {
      keepNames: DEBUG_BUILD,
    },
  };
});