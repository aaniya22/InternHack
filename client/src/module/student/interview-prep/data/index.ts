import type { InterviewSection, InterviewQuestion } from "./types";
import { interviewSections } from "./sections";

export const sections: InterviewSection[] = interviewSections;

// The 18 lesson files total ~2.1 MB. They used to be imported statically and
// flattened into one `questions` array, so a section page downloaded the whole
// set to render a single section. Each file is now fetched on demand and gets
// its own chunk. Keys are the section id, which matches the JSON basename.
const lessonLoaders = import.meta.glob<{ default: InterviewQuestion[] }>(
  "./lessons/*.json",
);

/** Questions for one section, sorted by `orderIndex`. Empty if the id is unknown. */
export function loadSectionQuestions(sectionId: string): Promise<InterviewQuestion[]> {
  const load = lessonLoaders[`./lessons/${sectionId}.json`];
  if (!load) return Promise.resolve([]);
  return load().then((mod) =>
    [...mod.default].sort((a, b) => a.orderIndex - b.orderIndex),
  );
}

// Per-section counts and question ids, derived from the same lesson JSON at
// build time. The sections index needs stats for every section at once; reading
// them from here keeps it from pulling ~2 MB of question bodies it never shows.
export { interviewManifest } from "virtual:interview-manifest";
export type { InterviewSectionManifest } from "virtual:interview-manifest";
