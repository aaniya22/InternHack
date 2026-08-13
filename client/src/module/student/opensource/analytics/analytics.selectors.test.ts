import { describe, expect, it } from "vitest";
import type { GSoCOrganization } from "../../../../lib/types";
import {
  ALL,
  avgProjectsByCategory,
  categoryShare,
  categoryYearMatrix,
  cohortsPerYear,
  comparisonRadar,
  countActiveFilters,
  EMPTY_FILTERS,
  filterOrgs,
  latestCohort,
  longevityBuckets,
  participationYears,
  profileVsMedian,
  projectsByYear,
  rankByProjects,
  rankedOptions,
  technologyCounts,
  topByProjects,
  topByProjectsPerYear,
  volumeBuckets,
} from "./analytics.selectors";

function org(overrides: Partial<GSoCOrganization> & { id: number; name: string }): GSoCOrganization {
  return {
    slug: overrides.name.toLowerCase().replace(/\s+/g, "-"),
    url: "https://example.org",
    description: "An organization",
    category: "Web",
    topics: [],
    technologies: [],
    yearsParticipated: [],
    totalProjects: 0,
    ...overrides,
  };
}

const ORGS: GSoCOrganization[] = [
  org({
    id: 1,
    name: "Numfocus",
    category: "Science and medicine",
    description: "Scientific computing",
    technologies: ["python", "c++"],
    topics: ["data", "science"],
    yearsParticipated: [2020, 2021, 2022],
    totalProjects: 60,
  }),
  org({
    id: 2,
    name: "Django",
    category: "Web",
    description: "The web framework",
    technologies: ["python", "javascript"],
    topics: ["web"],
    yearsParticipated: [2021, 2022],
    totalProjects: 20,
  }),
  org({
    id: 3,
    name: "Newcomer",
    category: "Web",
    description: "Brand new this year",
    technologies: ["rust"],
    topics: ["web"],
    yearsParticipated: [2022],
    totalProjects: 0,
  }),
];

describe("filterOrgs", () => {
  it("returns everything when no filter is set", () => {
    expect(filterOrgs(ORGS, EMPTY_FILTERS)).toHaveLength(3);
  });

  it("matches search against name and description", () => {
    expect(filterOrgs(ORGS, { ...EMPTY_FILTERS, search: "djan" }).map((o) => o.id)).toEqual([2]);
    expect(filterOrgs(ORGS, { ...EMPTY_FILTERS, search: "scientific" }).map((o) => o.id)).toEqual([1]);
    expect(filterOrgs(ORGS, { ...EMPTY_FILTERS, search: "  DJANGO " }).map((o) => o.id)).toEqual([2]);
  });

  it("filters by year, category, technology and topic", () => {
    expect(filterOrgs(ORGS, { ...EMPTY_FILTERS, year: "2020" }).map((o) => o.id)).toEqual([1]);
    expect(filterOrgs(ORGS, { ...EMPTY_FILTERS, category: "Web" }).map((o) => o.id)).toEqual([2, 3]);
    expect(filterOrgs(ORGS, { ...EMPTY_FILTERS, technology: "python" }).map((o) => o.id)).toEqual([1, 2]);
    expect(filterOrgs(ORGS, { ...EMPTY_FILTERS, topic: "science" }).map((o) => o.id)).toEqual([1]);
  });

  it("filters by minimum project count", () => {
    expect(filterOrgs(ORGS, { ...EMPTY_FILTERS, minProjects: "25" }).map((o) => o.id)).toEqual([1]);
    expect(filterOrgs(ORGS, { ...EMPTY_FILTERS, minProjects: "10" }).map((o) => o.id)).toEqual([1, 2]);
  });

  it("filters by tenure band", () => {
    expect(filterOrgs(ORGS, { ...EMPTY_FILTERS, yearsActive: "1" }).map((o) => o.id)).toEqual([3]);
    expect(filterOrgs(ORGS, { ...EMPTY_FILTERS, yearsActive: "2-3" }).map((o) => o.id)).toEqual([1, 2]);
    expect(filterOrgs(ORGS, { ...EMPTY_FILTERS, yearsActive: "7+" })).toHaveLength(0);
  });

  it("combines filters", () => {
    const result = filterOrgs(ORGS, { ...EMPTY_FILTERS, category: "Web", minProjects: "10" });
    expect(result.map((o) => o.id)).toEqual([2]);
  });
});

describe("countActiveFilters", () => {
  it("counts only the fields that moved off their default", () => {
    expect(countActiveFilters(EMPTY_FILTERS)).toBe(0);
    expect(countActiveFilters({ ...EMPTY_FILTERS, search: "x", year: "2022" })).toBe(2);
    expect(countActiveFilters({ ...EMPTY_FILTERS, category: ALL })).toBe(0);
  });
});

describe("option lists", () => {
  it("ranks options by organization count, then alphabetically", () => {
    expect(rankedOptions(ORGS, (o) => o.technologies)).toEqual([
      { value: "python", label: "python", count: 2 },
      { value: "c++", label: "c++", count: 1 },
      { value: "javascript", label: "javascript", count: 1 },
      { value: "rust", label: "rust", count: 1 },
    ]);
  });

  it("lists participation years newest first", () => {
    expect(participationYears(ORGS)).toEqual([2022, 2021, 2020]);
  });
});

