import { prisma } from "../../database/db.js";

const SITE_URL = "https://www.internhack.xyz";

interface SitemapUrl {
  loc: string;
  lastmod?: string;
  changefreq: "always" | "hourly" | "daily" | "weekly" | "monthly" | "yearly" | "never";
  priority: number;
}

/**
 * /sitemap.xml is a sitemap index rather than one flat file. Splitting it keeps
 * every child well under the 50,000-URL limit, lets Search Console report
 * indexation per content type, and means a slow query on one section cannot
 * block the others.
 *
 * `learn` is the odd one out: it is a static file emitted by the client build
 * (see client/vite.config.ts learnSitemapPlugin) because the ~1,400 lesson and
 * interview-question pages come from JSON in the client repo, which this server
 * cannot see. It is listed here so crawlers still discover it from the index.
 */
export type SitemapSection = "pages" | "companies" | "content" | "jobs";

const STATIC_CHILDREN = ["learn"] as const;

// ── Static learn routes ─────────────────────────────────────────
const LEARN_LANGUAGES = [
  "javascript", "html", "css", "typescript", "react",
  "python", "nodejs", "django", "flask", "fastapi", "blockchain",
  "data-analytics",
];

const LEARN_EXTRAS = [
  "/learn/sql", "/learn/sql/playground",
  "/learn/dsa", "/learn/dsa/companies",
  "/learn/dsa-foundations",
  "/learn/aptitude", "/learn/aptitude/companies",
  "/learn/aptitude/verbal-ability",
  "/learn/interview",
  "/learn/system-design",
  "/learn/computer-networks",
  "/learn/exam-prep",
];

// ── Per-section in-memory cache (1 hour) ────────────────────────
const cache = new Map<string, { xml: string; expiresAt: number }>();
const CACHE_TTL = 60 * 60 * 1000; // 1 hour

function escapeXml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function toIsoDate(d: Date): string {
  return d.toISOString().split("T")[0]!;
}

/** Newest updatedAt in a set of rows, as a lastmod string. Undefined if empty. */
function latestMod(rows: { updatedAt: Date }[]): string | undefined {
  if (rows.length === 0) return undefined;
  let newest = rows[0]!.updatedAt;
  for (const row of rows) if (row.updatedAt > newest) newest = row.updatedAt;
  return toIsoDate(newest);
}

function buildUrl(entry: SitemapUrl): string {
  let xml = `  <url>\n    <loc>${escapeXml(entry.loc)}</loc>\n`;
  if (entry.lastmod) xml += `    <lastmod>${entry.lastmod}</lastmod>\n`;
  xml += `    <changefreq>${entry.changefreq}</changefreq>\n`;
  xml += `    <priority>${entry.priority.toFixed(1)}</priority>\n`;
  xml += `  </url>`;
  return xml;
}

function urlSet(urls: SitemapUrl[]): string {
  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">',
    ...urls.map(buildUrl),
    "</urlset>",
  ].join("\n");
}

export class SitemapService {
  /** Sitemap index served at /sitemap.xml. */
  generateIndex(): string {
    const children = [
      ...(["pages", "companies", "content", "jobs"] as const),
      ...STATIC_CHILDREN,
    ];
    return [
      '<?xml version="1.0" encoding="UTF-8"?>',
      '<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">',
      ...children.map(
        (name) =>
          `  <sitemap>\n    <loc>${SITE_URL}/sitemap-${name}.xml</loc>\n  </sitemap>`,
      ),
      "</sitemapindex>",
    ].join("\n");
  }

  /** One child sitemap, memoised for an hour. */
  async generateSection(section: SitemapSection): Promise<string> {
    const hit = cache.get(section);
    if (hit && hit.expiresAt > Date.now()) return hit.xml;

    const urls =
      section === "pages"
        ? this.pageUrls()
        : section === "companies"
          ? await this.companyUrls()
          : section === "content"
            ? await this.contentUrls()
            : await this.jobUrls();

    const xml = urlSet(urls);
    cache.set(section, { xml, expiresAt: Date.now() + CACHE_TTL });
    return xml;
  }

