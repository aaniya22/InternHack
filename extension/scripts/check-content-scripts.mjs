// Fails the build if a content script bundle contains an ESM import.
//
// MV3 content scripts are injected as classic scripts, so a top-level `import`
// throws "Cannot use import statement outside a module" and the whole in-page
// panel silently dies. Rollup emits one as soon as a module is shared between a
// content script entry and another entry (popup / background): the fix is to
// stop the content script importing that module (route it through a background
// message instead), not to ignore this check.
import { readFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join, resolve } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));
const assets = resolve(here, "..", "dist", "assets");

// Keep in sync with the content_scripts entries in public/manifest.json.
const CONTENT_BUNDLES = ["content.js", "bridge.js"];

const failures = [];
for (const file of CONTENT_BUNDLES) {
  const path = join(assets, file);
  if (!existsSync(path)) {
    failures.push(`${file}: missing from dist/assets`);
    continue;
  }
  const source = readFileSync(path, "utf8");
  const match = source.match(/(^|[;\n])\s*(import\s*[{*"']|import\s+[\w$]+\s+from)/);
  if (match) failures.push(`${file}: contains an ESM import (${match[0].trim().slice(0, 60)}...)`);
}

if (failures.length) {
  console.error("Content script bundles must be self-contained:");
  failures.forEach((failure) => console.error(`  - ${failure}`));
  process.exit(1);
}

console.log(`Content scripts are self-contained: ${CONTENT_BUNDLES.join(", ")}`);
