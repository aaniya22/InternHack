/**
 * Build-time static SEO HTML for the learn content pages.
 *
 * Why this exists: the app is a client-rendered SPA, so every route ships the
 * same `dist/index.html` with an empty `<div id="root">`. Googlebot renders JS
 * and eventually sees the real page, but the AI crawlers that robots.txt
 * explicitly invites (GPTBot, ClaudeBot, PerplexityBot, OAI-SearchBot, CCBot)
 * do not execute JavaScript at all, so they were being served a blank shell for
 * all ~1,400 lesson and interview-question pages.
 *
 * Puppeteer prerendering cannot cover this: at ~4.5s per route it would take
 * over an hour. But this content is plain JSON committed in the repo, so the
 * HTML can be templated directly, with no browser involved.
 *
 * For each page we emit `dist/<route>/index.html`: the real built shell with
 * per-page <title>, description, canonical, OG/Twitter tags and JSON-LD, plus
 * the lesson text inside `#root`. React's createRoot().render() clears `#root`
 * on mount, so real visitors never see the static copy, it exists purely so a
 * non-JS crawler has something to read. Vercel serves `/a/b` from
 * `dist/a/b/index.html` when that file exists, otherwise the catch-all rewrite
 * in vercel.json falls back to the SPA shell.
 *
 * Run: node scripts/generate-seo-pages.mjs   (called from `npm run build`)
 */

