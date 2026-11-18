import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "path";
import { readdirSync, readFileSync } from "node:fs";

function previewResources() {
  const source = path.resolve(__dirname, "preview-resources/nov2026");
  return {
    name: "preview-resources",
    apply: "build",
    generateBundle() {
      for (const filename of readdirSync(source)) {
        this.emitFile({
          type: "asset",
          fileName: `resources/preview-nov2026/${filename}`,
          source: readFileSync(path.join(source, filename)),
        });
      }
    },
  };
}

export default defineConfig(() => {
  const DEBUG_BUILD = process.env.VITE_DEBUG_BUILD === "1";
  const isPreview = process.env.VERCEL_ENV === "preview";

  const BUILD_SHA =
    process.env.VERCEL_GIT_COMMIT_SHA ||
    process.env.VERCEL_GITHUB_COMMIT_SHA ||
    process.env.VERCEL_GITLAB_COMMIT_SHA ||
    "local";

  return {
    plugins: [react(), ...(isPreview ? [previewResources()] : [])],

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

    test: {
      environment: "jsdom",
      globals: true,
      setupFiles: ["./src/test/setup.js"],
      css: false,
      include: [
        "src/**/*.test.{js,jsx,ts,tsx}",
      ],
    },

    // --- Build config: preview vs producción ---
    build: {
      sourcemap: isPreview,
      minify: isPreview ? false : "esbuild",
      target: "es2020",
    },

    esbuild: {
      keepNames: DEBUG_BUILD,
    },
  };
});
