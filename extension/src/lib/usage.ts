// Local "time saved" ledger. The server records autofill events but exposes no
// aggregate endpoint, so the counters live in chrome.storage.local: the panel
// reads them instantly and they keep working while offline.
import type { UsageStats } from "./types";

const USAGE_KEY = "internhack_usage_stats";

// Conservative per-action estimates of manual effort avoided.
const SECONDS_PER_FIELD = 12; // read the label, tab, type, correct a typo
const SECONDS_PER_COVER_LETTER = 900; // 15 minutes writing one from scratch
const SECONDS_PER_TRACKED_APPLICATION = 90; // logging it in a sheet by hand

const EMPTY: UsageStats = {
  autofills: 0,
  fieldsFilled: 0,
  coverLetters: 0,
  applicationsTracked: 0,
  secondsSaved: 0,
};

export async function getUsage(): Promise<UsageStats> {
  const stored = await chrome.storage.local.get(USAGE_KEY);
  const value = stored[USAGE_KEY];
  return value && typeof value === "object" ? { ...EMPTY, ...(value as UsageStats) } : { ...EMPTY };
}

async function addUsage(delta: Partial<UsageStats>, secondsSaved: number): Promise<UsageStats> {
  const current = await getUsage();
  const next: UsageStats = {
    autofills: current.autofills + (delta.autofills || 0),
    fieldsFilled: current.fieldsFilled + (delta.fieldsFilled || 0),
    coverLetters: current.coverLetters + (delta.coverLetters || 0),
    applicationsTracked: current.applicationsTracked + (delta.applicationsTracked || 0),
    secondsSaved: current.secondsSaved + secondsSaved,
  };
  await chrome.storage.local.set({ [USAGE_KEY]: next });
  return next;
}

export function recordAutofill(filledCount: number) {
  return addUsage({ autofills: 1, fieldsFilled: filledCount }, filledCount * SECONDS_PER_FIELD);
}

export function recordCoverLetter() {
  return addUsage({ coverLetters: 1 }, SECONDS_PER_COVER_LETTER);
}

export function recordTrackedApplication() {
  return addUsage({ applicationsTracked: 1 }, SECONDS_PER_TRACKED_APPLICATION);
}

/** "3h 12m", "12m", "45s" */
export function formatDuration(totalSeconds: number): string {
  if (totalSeconds < 60) return `${Math.max(0, Math.round(totalSeconds))}s`;
  const minutes = Math.round(totalSeconds / 60);
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  const remainder = minutes % 60;
  return remainder ? `${hours}h ${remainder}m` : `${hours}h`;
}
