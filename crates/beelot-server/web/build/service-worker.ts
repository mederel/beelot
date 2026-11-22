// Writes /sw.js at the end of the build: the template with every file of the build and of public/ (but the music), and a
// cache name made from their content, so that a new build replaces the old copies and an identical one changes nothing.
import { createHash } from "node:crypto";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import type { Plugin } from "vite";

const TEMPLATE = new URL("./sw-template.js", import.meta.url);

function publicFiles(dir: string): string[] {
  const found: string[] = [];
  const walk = (folder: string) => {
    for (const name of readdirSync(folder).sort()) {
      const path = join(folder, name);
      if (statSync(path).isDirectory()) walk(path);
      else found.push(path);
    }
  };
  walk(dir);
  return found;
}

// The files the offline shell keeps: the page at "/", then every file but the music, sorted.
export function shellFiles(names: string[]): string[] {
  const files = names.map((name) => `/${name.replace(/\\/g, "/")}`).filter((path) => path !== "/index.html" && path !== "/sw.js" && !path.startsWith("/music/"));
  return ["/", ...[...new Set(files)].sort()];
}

export function serviceWorker(): Plugin {
  let publicDir = "";
  return {
    name: "beelot-service-worker",
    apply: "build",
    enforce: "post",
    configResolved(config) {
      publicDir = config.publicDir;
    },
    generateBundle(_options, bundle) {
      const hash = createHash("sha256");
      const names: string[] = [];
      for (const name of Object.keys(bundle).sort()) {
        const item = bundle[name];
        names.push(name);
        hash.update(name);
        hash.update(item.type === "chunk" ? item.code : typeof item.source === "string" ? item.source : Buffer.from(item.source));
      }
      if (publicDir) {
        for (const path of publicFiles(publicDir)) {
          const name = relative(publicDir, path);
          names.push(name);
          if (!name.startsWith("music/")) {
            hash.update(name);
            hash.update(readFileSync(path));
          }
        }
      }
      const source = readFileSync(TEMPLATE, "utf8")
        .replace("__CACHE__", `beelot-shell-${hash.digest("hex").slice(0, 12)}`)
        .replace("__FILES__", JSON.stringify(shellFiles(names), null, 2));
      this.emitFile({ type: "asset", fileName: "sw.js", source });
    }
  };
}
