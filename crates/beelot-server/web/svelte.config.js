// Svelte compiles the components; Vite's plugin extracts their CSS to the stylesheet (the CSP allows no inline style).
import { vitePreprocess } from "@sveltejs/vite-plugin-svelte";

export default {
  preprocess: vitePreprocess(),
  compilerOptions: {
    runes: true
  }
};
