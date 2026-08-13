// OpenRouter credentials for AI cover letter generation. The key is the user's
// own and never leaves the browser except in the request to OpenRouter itself.
import type { ExtensionSettings } from "./types";

const KEY_STORAGE = "internhack_openrouter_key";
const MODEL_STORAGE = "internhack_openrouter_model";

export const DEFAULT_MODEL = "anthropic/claude-sonnet-5";

export async function getSettings(): Promise<ExtensionSettings> {
  const stored = await chrome.storage.local.get([KEY_STORAGE, MODEL_STORAGE]);
  return {
    openRouterApiKey: typeof stored[KEY_STORAGE] === "string" ? stored[KEY_STORAGE] : "",
    openRouterModel:
      typeof stored[MODEL_STORAGE] === "string" && stored[MODEL_STORAGE]
        ? stored[MODEL_STORAGE]
        : DEFAULT_MODEL,
  };
}

export async function setSettings(input: Partial<ExtensionSettings>) {
  const data: Record<string, string> = {};
  if (typeof input.openRouterApiKey === "string") data[KEY_STORAGE] = input.openRouterApiKey.trim();
  if (typeof input.openRouterModel === "string") {
    data[MODEL_STORAGE] = input.openRouterModel.trim() || DEFAULT_MODEL;
  }
  if (Object.keys(data).length) await chrome.storage.local.set(data);
}
