import { getAdapter } from "./adapters";
import { LAUNCHER_ID, PANEL_ID, mountPanel, removePanelUi } from "./panel";

function sendMessage<T>(message: Record<string, unknown>): Promise<T> {
  return chrome.runtime.sendMessage(message) as Promise<T>;
}

function evaluate() {
  const adapter = getAdapter();
  const panel = document.getElementById(PANEL_ID);

  // Only show on a real job / apply context (adapter.detect()), never on the
  // feed, messaging, profile, search, etc.
  if (!adapter.detect()) {
    removePanelUi();
    return;
  }
  if (panel) return;
  // The launcher is standing in for a drawer the user closed on this page:
  // leave it alone rather than forcing the drawer back open.
  if (document.getElementById(LAUNCHER_ID)) return;

  const context = adapter.extractJobContext();
  mountPanel(context);
  void sendMessage({
    type: "LOG_EVENT",
    payload: {
      host: location.hostname,
      siteType: context.siteType,
      url: location.href,
      eventType: "DETECTED",
      metadata: { role: context.role, company: context.company },
    },
  });
}

// Re-check a few times so the panel appears once async job UI has mounted.
let retryTimers: number[] = [];
function retryEvaluate() {
  retryTimers.forEach((t) => clearTimeout(t));
  retryTimers = [0, 600, 1500, 3000].map((delay) => window.setTimeout(evaluate, delay));
}

// Job portals are SPAs: route changes don't reload the page, so watch history.
let lastHref = location.href;
function handleLocationChange() {
  if (location.href === lastHref) return;
  lastHref = location.href;
  // New page: clear a launcher left over from the old one so the drawer opens.
  removePanelUi();
  retryEvaluate();
}

const patchHistory = (method: "pushState" | "replaceState") => {
  const original = history[method];
  history[method] = function (
    this: History,
    ...args: [data: unknown, unused: string, url?: string | URL | null]
  ) {
    const result = original.apply(this, args);
    window.dispatchEvent(new Event("ih:locationchange"));
    return result;
  };
};
patchHistory("pushState");
patchHistory("replaceState");
window.addEventListener("popstate", handleLocationChange);
window.addEventListener("ih:locationchange", handleLocationChange);

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", retryEvaluate, { once: true });
} else {
  retryEvaluate();
}
