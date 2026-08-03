import * as fs from "fs";
import * as path from "path";
import { fileURLToPath } from "url";

const here = path.dirname(fileURLToPath(import.meta.url));

/**
 * Binary assets live in `server/assets/` (outside `src`, so tsc does not copy
 * them into `dist`). Resolve against both layouts so the generators work when
 * run from source via tsx and from the compiled build.
 */
function resolveAsset(filename: string): string | null {
  const candidates = [
    path.resolve(here, "../../../../assets", filename), // src/module/internship/pdf -> server/assets
    path.resolve(here, "../../../../../assets", filename), // dist/module/internship/pdf -> server/assets
    path.resolve(process.cwd(), "assets", filename),
    path.resolve(process.cwd(), "server/assets", filename),
  ];
  return candidates.find((p) => fs.existsSync(p)) ?? null;
}

function readAsset(filename: string): Buffer | null {
  const resolved = resolveAsset(filename);
  return resolved ? fs.readFileSync(resolved) : null;
}

/** InternHack app icon. Returns null if the asset is missing. */
export function logoBuffer(): Buffer | null {
  return readAsset("internhack-logo.png");
}

/**
 * Scanned signature of the signatory, transparent PNG. Optional: when absent
 * the documents fall back to a plain ruled signature line.
 */
export function signatureBuffer(): Buffer | null {
  return readAsset("signature-sachin.png");
}
