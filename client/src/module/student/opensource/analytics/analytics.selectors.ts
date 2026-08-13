import type { GSoCOrganization } from "../../../../lib/types";

/**
 * Pure derivations behind the open source analytics page. Everything here takes
 * the already-fetched organization list and returns chart-ready rows, so the
 * page component stays layout-only and each dataset is testable on its own.
 */

// ─── Filters ────────────────────────────────────────────────────

export interface OrgFilters {
  search: string;
  year: string;
  category: string;
  technology: string;
  topic: string;
  minProjects: string;
  yearsActive: string;
}

export const ALL = "ALL";

export const EMPTY_FILTERS: OrgFilters = {
  search: "",
  year: ALL,
  category: ALL,
  technology: ALL,
  topic: ALL,
  minProjects: ALL,
  yearsActive: ALL,
};

export const MIN_PROJECT_OPTIONS = [
  { value: ALL, label: "Any size" },
  { value: "10", label: "10+ projects" },
  { value: "25", label: "25+ projects" },
  { value: "50", label: "50+ projects" },
  { value: "100", label: "100+ projects" },
];

const YEARS_ACTIVE_RANGES: Record<string, [number, number]> = {
  "1": [1, 1],
  "2-3": [2, 3],
  "4-6": [4, 6],
  "7+": [7, Number.POSITIVE_INFINITY],
};

export const YEARS_ACTIVE_OPTIONS = [
  { value: ALL, label: "Any tenure" },
  { value: "1", label: "1 year (new)" },
  { value: "2-3", label: "2 to 3 years" },
  { value: "4-6", label: "4 to 6 years" },
  { value: "7+", label: "7+ years (veteran)" },
];

export function filterOrgs(orgs: GSoCOrganization[], f: OrgFilters): GSoCOrganization[] {
  const needle = f.search.trim().toLowerCase();
  const range = YEARS_ACTIVE_RANGES[f.yearsActive];
  const minProjects = f.minProjects === ALL ? 0 : Number(f.minProjects);

  return orgs.filter((o) => {
    if (needle && !o.name.toLowerCase().includes(needle) && !o.description.toLowerCase().includes(needle)) {
      return false;
    }
    if (f.year !== ALL && !o.yearsParticipated.includes(Number(f.year))) return false;
    if (f.category !== ALL && o.category !== f.category) return false;
    if (f.technology !== ALL && !o.technologies.includes(f.technology)) return false;
    if (f.topic !== ALL && !o.topics.includes(f.topic)) return false;
    if (o.totalProjects < minProjects) return false;
    if (range) {
      const tenure = o.yearsParticipated.length;
      if (tenure < range[0] || tenure > range[1]) return false;
    }
    return true;
  });
}

export function countActiveFilters(f: OrgFilters): number {
  return (Object.keys(EMPTY_FILTERS) as (keyof OrgFilters)[]).filter((k) => f[k] !== EMPTY_FILTERS[k])
    .length;
}

// ─── Filter option lists ────────────────────────────────────────

function countBy(orgs: GSoCOrganization[], pick: (o: GSoCOrganization) => string[]) {
  const counts = new Map<string, number>();
  for (const o of orgs) {
    for (const v of pick(o)) counts.set(v, (counts.get(v) ?? 0) + 1);
  }
  return counts;
}

/** Sorted descending by organization count, so the busiest options come first. */
export function rankedOptions(orgs: GSoCOrganization[], pick: (o: GSoCOrganization) => string[]) {
  return Array.from(countBy(orgs, pick).entries())
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .map(([value, count]) => ({ value, label: value, count }));
}

export function participationYears(orgs: GSoCOrganization[]): number[] {
  const set = new Set<number>();
  for (const o of orgs) for (const y of o.yearsParticipated) set.add(y);
  return Array.from(set).sort((a, b) => b - a);
}

// ─── Chart datasets ─────────────────────────────────────────────

export function categoryShare(orgs: GSoCOrganization[]) {
  const counts = countBy(orgs, (o) => [o.category]);
  const total = orgs.length || 1;
  return Array.from(counts.entries())
    .map(([name, count]) => ({ name, count, share: Math.round((count / total) * 1000) / 10 }))
    .sort((a, b) => b.count - a.count);
}