import { readFileSync, writeFileSync, mkdirSync, existsSync, readdirSync, rmSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const DIST = join(__dirname, "..", "dist");
const STUDENT_DIR = join(__dirname, "..", "src", "module", "student");
const SITE_URL = "https://www.internhack.xyz";
const OG_IMAGE = `${SITE_URL}/og-image.png`;
const OG_IMAGE_DARK = `${SITE_URL}/og-image-dark.png`;

// Content directory -> { segment: /learn/<segment>, label: human name }.
// `interview-prep` is the only one whose folder and route segment differ.
const LEARN_AREAS = {
  javascript: { segment: "javascript", label: "JavaScript" },
  typescript: { segment: "typescript", label: "TypeScript" },
  react: { segment: "react", label: "React" },
  python: { segment: "python", label: "Python" },
  nodejs: { segment: "nodejs", label: "Node.js" },
  html: { segment: "html", label: "HTML" },
  css: { segment: "css", label: "CSS" },
  django: { segment: "django", label: "Django" },
  flask: { segment: "flask", label: "Flask" },
  fastapi: { segment: "fastapi", label: "FastAPI" },
  blockchain: { segment: "blockchain", label: "Blockchain" },
  "data-analytics": { segment: "data-analytics", label: "Data Analytics" },
  "interview-prep": { segment: "interview", label: "Interview Prep" },
};

// ── Text helpers ────────────────────────────────────────────────────
function escapeHtml(value) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/** Safe to embed in a <script type="application/ld+json"> block. */
function jsonLd(data) {
  return JSON.stringify(data).replace(/</g, "\\u003c").replace(/>/g, "\\u003e");
}

/** Collapse markdown/whitespace and hard-cap to a meta-description length. */
function toDescription(text, max = 155) {
  const flat = String(text ?? "")
    .replace(/[`*_#>]/g, "")
    .replace(/\s+/g, " ")
    .trim();
  if (flat.length <= max) return flat;
  const cut = flat.slice(0, max);
  const lastSpace = cut.lastIndexOf(" ");
  return `${(lastSpace > 60 ? cut.slice(0, lastSpace) : cut).trimEnd()}...`;
}

/**
 * "JavaScript" + "JavaScript Basics" would read "JavaScript JavaScript Basics",
 * and several sections are already named after their language. Drop the prefix
 * when the section title already carries it.
 */
function qualify(label, sectionTitle) {
  return sectionTitle.toLowerCase().includes(label.toLowerCase())
    ? sectionTitle
    : `${label} ${sectionTitle}`;
}

/**
 * Keep the most specific part (the lesson name) and shed context from the right
 * until it fits. Returns the title without the brand suffix; the caller appends it.
 *
 * The limit is 70, not the ~60 characters Google actually displays. The specific
 * part comes first, so an over-long title truncates gracefully in the SERP while
 * the trailing context ("... | JavaScript Interview Question") still counts for
 * relevance. Cutting it at 60 threw that keyword context away entirely.
 */
function fitTitle(primary, ...context) {
  const BRAND = " | InternHack";
  const LIMIT = 70;
  const parts = [primary, ...context.filter(Boolean)];
  while (parts.length > 1 && parts.join(" | ").length + BRAND.length > LIMIT) {
    parts.pop();
  }
  const joined = parts.join(" | ");
  if (joined.length + BRAND.length <= LIMIT) return joined;
  // Only the primary is left and it is still too long: keep it whole rather
  // than cutting a lesson name mid-word, the brand suffix is the cheaper loss.
  return joined;
}

function titleCase(slug) {
  return slug
    .split("-")
    .map((w) => (w.length <= 2 ? w.toUpperCase() : w[0].toUpperCase() + w.slice(1)))
    .join(" ");
}

// ── Section metadata (parsed out of data/sections.ts) ────────────────
// Every sections.ts uses the same literal shape, so a regex avoids having to
// compile TypeScript in a build script. Falls back to a title derived from the
// section id if a file is ever formatted differently.
function readSections(dir) {
  const file = join(STUDENT_DIR, dir, "data", "sections.ts");
  const map = new Map();
  if (!existsSync(file)) return map;
  const src = readFileSync(file, "utf8");
  const re =
    /id:\s*"([^"]+)"\s*,\s*\n\s*title:\s*"([^"]+)"\s*,\s*\n\s*description:\s*"([^"]*)"/g;
  let m;
  while ((m = re.exec(src)) !== null) {
    map.set(m[1], { title: m[2], description: m[3] });
  }
  return map;
}

function readLessonFiles(dir) {
  const lessonsDir = join(STUDENT_DIR, dir, "data", "lessons");
  if (!existsSync(lessonsDir)) return [];
  return readdirSync(lessonsDir)
    .filter((f) => f.endsWith(".json"))
    .map((f) => {
      let items;
      try {
        items = JSON.parse(readFileSync(join(lessonsDir, f), "utf8"));
      } catch (err) {
        console.warn(`[seo-pages] skipping unreadable ${dir}/${f}: ${err.message}`);
        return null;
      }
      return {
        sectionId: f.replace(/\.json$/, ""),
        items: Array.isArray(items) ? items : [],
      };
    })
    .filter(Boolean);
}

// ── Page models ─────────────────────────────────────────────────────
function breadcrumb(items) {
  return {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: items.map((item, i) => ({
      "@type": "ListItem",
      position: i + 1,
      name: item.name,
      item: `${SITE_URL}${item.path}`,
    })),
  };
}

function sectionPage({ area, sectionId, section, items }) {
  const { segment, label } = area;
  const path = `/learn/${segment}/${sectionId}`;
  const sectionTitle = section?.title ?? titleCase(sectionId);
  const isInterview = segment === "interview";
  const noun = isInterview ? "Interview Questions" : "Tutorial";

  // For the interview area the label ("Interview Prep") and the noun
  // ("Interview Questions") say the same thing, and several section titles
  // already end in "Interview". Build from the section title alone and strip the
  // trailing word so we get "SQL & Database Interview Questions", not
  // "Interview Prep SQL & Database Interview Interview Questions".
  const heading = isInterview
    ? `${sectionTitle.replace(/\s+Interview$/i, "")} ${noun}`
    : `${qualify(label, sectionTitle)} ${noun}`;

  const description = toDescription(
    section?.description ??
      `${items.length} free ${label} ${isInterview ? "interview questions" : "lessons"} on ${sectionTitle}, with code examples and explanations.`,
  );

  const body = `
      <nav aria-label="Breadcrumb"><a href="/learn">Learn</a> / <a href="/learn/${escapeHtml(segment)}">${escapeHtml(label)}</a> / ${escapeHtml(sectionTitle)}</nav>
      <h1>${escapeHtml(heading)}</h1>
      <p>${escapeHtml(description)}</p>
      <h2>${escapeHtml(items.length)} ${isInterview ? "questions" : "lessons"} in this section</h2>
      <ul>
${items
  .map(
    (it) =>
      `        <li><a href="${escapeHtml(path)}/${escapeHtml(it.id)}">${escapeHtml(it.title ?? titleCase(it.id))}</a>${it.difficulty ? ` (${escapeHtml(it.difficulty)})` : ""}</li>`,
  )
  .join("\n")}
      </ul>`;

  return {
    path,
    title: fitTitle(heading),
    description,
    body,
    structuredData: [
      breadcrumb([
        { name: "Learn", path: "/learn" },
        { name: label, path: `/learn/${segment}` },
        { name: sectionTitle, path },
      ]),
      {
        "@context": "https://schema.org",
        "@type": "ItemList",
        name: heading,
        numberOfItems: items.length,
        itemListElement: items.map((it, i) => ({
          "@type": "ListItem",
          position: i + 1,
          name: it.title ?? titleCase(it.id),
          url: `${SITE_URL}${path}/${it.id}`,
        })),
      },
    ],
  };
}

function lessonPage({ area, sectionId, section, item }) {
  const { segment, label } = area;
  const path = `/learn/${segment}/${sectionId}/${item.id}`;
  const sectionTitle = section?.title ?? titleCase(sectionId);
  const lessonTitle = item.title ?? titleCase(item.id);
  const isInterview = segment === "interview";

  // Interview questions carry { question, answer }, lessons carry { explanation }.
  const question = item.content?.question ?? null;
  const prose = item.content?.answer ?? item.content?.explanation ?? "";
  const description = toDescription(question ?? prose);
  const concepts = Array.isArray(item.concepts) ? item.concepts : [];
  const examples = Array.isArray(item.content?.codeExamples)
    ? item.content.codeExamples
    : [];
  const notes = Array.isArray(item.content?.notes) ? item.content.notes : [];

  const paragraphs = String(prose)
    .split(/\n\n+/)
    .map((p) => p.trim())
    .filter(Boolean);

  const body = `
      <nav aria-label="Breadcrumb"><a href="/learn">Learn</a> / <a href="/learn/${escapeHtml(segment)}">${escapeHtml(label)}</a> / <a href="/learn/${escapeHtml(segment)}/${escapeHtml(sectionId)}">${escapeHtml(sectionTitle)}</a> / ${escapeHtml(lessonTitle)}</nav>
      <h1>${escapeHtml(lessonTitle)}</h1>
      ${item.difficulty ? `<p>Difficulty: ${escapeHtml(item.difficulty)}</p>` : ""}
      ${question ? `<h2>Question</h2>\n      <p>${escapeHtml(question)}</p>\n      <h2>Answer</h2>` : ""}
${paragraphs.map((p) => `      <p>${escapeHtml(p)}</p>`).join("\n")}
      ${
        examples.length
          ? `<h2>Code examples</h2>\n${examples
              .map(
                (ex) =>
                  `      <h3>${escapeHtml(ex.title ?? "Example")}</h3>\n      <pre><code>${escapeHtml(ex.code ?? "")}</code></pre>${ex.explanation ? `\n      <p>${escapeHtml(ex.explanation)}</p>` : ""}`,
              )
              .join("\n")}`
          : ""
      }
      ${notes.length ? `<h2>Key points</h2>\n      <ul>\n${notes.map((n) => `        <li>${escapeHtml(n)}</li>`).join("\n")}\n      </ul>` : ""}
      ${concepts.length ? `<h2>Concepts covered</h2>\n      <p>${escapeHtml(concepts.join(", "))}</p>` : ""}`;

  const crumbs = breadcrumb([
    { name: "Learn", path: "/learn" },
    { name: label, path: `/learn/${segment}` },
    { name: sectionTitle, path: `/learn/${segment}/${sectionId}` },
    { name: lessonTitle, path },
  ]);

  // Interview questions are a genuine Q&A pair, which is the shape Google's
  // question rich results and AI answer engines cite from. Plain lessons are
  // TechArticle instead.
  const primary = isInterview && question
    ? {
        "@context": "https://schema.org",
        "@type": "QAPage",
        mainEntity: {
          "@type": "Question",
          name: lessonTitle,
          text: question,
          answerCount: 1,
          acceptedAnswer: {
            "@type": "Answer",
            text: toDescription(prose, 1200),
            url: `${SITE_URL}${path}`,
          },
        },
      }
    : {
        "@context": "https://schema.org",
        "@type": "TechArticle",
        headline: lessonTitle,
        description,
        url: `${SITE_URL}${path}`,
        articleSection: sectionTitle,
        proficiencyLevel: item.difficulty ?? "Beginner",
        inLanguage: "en",
        isAccessibleForFree: true,
        keywords: concepts.join(", "),
        author: { "@type": "Organization", name: "InternHack", url: SITE_URL },
        publisher: {
          "@type": "Organization",
          name: "InternHack",
          url: SITE_URL,
          logo: { "@type": "ImageObject", url: OG_IMAGE },
        },
      };

  return {
    path,
    // Most interview section titles already end in "Interview", so appending
    // "Question" only made the title long enough to get the context dropped.
    title: isInterview
      ? fitTitle(
          lessonTitle,
          /interview$/i.test(sectionTitle) ? sectionTitle : `${sectionTitle} Interview`,
        )
      : fitTitle(lessonTitle, qualify(label, sectionTitle)),
    description,
    body,
    structuredData: [primary, crumbs],
  };
}

function collectPages() {
  const pages = [];
  for (const [dir, area] of Object.entries(LEARN_AREAS)) {
    const sections = readSections(dir);
    for (const { sectionId, items } of readLessonFiles(dir)) {
      const section = sections.get(sectionId);
      pages.push(sectionPage({ area, sectionId, section, items }));
      for (const item of items) {
        if (!item?.id) continue;
        pages.push(lessonPage({ area, sectionId, section, item }));
      }
    }
  }
  return pages;
}

// ── Shell rewriting ─────────────────────────────────────────────────
/**
 * Swap the homepage head tags in the built shell for this page's own, and put
 * the static content inside #root. Kept as targeted replacements rather than a
 * template so the script never has to know about the hashed asset tags Vite
 * injects.
 */
function renderPage(shell, page) {
  const canonical = `${SITE_URL}${page.path}`;
  const title = `${page.title} | InternHack`;
  let html = shell;

  html = html.replace(/<title>[\s\S]*?<\/title>/, `<title>${escapeHtml(title)}</title>`);
  html = html.replace(
    /<meta\s+name="description"[\s\S]*?\/>/,
    `<meta name="description" content="${escapeHtml(page.description)}" />`,
  );

  const swap = (attr, name, value) => {
    const re = new RegExp(`<meta\\s+${attr}="${name}"[\\s\\S]*?\\/>`);
    html = html.replace(re, `<meta ${attr}="${name}" content="${escapeHtml(value)}" />`);
  };
  swap("property", "og:url", canonical);
  swap("property", "og:title", title);
  swap("property", "og:description", page.description);
  swap("property", "og:type", "article");
  swap("name", "twitter:url", canonical);
  swap("name", "twitter:title", title);
  swap("name", "twitter:description", page.description);

  // The shell's WebApplication block describes the homepage specifically, so it
  // would be a wrong claim repeated on 1,400 lesson pages. WebSite and
  // Organization are site-wide and stay.
  html = html.replace(
    /\s*<script type="application\/ld\+json">\s*\{\s*"@context": "https:\/\/schema\.org",\s*"@type": "WebApplication"[\s\S]*?<\/script>/,
    "",
  );

  // The shell has no canonical (it is injected at runtime by <SEO>), so add one.
  const head = [
    `<link rel="canonical" href="${canonical}" />`,
    ...page.structuredData.map(
      (d) => `<script type="application/ld+json">${jsonLd(d)}</script>`,
    ),
  ].join("\n    ");
  html = html.replace("</head>", `  ${head}\n  </head>`);

  // React clears #root on mount, so this block is crawler-only.
  html = html.replace(
    /<div id="root">\s*<\/div>/,
    `<div id="root"><div data-prerendered="true">${page.body}\n    </div></div>`,
  );

  // The body <noscript> is the homepage pitch and site nav. #root now holds this
  // page's real content, so leaving it would repeat the same marketing
  // boilerplate on every page. Keep a short JS notice in its place. Matched on
  // the inner <div> so it cannot hit the font-fallback <noscript> in <head>,
  // which wraps a <link> and must survive.
  html = html.replace(
    /<noscript>\s*<div[\s\S]*?<\/noscript>/,
    `<noscript><p style="max-width:780px;margin:24px auto;padding:0 24px;font-family:system-ui,sans-serif;color:#57534e">` +
      `JavaScript is required for the interactive version of this page, including the code playground and progress tracking. ` +
      `<a href="/learn">Browse all InternHack tutorials</a>.</p></noscript>`,
  );

  return html;
}

function main() {
  // Prefer the pristine shell the learn-sitemap Vite plugin stashes. When
  // prerendering is enabled, dist/index.html has been replaced by the fully
  // rendered homepage (content in #root, helmet-injected head tags), which is
  // useless as a template. Without prerendering the two are identical.
  const stashPath = join(DIST, "seo-shell.html");
  const shellPath = existsSync(stashPath) ? stashPath : join(DIST, "index.html");
  if (!existsSync(shellPath)) {
    console.error("[seo-pages] no shell found in dist, run `vite build` first");
    process.exit(1);
  }
  const shell = readFileSync(shellPath, "utf8");

  // A shell that never matched the expected markup would silently produce 1,400
  // copies of the homepage, which is worse than not running at all.
  if (!/<div id="root">\s*<\/div>/.test(shell)) {
    console.error(
      `[seo-pages] no empty <div id="root"> in ${shellPath}. If prerendering ran, ` +
        "the learn-sitemap plugin should have emitted dist/seo-shell.html.",
    );
    process.exit(1);
  }

  const pages = collectPages();
  for (const page of pages) {
    const outDir = join(DIST, page.path);
    mkdirSync(outDir, { recursive: true });
    writeFileSync(join(outDir, "index.html"), renderPage(shell, page), "utf8");
  }

  // The stash is a build artifact, not something to serve.
  if (shellPath === stashPath) rmSync(stashPath, { force: true });

  const sections = pages.filter((p) => p.path.split("/").length === 4).length;
  console.log(
    `[seo-pages] wrote ${pages.length} static pages (${sections} sections, ${pages.length - sections} lessons)`,
  );
}

main();
