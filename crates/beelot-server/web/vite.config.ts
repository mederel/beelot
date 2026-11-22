// The frontend's build (ADR-007): Svelte and Tailwind into ../static, with fixed file names, no inline script or style,
// and a service worker that lists every file it writes. The dev server proxies the API to the Rust server.
import { fileURLToPath } from "node:url";
import { svelte } from "@sveltejs/vite-plugin-svelte";
import tailwindcss from "@tailwindcss/vite";
import { defineConfig } from "vitest/config";
import { serviceWorker } from "./build/service-worker.ts";

const server = process.env.BEELOT_SERVER ?? "http://localhost:8080";

export default defineConfig({
  plugins: [tailwindcss(), svelte(), serviceWorker()],
  resolve: {
    alias: { $lib: fileURLToPath(new URL("./src/lib", import.meta.url)) }
  },
  build: {
    outDir: "../static",
    emptyOutDir: true,
    target: "es2022",
    cssCodeSplit: false,
    modulePreload: { polyfill: false },
    reportCompressedSize: false,
    rolldownOptions: {
      output: {
        entryFileNames: "app.js",
        chunkFileNames: "chunks/[name].js",
        assetFileNames: (asset) => (asset.names?.[0]?.endsWith(".css") ? "app.css" : "assets/[name][extname]")
      }
    }
  },
  server: {
    proxy: {
      "/api": { target: server, changeOrigin: false },
      "/.well-known": server
    }
  },
  test: {
    environment: "happy-dom",
    include: ["src/**/*.test.ts", "tests/**/*.test.{ts,js}"],
    restoreMocks: true
  }
});