export function orgsPerYear(orgs: GSoCOrganization[]) {
  const counts = new Map<number, number>();
  for (const o of orgs) for (const y of o.yearsParticipated) counts.set(y, (counts.get(y) ?? 0) + 1);
  return Array.from(counts.entries())
    .sort((a, b) => a[0] - b[0])
    .map(([year, count]) => ({ year: String(year), count }));
}

export function technologyCounts(orgs: GSoCOrganization[], topN: number) {
  return rankedOptions(orgs, (o) => o.technologies)
    .slice(0, topN)
    .map((t) => ({ name: t.value, count: t.count }));
}

export function topicCounts(orgs: GSoCOrganization[], topN: number) {
  return rankedOptions(orgs, (o) => o.topics)
    .slice(0, topN)
    .map((t) => ({ name: t.value, count: t.count }));
}

const shortName = (name: string) => (name.length > 24 ? `${name.slice(0, 22)}...` : name);

export function topByProjects(orgs: GSoCOrganization[], topN: number) {
  return [...orgs]
    .sort((a, b) => b.totalProjects - a.totalProjects)
    .slice(0, topN)
    .map((o) => ({ name: shortName(o.name), projects: o.totalProjects, category: o.category }));
}

/** Projects divided by years in the program: throughput rather than raw total. */
export function topByProjectsPerYear(orgs: GSoCOrganization[], topN: number) {
  return orgs
    .filter((o) => o.yearsParticipated.length > 0 && o.totalProjects > 0)
    .map((o) => ({
      name: shortName(o.name),
      perYear: Math.round((o.totalProjects / o.yearsParticipated.length) * 10) / 10,
      category: `${o.totalProjects} projects over ${o.yearsParticipated.length} years`,
    }))
    .sort((a, b) => b.perYear - a.perYear)
    .slice(0, topN);
}

export function longevityBuckets(orgs: GSoCOrganization[]) {
  const counts = new Map<number, number>();
  for (const o of orgs) {
    const n = o.yearsParticipated.length;
    counts.set(n, (counts.get(n) ?? 0) + 1);
  }
  return Array.from(counts.entries())
    .sort((a, b) => a[0] - b[0])
    .map(([years, count]) => ({ yearsActive: `${years} yr${years > 1 ? "s" : ""}`, count }));
}

const VOLUME_BUCKETS: { label: string; max: number }[] = [
  { label: "0", max: 0 },
  { label: "1-5", max: 5 },
  { label: "6-10", max: 10 },
  { label: "11-25", max: 25 },
  { label: "26-50", max: 50 },
  { label: "51-100", max: 100 },
  { label: "100+", max: Number.POSITIVE_INFINITY },
];

export function volumeBuckets(orgs: GSoCOrganization[]) {
  const counts = new Map<string, number>(VOLUME_BUCKETS.map((b) => [b.label, 0]));
  for (const o of orgs) {
    const bucket = VOLUME_BUCKETS.find((b) => o.totalProjects <= b.max);
    if (bucket) counts.set(bucket.label, (counts.get(bucket.label) ?? 0) + 1);
  }
  return VOLUME_BUCKETS.map((b) => ({ bucket: b.label, count: counts.get(b.label) ?? 0 }));
}

/**
 * Splits each year into organizations running GSoC for the first time and those
 * that had taken part before. Stack height is the year total, so no second axis.
 */
export function cohortsPerYear(orgs: GSoCOrganization[]) {
  const joined = new Map<number, number>();
  const returning = new Map<number, number>();
  for (const o of orgs) {
    if (o.yearsParticipated.length === 0) continue;
    const first = Math.min(...o.yearsParticipated);
    for (const y of o.yearsParticipated) {
      const target = y === first ? joined : returning;
      target.set(y, (target.get(y) ?? 0) + 1);
    }
  }
  const years = Array.from(new Set([...joined.keys(), ...returning.keys()])).sort((a, b) => a - b);
  return years.map((year) => ({
    year: String(year),
    joined: joined.get(year) ?? 0,
    returning: returning.get(year) ?? 0,
  }));
}

export function projectsVsTenure(orgs: GSoCOrganization[]) {
  return orgs.map((o) => ({
    name: o.name,
    category: o.category,
    tenure: o.yearsParticipated.length,
    projects: o.totalProjects,
    stack: o.technologies.length,
  }));
}

