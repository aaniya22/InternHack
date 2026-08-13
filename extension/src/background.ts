import {
  clearSession,
  detectPage,
  getProfile,
  logEvent,
  setSession,
  supportRequest,
  trackApplication,
} from "./lib/api";
import { generateCoverLetter } from "./lib/openrouter";
import { getSettings, setSettings } from "./lib/settings";
import {
  formatDuration,
  getUsage,
  recordAutofill,
  recordCoverLetter,
  recordTrackedApplication,
} from "./lib/usage";
import type { ExtensionSettings, JobContext, UsageStats } from "./lib/types";

// The content script is a classic script, not a module, so it cannot import
// lib/* directly without Rollup emitting a shared ESM chunk it can't load.
// Everything stateful therefore goes through these messages.
function usageResponse(stats: UsageStats) {
  return { stats, timeSavedLabel: formatDuration(stats.secondsSaved) };
}

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  void (async () => {
    try {
      if (message.type === "GET_PROFILE") {
        sendResponse(await getProfile());
        return;
      }
      if (message.type === "SET_SESSION") {
        await setSession(
          String(message.token || ""),
          typeof message.apiBase === "string" ? message.apiBase : undefined,
        );
        sendResponse({ success: true });
        return;
      }
      if (message.type === "CLEAR_SESSION") {
        await clearSession();
        sendResponse({ success: true });
        return;
      }
      if (message.type === "LOG_EVENT") {
        sendResponse(await logEvent(message.payload || {}));
        return;
      }
      if (message.type === "DETECT_PAGE") {
        sendResponse(await detectPage(message.payload || {}));
        return;
      }
      if (message.type === "TRACK_APPLICATION") {
        const payload = message.payload as { context: JobContext; submitted: boolean };
        const result = await trackApplication(payload.context, payload.submitted);
        await recordTrackedApplication();
        sendResponse(result);
        return;
      }
      if (message.type === "GET_SETTINGS") {
        sendResponse(await getSettings());
        return;
      }
      if (message.type === "SET_SETTINGS") {
        await setSettings((message.payload || {}) as Partial<ExtensionSettings>);
        sendResponse(await getSettings());
        return;
      }
      if (message.type === "GET_USAGE") {
        sendResponse(usageResponse(await getUsage()));
        return;
      }
      if (message.type === "RECORD_AUTOFILL") {
        sendResponse(usageResponse(await recordAutofill(Number(message.payload?.filledCount) || 0)));
        return;
      }
      if (message.type === "GENERATE_COVER_LETTER") {
        const payload = message.payload as { context: JobContext; tone?: string };
        const profile = await getProfile();
        const result = await generateCoverLetter(profile, payload);
        await recordCoverLetter();
        sendResponse(result);
        return;
      }
      if (message.type === "SUPPORT_REQUEST") {
        const payload = message.payload as { context: JobContext; message?: string };
        sendResponse(await supportRequest(payload.context, payload.message));
        return;
      }
      sendResponse({ error: "Unknown message" });
    } catch (error) {
      sendResponse({ error: (error as Error).message || "Extension request failed" });
    }
  })();
  return true;
});

