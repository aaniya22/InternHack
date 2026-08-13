// Cover letter generation through OpenRouter, using the user's own API key.
//
// Called from the background service worker, not the content script: the
// request then runs on the extension's own origin, so the job portal's CSP and
// CORS rules never apply to it and the key is never exposed to page scripts.
import { getSettings } from "./settings";
import type { ExtensionProfile, JobContext } from "./types";

const ENDPOINT = "https://openrouter.ai/api/v1/chat/completions";

// The job description can be the whole page body on some adapters; trim it so a
// long posting cannot blow up the request.
const MAX_DESCRIPTION_CHARS = 6000;

export interface CoverLetterInput {
  context: JobContext;
  tone?: string;
}

function profileSummary(profile: ExtensionProfile): string {
  const { user, applicationProfile } = profile;
  const lines = [
    `Name: ${applicationProfile?.preferredName || user.name}`,
    `Email: ${user.email}`,
    user.contactNo ? `Phone: ${user.contactNo}` : "",
    user.location ? `Location: ${user.location}` : "",
    user.college ? `College: ${user.college}` : "",
    user.graduationYear ? `Graduation year: ${user.graduationYear}` : "",
    user.skills.length ? `Skills: ${user.skills.join(", ")}` : "",
    user.bio ? `Bio: ${user.bio}` : "",
    user.githubUrl ? `GitHub: ${user.githubUrl}` : "",
    user.linkedinUrl ? `LinkedIn: ${user.linkedinUrl}` : "",
    user.portfolioUrl ? `Portfolio: ${user.portfolioUrl}` : "",
  ].filter(Boolean);

  const education = applicationProfile?.education;
  if (Array.isArray(education) && education.length) {
    lines.push(`Education: ${JSON.stringify(education).slice(0, 1200)}`);
  }
  const experience = applicationProfile?.experience;
  if (Array.isArray(experience) && experience.length) {
    lines.push(`Experience: ${JSON.stringify(experience).slice(0, 1600)}`);
  }
  const projects = profile.user.projects;
  if (projects) lines.push(`Projects: ${JSON.stringify(projects).slice(0, 1600)}`);

  return lines.join("\n");
}

function buildPrompt(profile: ExtensionProfile, context: JobContext, tone: string) {
  const description = (context.jobDescription || "").slice(0, MAX_DESCRIPTION_CHARS);
  return [
    `Write a cover letter for this application.`,
    ``,
    `Role: ${context.role}`,
    `Company: ${context.company}`,
    context.location ? `Location: ${context.location}` : "",
    ``,
    `Job description:`,
    description || "(not available on this page)",
    ``,
    `Candidate:`,
    profileSummary(profile),
    ``,
    `Rules:`,
    `- ${tone} tone, 200 to 280 words, three or four short paragraphs.`,
    `- Open by naming the role and the company. Do not use a subject line or a date.`,
    `- Ground every claim in the candidate details above. Never invent an employer, a metric, or a degree.`,
    `- Mirror the concrete skills the job description asks for that the candidate actually has.`,
    `- Close with a short call to action and sign off with the candidate's name.`,
    `- Return only the letter body as plain text. No markdown, no preamble, no placeholders like [Company].`,
  ]
    .filter((line) => line !== undefined)
    .join("\n");
}

export async function generateCoverLetter(
  profile: ExtensionProfile,
  input: CoverLetterInput,
): Promise<{ coverLetter: string }> {
  const { openRouterApiKey, openRouterModel } = await getSettings();
  if (!openRouterApiKey) {
    throw new Error("Add your OpenRouter API key in the extension popup to generate a cover letter.");
  }

  const response = await fetch(ENDPOINT, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${openRouterApiKey}`,
      // OpenRouter attributes usage with these; both are optional but polite.
      "HTTP-Referer": "https://www.internhack.xyz",
      "X-Title": "InternHack Autofill",
    },
    body: JSON.stringify({
      model: openRouterModel,
      messages: [
        {
          role: "system",
          content:
            "You write concise, specific cover letters for students and early career engineers. You never fabricate experience.",
        },
        { role: "user", content: buildPrompt(profile, input.context, input.tone || "warm and professional") },
      ],
      max_tokens: 900,
      temperature: 0.6,
    }),
  });

  if (!response.ok) {
    const body = (await response.json().catch(() => ({}))) as { error?: { message?: string } };
    const detail = body.error?.message || `OpenRouter request failed: ${response.status}`;
    throw new Error(
      response.status === 401 ? "OpenRouter rejected the API key. Check it in the extension popup." : detail,
    );
  }

  const data = (await response.json()) as {
    choices?: Array<{ message?: { content?: string } }>;
  };
  const coverLetter = data.choices?.[0]?.message?.content?.trim();
  if (!coverLetter) throw new Error("OpenRouter returned an empty response. Try again.");
  return { coverLetter };
}