export function avgProjectsByCategory(orgs: GSoCOrganization[]) {
  const totals = new Map<string, { sum: number; n: number }>();
  for (const o of orgs) {
    const entry = totals.get(o.category) ?? { sum: 0, n: 0 };
    entry.sum += o.totalProjects;
    entry.n += 1;
    totals.set(o.category, entry);
  }
  return Array.from(totals.entries())
    .map(([name, { sum, n }]) => ({
      name,
      average: Math.round((sum / n) * 10) / 10,
      category: `${n} org${n > 1 ? "s" : ""} · ${sum} projects`,
    }))
    .sort((a, b) => b.average - a.average);
}

/** Rows are categories (busiest first), columns are program years. */
export function categoryYearMatrix(orgs: GSoCOrganization[], maxRows = 10) {
  const rows = categoryShare(orgs)
    .slice(0, maxRows)
    .map((c) => c.name);
  const cols = participationYears(orgs)
    .sort((a, b) => a - b)
    .map(String);

  const cells = new Map<string, number>();
  for (const o of orgs) {
    if (!rows.includes(o.category)) continue;
    for (const y of o.yearsParticipated) {
      const key = `${o.category}|${y}`;
      cells.set(key, (cells.get(key) ?? 0) + 1);
    }
  }
  return { rows, cols, valueAt: (row: string, col: string) => cells.get(`${row}|${col}`) ?? 0 };
}

// ─── Comparison ─────────────────────────────────────────────────

const RADAR_AXES = ["Projects", "Years active", "Technologies", "Topics"] as const;

const metric = (o: GSoCOrganization, axis: (typeof RADAR_AXES)[number]) => {
  if (axis === "Projects") return o.totalProjects;
  if (axis === "Years active") return o.yearsParticipated.length;
  if (axis === "Technologies") return o.technologies.length;
  return o.topics.length;
};

/** Each axis normalised to a percentage of the largest value in the dataset. */
export function comparisonRadar(orgs: GSoCOrganization[], selectedIds: number[]) {
  const selected = orgs.filter((o) => selectedIds.includes(o.id));
  if (selected.length === 0) return [];
  return RADAR_AXES.map((axis) => {
    const max = Math.max(...orgs.map((o) => metric(o, axis)), 1);
    const row: Record<string, string | number> = { axis };
    for (const o of selected) row[o.name] = Math.round((metric(o, axis) / max) * 100);
    return row;
  });
}

const median = (values: number[]) => {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid];
};

/** One organization against the median of the current selection, per axis. */
export function profileVsMedian(orgs: GSoCOrganization[], org: GSoCOrganization) {
  return RADAR_AXES.map((axis) => {
    const max = Math.max(...orgs.map((o) => metric(o, axis)), 1);
    return {
      axis,
      org: Math.round((metric(org, axis) / max) * 100),
      median: Math.round((median(orgs.map((o) => metric(o, axis))) / max) * 100),
    };
  });
}

/** 1-based position of an organization when the set is ranked by project count. */
export function rankByProjects(orgs: GSoCOrganization[], org: GSoCOrganization) {
  return orgs.filter((o) => o.totalProjects > org.totalProjects).length + 1;
}

// ─── Single organization ────────────────────────────────────────

const YEAR_KEY = /^\d{4}$/;

/**
 * `projectsData` is keyed by year alongside `_`-prefixed enrichment keys, so
 * year rows have to be picked out explicitly.
 */
export function projectsByYear(org: GSoCOrganization) {
  const data = org.projectsData;
  if (!data) return [];
  return Object.entries(data)
    .filter(([key]) => YEAR_KEY.test(key))
    .map(([year, value]) => ({
      year,
      projects: value.num_projects ?? value.projects?.length ?? 0,
    }))
    .sort((a, b) => a.year.localeCompare(b.year));
}

/** Titles from the most recent year that actually ran projects. */
export function latestCohort(org: GSoCOrganization) {
  const data = org.projectsData;
  if (!data) return null;
  const years = Object.keys(data)
    .filter((k) => YEAR_KEY.test(k))
    .sort((a, b) => b.localeCompare(a));
  for (const year of years) {
    const projects = data[year]?.projects;
    if (projects?.length) return { year, projects };
  }
  return null;
}
