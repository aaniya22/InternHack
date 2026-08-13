// The in-page drawer: a full height panel on the right of the job posting with
// the resume match, AI cover letter and the profile that will be autofilled.
//
// It renders inside a shadow root so the job portal's CSS (LinkedIn, Workday
// and friends all ship very opinionated global styles) can never reach in and
// break the layout.
import { getAdapter } from "./adapters";
import { fillCoverLetterFields, fillFields } from "./fill-engine";
import { computeResumeMatch } from "../lib/keywords";
import { normalizeProfile } from "../lib/profile-normalizer";
import type { ExtensionProfile, ExtensionSettings, JobContext, ResumeMatch, UsageStats } from "../lib/types";

export const PANEL_ID = "internhack-autofill-panel";
export const LAUNCHER_ID = "internhack-autofill-launcher";

const logoUrl = chrome.runtime.getURL("logo.png");

type Tab = "match" | "cover" | "profile";

function sendMessage<T>(message: Record<string, unknown>): Promise<T> {
  return chrome.runtime.sendMessage(message) as Promise<T>;
}

function escapeHtml(value: unknown): string {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/** Job portals hand back messy JSON for education / experience: read it loosely. */
function pick(entry: unknown, keys: string[]): string {
  if (!entry || typeof entry !== "object") return "";
  const record = entry as Record<string, unknown>;
  for (const key of keys) {
    const value = record[key];
    if (typeof value === "string" && value.trim()) return value.trim();
    if (typeof value === "number") return String(value);
  }
  return "";
}

function dateRange(entry: unknown): string {
  const isCurrent =
    Boolean(entry) &&
    typeof entry === "object" &&
    (entry as Record<string, unknown>).current === true;
  const start = pick(entry, ["startDate", "start", "from"]);
  const end = pick(entry, ["endDate", "end", "to"]) || (isCurrent ? "Present" : "");
  return [start, end].filter(Boolean).join(" - ");
}

const STYLES = `
  :host { all: initial; }
  * { box-sizing: border-box; margin: 0; padding: 0; }
  .drawer {
    position: absolute; inset: 0;
    display: flex; flex-direction: column;
    background: #ffffff; color: #1c1917;
    font-family: Inter, "Segoe UI", Arial, sans-serif; font-size: 13px; line-height: 1.5;
    border-left: 1px solid #d6d3d1;
    box-shadow: -12px 0 40px rgba(0,0,0,.16);
    z-index: 2147483647;
  }
  header { display: flex; align-items: center; gap: 10px; padding: 14px 16px; border-bottom: 1px solid #e7e5e4; }
  header img { width: 26px; height: 26px; border-radius: 6px; object-fit: contain; flex: none; }
  .brand { flex: 1; min-width: 0; }
  .kicker { font-size: 10px; text-transform: uppercase; letter-spacing: .14em; color: #78716c; }
  .brand strong { display: block; font-size: 14px; font-weight: 700; }
  .job { padding: 12px 16px; border-bottom: 1px solid #e7e5e4; background: #fafaf9; }
  .job .role { font-size: 15px; font-weight: 700; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .job .company { font-size: 12px; color: #78716c; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  nav { display: flex; border-bottom: 1px solid #e7e5e4; }
  nav button {
    flex: 1; border: 0; background: transparent; cursor: pointer;
    font: inherit; font-size: 11px; font-weight: 700; text-transform: uppercase; letter-spacing: .1em;
    color: #78716c; padding: 11px 4px; border-bottom: 2px solid transparent;
  }
  nav button:hover { color: #1c1917; }
  nav button[aria-selected="true"] { color: #1c1917; border-bottom-color: #a3e635; }
  .body { flex: 1; overflow-y: auto; padding: 16px; display: grid; gap: 16px; align-content: start; }
  .actions { display: grid; gap: 8px; padding: 12px 16px; border-top: 1px solid #e7e5e4; background: #fafaf9; }
  footer { display: flex; align-items: center; justify-content: space-between; gap: 8px; padding: 10px 16px; border-top: 1px solid #e7e5e4; }
  button.primary { border: 0; border-radius: 6px; background: #a3e635; color: #1c1917; font: inherit; font-weight: 700; padding: 10px; cursor: pointer; }
  button.primary:hover { background: #84cc16; }
  button.secondary { border: 1px solid #d6d3d1; border-radius: 6px; background: #fff; color: #1c1917; font: inherit; font-weight: 700; padding: 9px 12px; cursor: pointer; }
  button.secondary:hover { border-color: #a8a29e; }
  button.quiet { border: 0; background: transparent; color: #57534e; font: inherit; font-size: 12px; cursor: pointer; padding: 4px 0; text-decoration: underline; }
  button:disabled { opacity: .55; cursor: default; }
  .score { display: flex; align-items: center; gap: 14px; border: 1px solid #e7e5e4; border-radius: 8px; padding: 14px; }
  .score .value { flex: none; width: 62px; height: 62px; border-radius: 8px; background: #ecfccb; color: #3f6212; display: flex; align-items: center; justify-content: center; font-size: 19px; font-weight: 800; }
  .score .value.low { background: #fafaf9; color: #78716c; }
  .score h3 { font-size: 14px; font-weight: 700; }
  .score p { font-size: 12px; color: #57534e; margin-top: 2px; }
  .section h4 { font-size: 10px; text-transform: uppercase; letter-spacing: .14em; color: #78716c; margin-bottom: 8px; }
  .tags { display: flex; flex-wrap: wrap; gap: 6px; }
  .tag { border-radius: 4px; padding: 3px 7px; font-size: 11px; font-weight: 600; border: 1px solid transparent; }
  .tag.hit { background: #ecfccb; color: #3f6212; border-color: #d9f99d; }
  .tag.miss { background: #fafaf9; color: #57534e; border-color: #e7e5e4; }
  .rows { display: grid; gap: 7px; }
  .row { display: grid; grid-template-columns: 108px 1fr; gap: 10px; align-items: start; font-size: 12px; }
  .row dt { color: #78716c; }
  .row dd { color: #1c1917; overflow-wrap: anywhere; }
  .entry { border: 1px solid #e7e5e4; border-radius: 6px; padding: 9px 10px; }
  .entry strong { font-size: 12px; }
  .entry span { display: block; font-size: 11px; color: #78716c; }
  .muted { font-size: 12px; color: #78716c; }
  textarea, input {
    width: 100%; font: inherit; font-size: 12px; color: #1c1917; background: #fff;
    border: 1px solid #d6d3d1; border-radius: 6px; padding: 9px;
  }
  textarea { min-height: 260px; resize: vertical; line-height: 1.6; }
  input:focus, textarea:focus { outline: none; border-color: #a3e635; }
  .status { font-size: 12px; color: #78716c; min-height: 18px; }
  .status.error { color: #b91c1c; }
  a { color: #3f6212; }
`;

interface UsageResponse {
  stats: UsageStats;
  timeSavedLabel: string;
}

interface PanelState {
  context: JobContext;
  tab: Tab;
  profile: ExtensionProfile | null;
  profileError: string;
  match: ResumeMatch | null;
  usage: UsageResponse | null;
  coverLetter: string;
  hasKey: boolean;
  model: string;
}

export function removePanelUi() {
  document.getElementById(PANEL_ID)?.remove();
  document.getElementById(LAUNCHER_ID)?.remove();
}

/**
 * Small logo button shown once the panel is closed, so closing is never a dead
 * end: clicking it brings the drawer back for the same job.
 */
export function mountLauncher(context: JobContext) {
  removePanelUi();

  const host = document.createElement("div");
  host.id = LAUNCHER_ID;
  host.style.cssText = "position:fixed !important;right:16px !important;bottom:16px !important;z-index:2147483647 !important";
  const shadow = host.attachShadow({ mode: "open" });
  shadow.innerHTML = `
    <style>
      button {
        all: initial; cursor: pointer; display: flex; align-items: center; justify-content: center;
        width: 44px; height: 44px; border-radius: 8px; background: #fff;
        border: 1px solid #d6d3d1; box-shadow: 0 8px 24px rgba(0,0,0,.18);
      }
      button:hover { border-color: #a3e635; }
      img { width: 24px; height: 24px; object-fit: contain; }
    </style>
    <button type="button" title="Open InternHack Autofill" aria-label="Open InternHack Autofill">
      <img src="${logoUrl}" alt="" />
    </button>
  `;
  shadow.querySelector("button")?.addEventListener("click", () => mountPanel(context));
  document.documentElement.appendChild(host);
}

export function mountPanel(context: JobContext) {
  removePanelUi();

  const state: PanelState = {
    context,
    tab: "match",
    profile: null,
    profileError: "",
    match: null,
    usage: null,
    coverLetter: "",
    hasKey: false,
    model: "",
  };

  const host = document.createElement("div");
  host.id = PANEL_ID;
  // Inline and !important: a :host rule inside the shadow root loses to any
  // page style that targets this element, and job portals style bare divs.
  host.style.cssText = [
    "position:fixed !important",
    "top:0 !important",
    "right:0 !important",
    "bottom:0 !important",
    "left:auto !important",
    "width:420px !important",
    "max-width:100vw !important",
    "height:100vh !important",
    "margin:0 !important",
    "padding:0 !important",
    "display:block !important",
    "visibility:visible !important",
    "opacity:1 !important",
    "transform:none !important",
    "z-index:2147483647 !important",
  ].join(";");
  const shadow = host.attachShadow({ mode: "open" });
  shadow.innerHTML = `
    <style>${STYLES}</style>
    <aside class="drawer" role="complementary" aria-label="InternHack Autofill">
      <header>
        <img src="${logoUrl}" alt="" />
        <div class="brand">
          <div class="kicker">InternHack / ${escapeHtml(context.siteType)}</div>
          <strong>Autofill</strong>
        </div>
        <button class="secondary" data-action="close" title="Close">Close</button>
      </header>
      <div class="job">
        <div class="role" data-role></div>
        <div class="company" data-company></div>
      </div>
      <nav role="tablist">
        <button role="tab" data-tab="match">Match</button>
        <button role="tab" data-tab="cover">Cover letter</button>
        <button role="tab" data-tab="profile">Profile</button>
      </nav>
      <div class="body" data-body></div>
      <div class="actions">
        <button class="primary" data-action="fill">Autofill page</button>
        <button class="secondary" data-action="track">Track application</button>
        <div class="status" data-status></div>
      </div>
      <footer>
        <span class="kicker">Time saved</span>
        <span data-usage class="muted">...</span>
      </footer>
    </aside>
  `;

  const query = <T extends Element>(selector: string) => shadow.querySelector<T>(selector)!;
  const body = query<HTMLElement>("[data-body]");
  const status = query<HTMLElement>("[data-status]");

  // Job title and company come from the page DOM: assign as text, never markup.
  query<HTMLElement>("[data-role]").textContent = context.role;
  query<HTMLElement>("[data-company]").textContent = [context.company, context.location]
    .filter(Boolean)
    .join(" / ");

  const setStatus = (message: string, isError = false) => {
    status.textContent = message;
    status.className = isError ? "status error" : "status";
  };

  const renderUsage = () => {
    const usage = state.usage;
    query<HTMLElement>("[data-usage]").textContent = usage
      ? `${usage.timeSavedLabel} · ${usage.stats.fieldsFilled} fields · ${usage.stats.coverLetters} letters`
      : "Nothing yet";
  };

  function renderMatchTab() {
    if (state.profileError) {
      body.innerHTML = `<p class="muted">${escapeHtml(state.profileError)}</p>`;
      return;
    }
    if (!state.match) {
      body.innerHTML = `<p class="muted">Reading the job description...</p>`;
      return;
    }
    const { score, total, matched, missing } = state.match;
    if (!total) {
      body.innerHTML = `
        <div class="section">
          <h4>Resume match</h4>
          <p class="muted">No recognisable skill keywords in this posting, so there is nothing to compare yet. Autofill still works.</p>
        </div>`;
      return;
    }
    body.innerHTML = `
      <div class="score">
        <div class="value${score < 40 ? " low" : ""}">${score}%</div>
        <div>
          <h3>Resume match</h3>
          <p><strong>${matched.length} of ${total} keywords</strong> from this job are in your InternHack profile.</p>
        </div>
      </div>
      ${matched.length ? `
      <div class="section">
        <h4>In your profile (${matched.length})</h4>
        <div class="tags">${matched.map((k) => `<span class="tag hit">${escapeHtml(k)}</span>`).join("")}</div>
      </div>` : ""}
      ${missing.length ? `
      <div class="section">
        <h4>Missing (${missing.length})</h4>
        <div class="tags">${missing.map((k) => `<span class="tag miss">${escapeHtml(k)}</span>`).join("")}</div>
        <p class="muted" style="margin-top:8px">Add the ones you genuinely have to your InternHack profile, then reload this page.</p>
      </div>` : ""}
    `;
  }

  function renderCoverTab() {
    if (!state.hasKey) {
      body.innerHTML = `
        <div class="section">
          <h4>OpenRouter API key</h4>
          <p class="muted">Cover letters are generated with your own OpenRouter key. It is stored in this browser only.</p>
          <div style="display:grid;gap:8px;margin-top:10px">
            <input type="password" data-key placeholder="sk-or-v1-..." autocomplete="off" />
            <input type="text" data-model placeholder="Model" value="${escapeHtml(state.model)}" />
            <button class="primary" data-action="save-key">Save key</button>
          </div>
          <p class="muted" style="margin-top:10px">Get a key at <a href="https://openrouter.ai/keys" target="_blank" rel="noreferrer">openrouter.ai/keys</a>.</p>
        </div>`;

      query<HTMLButtonElement>("[data-action='save-key']").addEventListener("click", async () => {
        const key = query<HTMLInputElement>("[data-key]").value.trim();
        const model = query<HTMLInputElement>("[data-model]").value.trim();
        if (!key) {
          setStatus("Enter your OpenRouter API key.", true);
          return;
        }
        const saved = await sendMessage<ExtensionSettings>({
          type: "SET_SETTINGS",
          payload: { openRouterApiKey: key, openRouterModel: model || state.model },
        });
        state.hasKey = Boolean(saved.openRouterApiKey);
        state.model = saved.openRouterModel;
        setStatus("OpenRouter key saved.");
        render();
      });
      return;
    }

    body.innerHTML = `
      <div class="section">
        <h4>AI cover letter</h4>
        <p class="muted">Written from this job description and your InternHack profile, using ${escapeHtml(state.model)}.</p>
        <div style="display:flex;gap:8px;margin-top:10px">
          <button class="primary" data-action="generate" style="flex:1">${state.coverLetter ? "Regenerate" : "Generate cover letter"}</button>
        </div>
      </div>
      <div class="section">
        <textarea data-letter placeholder="Your cover letter appears here. Edit it before filling.">${escapeHtml(state.coverLetter)}</textarea>
        <div style="display:flex;gap:8px;margin-top:8px">
          <button class="secondary" data-action="fill-letter" style="flex:1">Fill into form</button>
          <button class="secondary" data-action="copy-letter">Copy</button>
        </div>
      </div>
      <button class="quiet" data-action="change-key">Change OpenRouter key</button>
    `;

    const letterBox = query<HTMLTextAreaElement>("[data-letter]");
    letterBox.addEventListener("input", () => {
      state.coverLetter = letterBox.value;
    });

    query<HTMLButtonElement>("[data-action='generate']").addEventListener("click", async (event) => {
      const button = event.currentTarget as HTMLButtonElement;
      button.disabled = true;
      setStatus("Generating cover letter...");
      try {
        const result = await sendMessage<{ coverLetter?: string; error?: string }>({
          type: "GENERATE_COVER_LETTER",
          payload: { context: state.context },
        });
        if (result.error || !result.coverLetter) throw new Error(result.error || "Generation failed.");
        state.coverLetter = result.coverLetter;
        letterBox.value = result.coverLetter;
        setStatus("Cover letter ready. Edit it, then fill it in.");
        void refreshUsage();
        render();
      } catch (error) {
        setStatus((error as Error).message || "Could not generate the cover letter.", true);
      } finally {
        button.disabled = false;
      }
    });

    query<HTMLButtonElement>("[data-action='fill-letter']").addEventListener("click", () => {
      const value = letterBox.value.trim();
      if (!value) {
        setStatus("Generate or paste a cover letter first.", true);
        return;
      }
      const result = fillCoverLetterFields(getAdapter().findFields(), value);
      setStatus(
        result.filledCount
          ? `Cover letter filled into ${result.filledCount} field${result.filledCount > 1 ? "s" : ""}.`
          : "No cover letter field found on this page. Copy it instead.",
        result.filledCount === 0,
      );
    });

    query<HTMLButtonElement>("[data-action='copy-letter']").addEventListener("click", async () => {
      try {
        await navigator.clipboard.writeText(letterBox.value);
        setStatus("Cover letter copied.");
      } catch {
        setStatus("Could not copy. Select the text and copy manually.", true);
      }
    });

    query<HTMLButtonElement>("[data-action='change-key']").addEventListener("click", () => {
      state.hasKey = false;
      render();
    });
  }

  function renderProfileTab() {
    if (state.profileError) {
      body.innerHTML = `<p class="muted">${escapeHtml(state.profileError)}</p>`;
      return;
    }
    if (!state.profile) {
      body.innerHTML = `<p class="muted">Loading your profile...</p>`;
      return;
    }

    const profile = state.profile;
    const normalized = normalizeProfile(profile);
    const application = profile.applicationProfile;

    const row = (label: string, value: string) =>
      value ? `<div class="row"><dt>${escapeHtml(label)}</dt><dd>${escapeHtml(value)}</dd></div>` : "";

    const link = (label: string, value: string) =>
      value
        ? `<div class="row"><dt>${escapeHtml(label)}</dt><dd><a href="${escapeHtml(value)}" target="_blank" rel="noreferrer">${escapeHtml(value)}</a></dd></div>`
        : "";

    const education = Array.isArray(application?.education) ? application.education : [];
    const experience = Array.isArray(application?.experience) ? application.experience : [];
    const languages = Object.entries(application?.customFields ?? {})
      .filter(([key]) => /language/i.test(key))
      .map(([, value]) => String(value))
      .join(", ");

    const educationHtml = education.length
      ? education
          .map((entry) => {
            const school = pick(entry, ["institution", "school", "college", "university", "name"]);
            const degree = [pick(entry, ["degree", "qualification"]), pick(entry, ["field", "fieldOfStudy", "major"])]
              .filter(Boolean)
              .join(", ");
            if (!school && !degree) return "";
            return `<div class="entry"><strong>${escapeHtml(school || degree)}</strong>
              ${degree && school ? `<span>${escapeHtml(degree)}</span>` : ""}
              ${dateRange(entry) ? `<span>${escapeHtml(dateRange(entry))}</span>` : ""}</div>`;
          })
          .filter(Boolean)
          .join("")
      : "";

    const experienceHtml = experience.length
      ? experience
          .map((entry) => {
            const company = pick(entry, ["company", "employer", "organisation", "organization"]);
            const title = pick(entry, ["title", "position", "role", "jobTitle"]);
            if (!company && !title) return "";
            return `<div class="entry"><strong>${escapeHtml(title || company)}</strong>
              ${title && company ? `<span>${escapeHtml(company)}</span>` : ""}
              ${dateRange(entry) ? `<span>${escapeHtml(dateRange(entry))}</span>` : ""}</div>`;
          })
          .filter(Boolean)
          .join("")
      : "";

    const customEntries = Object.entries(application?.customFields ?? {}).filter(
      ([key]) => !/language/i.test(key),
    );

    body.innerHTML = `
      <div class="section">
        <h4>Used to fill this form</h4>
        <div class="rows">
          ${row("Name", normalized.fullName)}
          ${row("Email", normalized.email)}
          ${row("Phone", [application?.phoneCountryCode || "", normalized.phone].filter(Boolean).join(" "))}
          ${row("Location", normalized.location)}
          ${row("Languages", languages)}
        </div>
      </div>
      <div class="section">
        <h4>Links</h4>
        <div class="rows">
          ${link("LinkedIn", normalized.linkedinUrl)}
          ${link("GitHub", normalized.githubUrl)}
          ${link("Portfolio", normalized.portfolioUrl)}
          ${link("LeetCode", normalized.leetcodeUrl)}
          ${link("Resume", normalized.resumeUrl)}
        </div>
        ${profile.user.resumes.length > 1 ? `<p class="muted" style="margin-top:6px">${profile.user.resumes.length} resumes on file, the first is used.</p>` : ""}
      </div>
      <div class="section">
        <h4>Education</h4>
        ${educationHtml || `<div class="rows">${row("College", normalized.school)}${row("Graduation", normalized.graduationYear)}</div>`}
      </div>
      ${experienceHtml ? `<div class="section"><h4>Experience</h4><div class="rows">${experienceHtml}</div></div>` : ""}
      <div class="section">
        <h4>Skills (${profile.user.skills.length})</h4>
        ${profile.user.skills.length
          ? `<div class="tags">${profile.user.skills.map((skill) => `<span class="tag miss">${escapeHtml(skill)}</span>`).join("")}</div>`
          : `<p class="muted">No skills on your profile yet.</p>`}
      </div>
      ${normalized.bio ? `<div class="section"><h4>Summary</h4><p class="muted">${escapeHtml(normalized.bio)}</p></div>` : ""}
      ${customEntries.length
        ? `<div class="section"><h4>Saved answers</h4><div class="rows">${customEntries
            .map(([key, value]) => row(key, String(value)))
            .join("")}</div></div>`
        : ""}
      <p class="muted">Edit any of this on InternHack, then reload the page.</p>
    `;
  }

  function render() {
    shadow.querySelectorAll<HTMLButtonElement>("nav button").forEach((button) => {
      button.setAttribute("aria-selected", String(button.dataset.tab === state.tab));
    });
    if (state.tab === "match") renderMatchTab();
    else if (state.tab === "cover") renderCoverTab();
    else renderProfileTab();
  }

  async function refreshUsage() {
    state.usage = await sendMessage<UsageResponse>({ type: "GET_USAGE" });
    renderUsage();
  }

  shadow.querySelectorAll<HTMLButtonElement>("nav button").forEach((button) => {
    button.addEventListener("click", () => {
      state.tab = (button.dataset.tab as Tab) || "match";
      render();
    });
  });

  query<HTMLButtonElement>("[data-action='close']").addEventListener("click", () => {
    mountLauncher(state.context);
  });

  query<HTMLButtonElement>("[data-action='fill']").addEventListener("click", async () => {
    if (!state.profile) {
      setStatus(state.profileError || "Profile is still loading.", Boolean(state.profileError));
      return;
    }
    setStatus("Filling the form...");
    const normalized = normalizeProfile(state.profile);
    normalized.coverLetter = state.coverLetter;
    const adapter = getAdapter();
    const fields = adapter.findFields();
    const result = fillFields(normalized, fields);
    setStatus(`Filled ${result.filledCount} of ${result.fieldCount} fields.`);
    state.usage = await sendMessage<UsageResponse>({
      type: "RECORD_AUTOFILL",
      payload: { filledCount: result.filledCount },
    });
    renderUsage();
    void sendMessage({
      type: "LOG_EVENT",
      payload: {
        host: location.hostname,
        siteType: state.context.siteType,
        url: location.href,
        eventType: "AUTOFILLED",
        fieldCount: result.fieldCount,
        filledCount: result.filledCount,
        failedCount: result.failedCount,
      },
    });
  });

  query<HTMLButtonElement>("[data-action='track']").addEventListener("click", async () => {
    setStatus("Tracking application...");
    try {
      const result = await sendMessage<{ error?: string }>({
        type: "TRACK_APPLICATION",
        payload: { context: state.context, submitted: window.confirm("Did you submit this application?") },
      });
      if (result?.error) throw new Error(result.error);
      setStatus("Application tracked in InternHack.");
      void refreshUsage();
    } catch (error) {
      setStatus((error as Error).message || "Could not track application.", true);
    }
  });

  document.documentElement.appendChild(host);
  render();

  void (async () => {
    const settings = await sendMessage<ExtensionSettings>({ type: "GET_SETTINGS" });
    state.hasKey = Boolean(settings.openRouterApiKey);
    state.model = settings.openRouterModel;
    await refreshUsage();

    try {
      const profile = await sendMessage<ExtensionProfile & { error?: string }>({ type: "GET_PROFILE" });
      if (profile.error || !profile.user) throw new Error(profile.error || "Not connected.");
      state.profile = profile;
      state.match = computeResumeMatch(state.context.jobDescription || "", profile);
    } catch (error) {
      state.profileError =
        (error as Error).message || "Open InternHack while signed in to connect the extension.";
    }
    render();
  })();
}