  // ── Static pages and hand-built landing pages ────────────────
  // Deliberately no <lastmod> here. These change on deploy, not on a schedule,
  // and stamping "today" on every regeneration (which is what this used to do)
  // teaches crawlers that our lastmod carries no information.
  private pageUrls(): SitemapUrl[] {
    // Note: /jobs and /jobs/t/<slug> are deliberately absent. They were being
    // submitted but no such routes existed, so all 16 were soft-404s. /jobs now
    // redirects to /external-jobs, and a redirect must never be in a sitemap.
    const urls: SitemapUrl[] = [
      { loc: `${SITE_URL}/`, changefreq: "weekly", priority: 1.0 },
      { loc: `${SITE_URL}/internships`, changefreq: "weekly", priority: 0.8 },
      // /external-jobs lives in the jobs section instead, where it can carry a
      // real lastmod. Listing it here too would duplicate it across children.
      { loc: `${SITE_URL}/companies`, changefreq: "weekly", priority: 0.8 },
      { loc: `${SITE_URL}/ats-score`, changefreq: "monthly", priority: 0.9 },
      { loc: `${SITE_URL}/grants`, changefreq: "weekly", priority: 0.7 },
      { loc: `${SITE_URL}/opensource`, changefreq: "weekly", priority: 0.7 },
      { loc: `${SITE_URL}/learn`, changefreq: "weekly", priority: 0.9 },
      { loc: `${SITE_URL}/roadmaps`, changefreq: "weekly", priority: 0.9 },
      { loc: `${SITE_URL}/contributors`, changefreq: "weekly", priority: 0.4 },
      { loc: `${SITE_URL}/login`, changefreq: "monthly", priority: 0.3 },
      { loc: `${SITE_URL}/register`, changefreq: "monthly", priority: 0.4 },
      { loc: `${SITE_URL}/terms`, changefreq: "yearly", priority: 0.2 },
      { loc: `${SITE_URL}/privacy`, changefreq: "yearly", priority: 0.2 },
      { loc: `${SITE_URL}/refund`, changefreq: "yearly", priority: 0.2 },
      { loc: `${SITE_URL}/shipping`, changefreq: "yearly", priority: 0.2 },
      { loc: `${SITE_URL}/contact`, changefreq: "yearly", priority: 0.3 },
    ];

    // Learn hubs. The per-section and per-lesson pages under these live in
    // sitemap-learn.xml, emitted by the client build.
    for (const lang of LEARN_LANGUAGES) {
      urls.push({ loc: `${SITE_URL}/learn/${lang}`, changefreq: "monthly", priority: 0.8 });
    }
    for (const extra of LEARN_EXTRAS) {
      urls.push({ loc: `${SITE_URL}${extra}`, changefreq: "monthly", priority: 0.7 });
    }

    return urls;
  }

  // ── Company and YC profile pages ─────────────────────────────
  private async companyUrls(): Promise<SitemapUrl[]> {
    const [companies, ycCompanies] = await Promise.all([
      prisma.company.findMany({
        where: { isApproved: true },
        select: { slug: true, updatedAt: true },
        orderBy: { updatedAt: "desc" },
        take: 5000,
      }),
      prisma.ycCompany.findMany({
        select: { slug: true, updatedAt: true },
        orderBy: { updatedAt: "desc" },
        take: 5000,
      }),
    ]);

    return [
      ...companies.map((c): SitemapUrl => ({
        loc: `${SITE_URL}/companies/${c.slug}`,
        lastmod: toIsoDate(c.updatedAt),
        changefreq: "weekly",
        priority: 0.6,
      })),
      ...ycCompanies.map((yc): SitemapUrl => ({
        loc: `${SITE_URL}/yc/${yc.slug}`,
        lastmod: toIsoDate(yc.updatedAt),
        changefreq: "monthly",
        priority: 0.5,
      })),
    ];
  }

