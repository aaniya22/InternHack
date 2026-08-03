/**
 * IndexNow submission (https://www.indexnow.org).
 *
 * One POST tells Bing, Yandex, Seznam and Naver that a URL changed, instead of
 * waiting for their next crawl. It matters most for job postings, which expire:
 * a listing that is only discovered a week late is close to worthless, and a
 * removed one should stop being served as a result quickly.
 *
 * Requires INDEXNOW_KEY. The same value must be reachable as a plain-text file
 * at https://www.internhack.xyz/<key>.txt containing only the key, which is how
 * the search engines verify we own the host. See client/public/indexnow-key.txt
 * and the rewrite in client/vercel.json.
 *
 * Every failure here is non-fatal: this is a nice-to-have notification, never a
 * reason to fail the request that triggered it.
 */

import { createLogger } from "./logger.js";

const logger = createLogger("indexnow");

const SITE_HOST = "www.internhack.xyz";
const ENDPOINT = "https://api.indexnow.org/indexnow";
const MAX_URLS_PER_BATCH = 10_000; // IndexNow's documented per-request cap.

function getKey(): string | null {
  const key = process.env["INDEXNOW_KEY"];
  return key && key.trim().length > 0 ? key.trim() : null;
}

/**
 * Absolute, same-host, http(s) URLs only. Anything else is silently dropped.
 *
 * Deliberately parsed without a base: resolving against `https://<host>` would
 * turn any junk string into a valid same-host URL ("::::" becomes
 * "https://www.internhack.xyz/::::") and we would happily submit it.
 */
function normalize(urls: string[]): string[] {
  const seen = new Set<string>();
  for (const raw of urls) {
    let parsed: URL;
    try {
      parsed = new URL(raw);
    } catch {
      continue;
    }
    if (parsed.protocol !== "https:" && parsed.protocol !== "http:") continue;
    if (parsed.hostname !== SITE_HOST) continue;
    seen.add(parsed.toString());
  }
  return [...seen];
}

/**
 * Notify IndexNow that these URLs changed. Resolves to the number submitted, or
 * 0 if the key is unset or nothing was valid. Never throws.
 */
export async function submitToIndexNow(urls: string[]): Promise<number> {
  const key = getKey();
  if (!key) return 0;

  const urlList = normalize(urls);
  if (urlList.length === 0) return 0;

  let submitted = 0;
  for (let i = 0; i < urlList.length; i += MAX_URLS_PER_BATCH) {
    const batch = urlList.slice(i, i + MAX_URLS_PER_BATCH);
    try {
      const res = await fetch(ENDPOINT, {
        method: "POST",
        headers: { "Content-Type": "application/json; charset=utf-8" },
        body: JSON.stringify({
          host: SITE_HOST,
          key,
          keyLocation: `https://${SITE_HOST}/${key}.txt`,
          urlList: batch,
        }),
        signal: AbortSignal.timeout(8000),
      });

      if (res.ok) {
        submitted += batch.length;
        logger.info("Submitted URLs to IndexNow", { count: batch.length, status: res.status });
      } else {
        // 403 means the key file is missing or does not match.
        logger.warn("IndexNow rejected submission", {
          status: res.status,
          count: batch.length,
        });
      }
    } catch (err) {
      logger.warn("IndexNow submission failed", {
        error: err instanceof Error ? err.message : String(err),
        count: batch.length,
      });
    }
  }

  return submitted;
}

/** Convenience wrapper for a single path such as "/jobs/ext/my-slug". */
export function submitPathToIndexNow(path: string): Promise<number> {
  return submitToIndexNow([`https://${SITE_HOST}${path.startsWith("/") ? path : `/${path}`}`]);
}