describe("chart datasets", () => {
  it("computes category counts and share", () => {
    expect(categoryShare(ORGS)).toEqual([
      { name: "Web", count: 2, share: 66.7 },
      { name: "Science and medicine", count: 1, share: 33.3 },
    ]);
  });

  it("splits each year into first-time and returning orgs", () => {
    expect(cohortsPerYear(ORGS)).toEqual([
      { year: "2020", joined: 1, returning: 0 },
      { year: "2021", joined: 1, returning: 1 },
      { year: "2022", joined: 1, returning: 2 },
    ]);
  });

  it("buckets organizations by project volume", () => {
    expect(volumeBuckets(ORGS)).toEqual([
      { bucket: "0", count: 1 },
      { bucket: "1-5", count: 0 },
      { bucket: "6-10", count: 0 },
      { bucket: "11-25", count: 1 },
      { bucket: "26-50", count: 0 },
      { bucket: "51-100", count: 1 },
      { bucket: "100+", count: 0 },
    ]);
  });

  it("buckets organizations by tenure", () => {
    expect(longevityBuckets(ORGS)).toEqual([
      { yearsActive: "1 yr", count: 1 },
      { yearsActive: "2 yrs", count: 1 },
      { yearsActive: "3 yrs", count: 1 },
    ]);
  });

  it("averages project counts per category", () => {
    expect(avgProjectsByCategory(ORGS)).toEqual([
      { name: "Science and medicine", average: 60, category: "1 org · 60 projects" },
      { name: "Web", average: 10, category: "2 orgs · 20 projects" },
    ]);
  });

  it("ranks by total projects and honours the top N", () => {
    expect(topByProjects(ORGS, 2).map((r) => r.name)).toEqual(["Numfocus", "Django"]);
  });

  it("ranks by projects per active year and drops orgs with no projects", () => {
    expect(topByProjectsPerYear(ORGS, 5)).toEqual([
      { name: "Numfocus", perYear: 20, category: "60 projects over 3 years" },
      { name: "Django", perYear: 10, category: "20 projects over 2 years" },
    ]);
  });

  it("caps ranking charts at the requested size", () => {
    expect(technologyCounts(ORGS, 2)).toEqual([
      { name: "python", count: 2 },
      { name: "c++", count: 1 },
    ]);
  });

  it("builds a category by year matrix", () => {
    const { rows, cols, valueAt } = categoryYearMatrix(ORGS);
    expect(rows).toEqual(["Web", "Science and medicine"]);
    expect(cols).toEqual(["2020", "2021", "2022"]);
    expect(valueAt("Web", "2022")).toBe(2);
    expect(valueAt("Web", "2020")).toBe(0);
    expect(valueAt("Science and medicine", "2020")).toBe(1);
  });

  it("limits the matrix to the busiest categories", () => {
    expect(categoryYearMatrix(ORGS, 1).rows).toEqual(["Web"]);
  });
});

describe("comparison", () => {
  it("normalises each radar axis against the largest value in the set", () => {
    const rows = comparisonRadar(ORGS, [1, 2]);
    expect(rows).toEqual([
      { axis: "Projects", Numfocus: 100, Django: 33 },
      { axis: "Years active", Numfocus: 100, Django: 67 },
      { axis: "Technologies", Numfocus: 100, Django: 100 },
      { axis: "Topics", Numfocus: 100, Django: 50 },
    ]);
  });

  it("returns nothing when the selection is empty", () => {
    expect(comparisonRadar(ORGS, [])).toEqual([]);
  });

  it("places one organization against the median of the set", () => {
    const rows = profileVsMedian(ORGS, ORGS[1]);
    expect(rows[0]).toEqual({ axis: "Projects", org: 33, median: 33 });
    expect(rows[1]).toEqual({ axis: "Years active", org: 67, median: 67 });
  });

  it("ranks by project count with ties sharing a place", () => {
    expect(rankByProjects(ORGS, ORGS[0])).toBe(1);
    expect(rankByProjects(ORGS, ORGS[1])).toBe(2);
    expect(rankByProjects(ORGS, ORGS[2])).toBe(3);
  });
});

describe("single organization", () => {
  const withProjects = org({
    id: 9,
    name: "Detailed",
    yearsParticipated: [2024, 2025],
    totalProjects: 5,
    projectsData: {
      "2024": { projects_url: "u", num_projects: 3, projects: [] },
      "2025": {
        projects_url: "u",
        num_projects: 2,
        projects: [
          {
            title: "A project",
            short_description: "",
            description: "",
            student_name: "Ada",
            code_url: "https://code",
            project_url: "https://project",
          },
        ],
      },
      // Enrichment keys live alongside the year keys and must be ignored.
      _githubRepos: [{ title: "repo", url: "https://repo" }],
      _gsocPageUrl: "https://gsoc",
    } as unknown as GSoCOrganization["projectsData"],
  });

  it("reads per-year counts and skips the underscore keys", () => {
    expect(projectsByYear(withProjects)).toEqual([
      { year: "2024", projects: 3 },
      { year: "2025", projects: 2 },
    ]);
  });

  it("returns an empty series when there is no archive", () => {
    expect(projectsByYear(ORGS[0])).toEqual([]);
  });

  it("picks the most recent year that actually has projects", () => {
    const cohort = latestCohort(withProjects);
    expect(cohort?.year).toBe("2025");
    expect(cohort?.projects).toHaveLength(1);
  });

  it("returns null when no year has project titles", () => {
    expect(latestCohort(ORGS[0])).toBeNull();
  });
});