  // ── DSA, roadmaps, aptitude, open source ─────────────────────
  private async contentUrls(): Promise<SitemapUrl[]> {
    const [dsaTopics, dsaProblems, roadmaps, ossRepos, aptTopics] = await Promise.all([
      prisma.dsaTopic.findMany({ select: { slug: true } }),
      // Problem detail pages were missing entirely: only the topic hubs were
      // submitted, so every individual problem was unreachable from the sitemap.
      prisma.dsaProblem.findMany({
        where: { isPremium: false },
        select: { slug: true },
        take: 5000,
      }),
      prisma.roadmap.findMany({
        where: { isPublished: true },
        select: {
          slug: true,
          updatedAt: true,
          sections: { select: { topics: { select: { slug: true } } } },
        },
      }),
      prisma.opensourceRepo.findMany({
        select: { owner: true, name: true, updatedAt: true },
        orderBy: { stars: "desc" },
        take: 5000,
      }),
      prisma.aptitudeTopic.findMany({ select: { slug: true } }),
    ]);

    const urls: SitemapUrl[] = [];

    for (const t of dsaTopics) {
      urls.push({ loc: `${SITE_URL}/learn/dsa/${t.slug}`, changefreq: "monthly", priority: 0.6 });
    }
    for (const p of dsaProblems) {
      urls.push({
        loc: `${SITE_URL}/learn/dsa/problem/${p.slug}`,
        changefreq: "monthly",
        priority: 0.5,
      });
    }
    for (const r of roadmaps) {
      urls.push({
        loc: `${SITE_URL}/roadmaps/${r.slug}`,
        lastmod: toIsoDate(r.updatedAt),
        changefreq: "weekly",
        priority: 0.8,
      });
      for (const section of r.sections) {
        for (const topic of section.topics) {
          urls.push({
            loc: `${SITE_URL}/roadmaps/${r.slug}/topics/${topic.slug}`,
            lastmod: toIsoDate(r.updatedAt),
            changefreq: "monthly",
            priority: 0.6,
          });
        }
      }
    }
    for (const repo of ossRepos) {
      urls.push({
        loc: `${SITE_URL}/opensource/${encodeURIComponent(repo.owner)}/${encodeURIComponent(repo.name)}`,
        lastmod: toIsoDate(repo.updatedAt),
        changefreq: "weekly",
        priority: 0.6,
      });
    }
    for (const t of aptTopics) {
      urls.push({
        loc: `${SITE_URL}/learn/aptitude/${t.slug}`,
        changefreq: "monthly",
        priority: 0.6,
      });
      urls.push({
        loc: `${SITE_URL}/learn/aptitude/${t.slug}/practice`,
        changefreq: "monthly",
        priority: 0.5,
      });
    }

    return urls;
  }

  // ── Job detail pages ─────────────────────────────────────────
  // Both of these were absent from the old sitemap, so no individual job page
  // was ever submitted. Only live postings are listed: an expired job that 404s
  // or redirects is worse than an omission.
  private async jobUrls(): Promise<SitemapUrl[]> {
    const now = new Date();
    const [adminJobs, scrapedJobs] = await Promise.all([
      prisma.adminJob.findMany({
        where: { isActive: true, expiresAt: { gt: now }, slug: { not: null } },
        select: { slug: true, updatedAt: true },
        orderBy: { updatedAt: "desc" },
        take: 5000,
      }),
      prisma.scrapedJob.findMany({
        where: { status: "ACTIVE" },
        select: { id: true, updatedAt: true },
        orderBy: { updatedAt: "desc" },
        take: 5000,
      }),
    ]);

    const urls: SitemapUrl[] = [];

    // The listing hub, always present, with a real lastmod when we have one:
    // the newest posting it contains.
    const scrapedMod = latestMod(scrapedJobs);
    urls.push({
      loc: `${SITE_URL}/external-jobs`,
      ...(scrapedMod && { lastmod: scrapedMod }),
      changefreq: "daily",
      priority: 0.9,
    });

    for (const job of adminJobs) {
      urls.push({
        loc: `${SITE_URL}/jobs/ext/${job.slug}`,
        lastmod: toIsoDate(job.updatedAt),
        changefreq: "weekly",
        priority: 0.7,
      });
    }
    for (const job of scrapedJobs) {
      urls.push({
        loc: `${SITE_URL}/external-jobs/${job.id}`,
        lastmod: toIsoDate(job.updatedAt),
        changefreq: "weekly",
        priority: 0.5,
      });
    }

    return urls;
  }
}
