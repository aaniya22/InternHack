/// <reference types="vite/client" />

// Generated at build time by the `interview-manifest` plugin in vite.config.ts
// from the lesson JSON in module/student/interview-prep/data/lessons.
declare module "virtual:interview-manifest" {
  export interface InterviewSectionManifest {
    total: number;
    easy: number;
    medium: number;
    hard: number;
    ids: string[];
  }
  /** Keyed by section id, which matches the lesson JSON basename. */
  export const interviewManifest: Record<string, InterviewSectionManifest>;
}
