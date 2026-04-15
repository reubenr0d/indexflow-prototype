#!/usr/bin/env node
// Replaces __SW_BUILD_STAMP__ in public/sw.js with a unique build identifier
// so each deployment gets a fresh service-worker cache namespace.

import { readFileSync, writeFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { execSync } from "node:child_process";

const __dirname = dirname(fileURLToPath(import.meta.url));
const swPath = resolve(__dirname, "../apps/web/public/sw.js");

let stamp;
try {
  stamp = execSync("git rev-parse --short HEAD", { encoding: "utf-8" }).trim();
} catch {
  stamp = Date.now().toString(36);
}

const src = readFileSync(swPath, "utf-8");
writeFileSync(swPath, src.replace(/__SW_BUILD_STAMP__/g, stamp));
console.log(`sw.js: stamped CACHE_VERSION with ${stamp}`);
