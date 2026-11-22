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
    alias: { $lib: fileURLToPath(new URL("./src/lib", import.meta.url)) },
    // The tests mount components in a DOM, so Svelte must resolve to its browser build there.
    conditions: process.env.VITEST ? ["browser"] : undefined
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
        // Every file the build writes is named after its content (US-191): the server keeps them forever, and a new build
        // is a new name. Only `index.html`, the service worker and what is copied from public/ keep their names.
        entryFileNames: "assets/app-[hash].js",
        chunkFileNames: "assets/[name]-[hash].js",
        assetFileNames: "assets/[name]-[hash][extname]"
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
    // A link the router leaves to the browser must not start a real navigation (and a request) in a test.
    environmentOptions: { happyDOM: { settings: { navigation: { disableMainFrameNavigation: true } } } },
    setupFiles: ["./tests/setup.ts"],
    // The first test of a file that mounts the page loads its whole component tree.
    testTimeout: 20000,
    include: ["src/**/*.test.ts", "tests/**/*.test.{ts,js}"],
    restoreMocks: true
  }
});
