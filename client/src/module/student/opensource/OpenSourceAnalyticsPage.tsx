import { useState, useMemo, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { motion, AnimatePresence } from "framer-motion";
import {
  AlertCircle,
  Building2,
  Calendar,
  ChevronDown,
  Clock,
  Code2,
  Filter,
  Hash,
  Layers,
  ListOrdered,
  Search,
  Tag,
} from "lucide-react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  PolarAngleAxis,
  PolarGrid,
  PolarRadiusAxis,
  Radar,
  RadarChart,
  ResponsiveContainer,
  Scatter,
  ScatterChart,
  Tooltip,
  XAxis,
  YAxis,
  ZAxis,
} from "recharts";
import { LoadingScreen } from "../../../components/LoadingScreen";
import { PremiumUpgradeCTA } from "../../../components/PremiumUpgradeCTA";
import { SEO } from "../../../components/SEO";
import { EditorialDropdown } from "../../../components/ui/EditorialDropdown";
import { useDebounce } from "../../../hooks/useDebounce";
import { useAuthStore } from "../../../lib/auth.store";
import api from "../../../lib/axios";
import { queryKeys } from "../../../lib/query-keys";
import type {
  GSoCOrganization,
  GSoCStats,
  OpenSourceContributionTrendResponse,
} from "../../../lib/types";
import { isHacktoberfestMode } from "./_shared/hacktoberfest.utils";
import { HacktoberfestTracker } from "./HacktoberfestTracker";
import { markLearningPathMilestone } from "./learning-paths.data";
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
  longevityBuckets,
  MIN_PROJECT_OPTIONS,
  orgsPerYear,
  participationYears,
  projectsVsTenure,
  rankedOptions,
  technologyCounts,
  topByProjects,
  topByProjectsPerYear,
  topicCounts,
  volumeBuckets,
  YEARS_ACTIVE_OPTIONS,
  type OrgFilters,
} from "./analytics/analytics.selectors";
import {
  AccessibleChart,
  ChartCard,
  ChartTooltip,
  LegendLabel,
  Punchcard,
} from "./analytics/chart-kit";
import {
  AXIS,
  axisTick,
  axisTickSm,
  GRID,
  MARK,
  MARK_MUTED,
  SERIES,
  type ChartHeight,
} from "./analytics/chart-tokens";
import { OrgSpotlight } from "./analytics/OrgSpotlight";

const MAX_COMPARE = SERIES.length;
const COMPARE_CHIP_LIMIT = 60;
const TOP_N_OPTIONS = [
  { value: "10", label: "Top 10" },
  { value: "15", label: "Top 15" },
  { value: "25", label: "Top 25" },
];

/**
 * The horizontal ranking bars all read the same way, so they share one shell.
 * Bar length carries the value, which is why every bar stays on a single hue.
 */
function RankedBars({
  data,
  dataKey,
  name,
  unit,
  height,
  labelWidth,
  footerFrom,
}: {
  data: object[];
  dataKey: string;
  name: string;
  unit: string;
  height: ChartHeight;
  labelWidth: number;
  footerFrom?: string;
}) {
  return (
    <ResponsiveContainer width="100%" height={height}>
      <BarChart data={data} layout="vertical" margin={{ top: 4, right: 12, left: 0, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke={GRID} horizontal={false} />
        <XAxis type="number" tick={axisTickSm} stroke={AXIS} allowDecimals={false} />
        <YAxis dataKey="name" type="category" tick={axisTickSm} stroke={AXIS} width={labelWidth} />
        <Tooltip
          content={<ChartTooltip unit={unit} footerFrom={footerFrom} />}
          cursor={{ fill: GRID }}
        />
        <Bar dataKey={dataKey} name={name} fill={MARK} radius={[0, 4, 4, 0]} maxBarSize={18} />
      </BarChart>
    </ResponsiveContainer>
  );
}

export default function OpenSourceAnalyticsPage() {
  useEffect(() => {
    markLearningPathMilestone("leaderboard");
  }, []);

  const { user } = useAuthStore();
  const isPremium =
    user?.subscriptionStatus === "ACTIVE" &&
    user?.subscriptionPlan !== "FREE" &&
    user?.subscriptionEndDate &&
    new Date(user.subscriptionEndDate) > new Date();
  const showHacktoberfestTracker = isHacktoberfestMode();

  const [dropdownFilters, setDropdownFilters] = useState<OrgFilters>(EMPTY_FILTERS);
  const [searchInput, setSearchInput] = useState("");
  const [showFilters, setShowFilters] = useState(false);
  const [topN, setTopN] = useState("15");
  const [focusedSlug, setFocusedSlug] = useState<string>(ALL);
  const [selectedOrgs, setSelectedOrgs] = useState<number[]>([]);

  const debouncedSearch = useDebounce(searchInput, 250);
  const filters = useMemo<OrgFilters>(
    () => ({ ...dropdownFilters, search: debouncedSearch }),
    [dropdownFilters, debouncedSearch],
  );

  const setFilter =
    <K extends keyof OrgFilters>(key: K) =>
    (value: OrgFilters[K]) =>
      setDropdownFilters((prev) => ({ ...prev, [key]: value }));

  const sixMonthsAgo = new Date();
  sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6);
  const startMonth = sixMonthsAgo.toISOString().slice(0, 7);
  const endMonth = new Date().toISOString().slice(0, 7);

  const { data: stats } = useQuery<GSoCStats>({
    queryKey: queryKeys.gsoc.stats(),
    queryFn: () => api.get("/gsoc/stats").then((r) => r.data),
    staleTime: Infinity,
  });

  const { data: orgsData, isLoading } = useQuery({
    queryKey: [...queryKeys.gsoc.list(), "analytics-all"],
    queryFn: async () => {
      const all: GSoCOrganization[] = [];
      let page = 1;
      const limit = 50;
      while (true) {
        const res = await api.get("/gsoc/organizations", { params: { limit, page } });
        const batch = res.data.organizations as GSoCOrganization[];
        all.push(...batch);
        const totalPages = res.data.pagination?.totalPages ?? 1;
        if (page >= totalPages) break;
        page++;
      }
      return all;
    },
    staleTime: 5 * 60 * 1000,
  });

  const { data: contributionTrendData, isLoading: trendIsLoading } =
    useQuery<OpenSourceContributionTrendResponse>({
      queryKey: queryKeys.opensource.trend(startMonth, endMonth),
      queryFn: () =>
        api
          .get("/opensource/analytics/trend", {
            params: { startDate: startMonth, endDate: endMonth },
          })
          .then((r) => r.data),
      staleTime: 5 * 60 * 1000,
    });

  const allOrgs = useMemo(() => orgsData ?? [], [orgsData]);
  const orgs = useMemo(() => filterOrgs(allOrgs, filters), [allOrgs, filters]);

  // ─── Filter options ─────────────────────────────────────────
  const yearOptions = useMemo(
    () => [
      { value: ALL, label: "All years" },
      ...participationYears(allOrgs).map((y) => ({ value: String(y), label: String(y) })),
    ],
    [allOrgs],
  );
  const categoryOptions = useMemo(
    () => [{ value: ALL, label: "All categories" }, ...rankedOptions(allOrgs, (o) => [o.category])],
    [allOrgs],
  );
  const techOptions = useMemo(
    () => [
      { value: ALL, label: "All technologies" },
      ...rankedOptions(allOrgs, (o) => o.technologies),
    ],
    [allOrgs],
  );
  const topicOptions = useMemo(
    () => [{ value: ALL, label: "All topics" }, ...rankedOptions(allOrgs, (o) => o.topics)],
    [allOrgs],
  );
  const orgOptions = useMemo(
    () => [
      { value: ALL, label: "No single org" },
      ...[...orgs]
        .sort((a, b) => b.totalProjects - a.totalProjects)
        .map((o) => ({ value: o.slug, label: o.name, count: o.totalProjects })),
    ],
    [orgs],
  );

  const activeFilterCount = countActiveFilters(filters);
  const hasActiveFilter = activeFilterCount > 0;
  const clearFilters = () => {
    setDropdownFilters(EMPTY_FILTERS);
    setSearchInput("");
  };

  // ─── Chart data ─────────────────────────────────────────────
  const limit = Number(topN);
  const categoryRows = useMemo(() => categoryShare(orgs), [orgs]);
  const yearRows = useMemo(() => orgsPerYear(orgs), [orgs]);
  const cohortRows = useMemo(() => cohortsPerYear(orgs), [orgs]);
  const techRows = useMemo(() => technologyCounts(orgs, limit), [orgs, limit]);
  const topicRows = useMemo(() => topicCounts(orgs, limit), [orgs, limit]);
  const topProjectRows = useMemo(() => topByProjects(orgs, limit), [orgs, limit]);
  const throughputRows = useMemo(() => topByProjectsPerYear(orgs, limit), [orgs, limit]);
  const avgCategoryRows = useMemo(() => avgProjectsByCategory(orgs), [orgs]);
  const volumeRows = useMemo(() => volumeBuckets(orgs), [orgs]);
  const longevityRows = useMemo(() => longevityBuckets(orgs), [orgs]);
  const scatterRows = useMemo(() => projectsVsTenure(orgs), [orgs]);
  const matrix = useMemo(() => categoryYearMatrix(orgs), [orgs]);
  const radarRows = useMemo(() => comparisonRadar(orgs, selectedOrgs), [orgs, selectedOrgs]);
  const comparedOrgs = useMemo(
    () => orgs.filter((o) => selectedOrgs.includes(o.id)),
    [orgs, selectedOrgs],
  );

  const focusedOrg = useMemo(
    () => (focusedSlug === ALL ? null : (allOrgs.find((o) => o.slug === focusedSlug) ?? null)),
    [allOrgs, focusedSlug],
  );
  const spotlightScope = orgs.length > 0 ? orgs : allOrgs;

  const toggleOrg = (id: number) =>
    setSelectedOrgs((prev) =>
      prev.includes(id)
        ? prev.filter((x) => x !== id)
        : prev.length >= MAX_COMPARE
          ? prev
          : [...prev, id],
    );

  if (!isPremium) {
    return (
      <div className="mx-auto max-w-2xl px-4 py-16">
        <PremiumUpgradeCTA feature="Open Source Analytics" />
      </div>
    );
  }

  if (isLoading) {
    return <LoadingScreen />;
  }

  return (
    <div className="pb-16">
      <SEO title="Open Source Analytics" noIndex />

      <div className="mx-auto max-w-6xl">
        {/* Editorial header */}
        <div className="mb-10 mt-6 border-b border-stone-200 pb-8 dark:border-white/10">
          <div className="inline-flex items-center gap-2 font-mono text-xs uppercase tracking-widest text-stone-500">
            <span className="h-1.5 w-1.5 bg-lime-400" />
            open source / analytics
          </div>
          <h1 className="mt-3 text-3xl font-bold leading-tight tracking-tight text-stone-900 sm:text-4xl dark:text-stone-50">
            Open Source{" "}
            <span className="underline decoration-lime-500 underline-offset-4">Analytics</span>
          </h1>
          <p className="mt-2 text-sm text-stone-500 dark:text-stone-400">
            {allOrgs.length > 0
              ? `${orgs.length} of ${allOrgs.length} GSoC organizations${hasActiveFilter ? " (filtered)" : ""}${stats ? ` · ${stats.years.length} years · ${stats.technologies.length} technologies` : ""}`
              : "Your contribution activity and open source stats."}
          </p>
        </div>

        {showHacktoberfestTracker && <HacktoberfestTracker />}

        {/* Contributions by domain */}
        {(trendIsLoading ||
          (contributionTrendData?.domains && contributionTrendData.domains.length > 0) ||
          (contributionTrendData && contributionTrendData.total === 0)) && (
          <motion.div
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.06, duration: 0.4 }}
            className="mb-8 rounded-md border border-stone-200 bg-white p-5 dark:border-white/10 dark:bg-stone-900"
          >
            <div className="mb-4 flex items-center gap-1.5">
              <div className="h-1 w-1 bg-lime-400" />
              <span className="font-mono text-xs uppercase tracking-widest text-stone-500 dark:text-stone-400">
                contributions / by domain
              </span>
            </div>

            {trendIsLoading ? (
              <div className="space-y-4">
                {[1, 2, 3].map((i) => (
                  <div key={i} className="flex animate-pulse items-center gap-3">
                    <div className="h-3 w-24 rounded bg-stone-100 dark:bg-stone-800" />
                    <div className="h-2 flex-1 rounded-sm bg-stone-100 dark:bg-stone-800" />
                    <div className="h-3 w-6 rounded bg-stone-100 dark:bg-stone-800" />
                  </div>
                ))}
              </div>
            ) : contributionTrendData?.domains && contributionTrendData.domains.length > 0 ? (
              <div className="space-y-3.5">
                {(() => {
                  const domains = contributionTrendData.domains;
                  const maxCount = Math.max(...domains.map((d) => d.count), 1);
                  return domains.map(({ domain, count }) => {
                    const pct = Math.round((count / maxCount) * 100);
                    return (
                      <div key={domain} className="group flex items-center gap-3">
                        <span className="w-24 shrink-0 truncate text-xs font-medium text-stone-600 transition-colors group-hover:text-stone-900 dark:text-stone-400 dark:group-hover:text-stone-50">
                          {domain}
                        </span>
                        <div className="relative h-2 flex-1 overflow-hidden rounded-sm bg-stone-100 dark:bg-stone-800">
                          <motion.div
                            initial={{ width: 0 }}
                            animate={{ width: `${pct}%` }}
                            transition={{ duration: 1, ease: "easeOut" }}
                            className="absolute inset-y-0 left-0 rounded-sm bg-lime-400"
                          />
                        </div>
                        <span className="w-6 shrink-0 text-right font-mono text-xs text-stone-500">
                          {count}
                        </span>
                      </div>
                    );
                  });
                })()}
              </div>
            ) : (
              <div className="flex flex-col items-center justify-center py-8 text-center">
                <p className="text-xs italic text-stone-400">
                  No domain data yet, get your first contribution approved to see your breakdown.
                </p>
              </div>
            )}
          </motion.div>
        )}

        {allOrgs.length > 0 && (
          <>
            {/* ── Toolbar ─────────────────────────────────────── */}
            <div className="mb-6">
              <div className="flex flex-wrap items-center gap-2">
                <div className="relative min-w-55 flex-1">
                  <Search
                    className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-stone-400"
                    aria-hidden
                  />
                  <input
                    type="search"
                    value={searchInput}
                    onChange={(e) => setSearchInput(e.target.value)}
                    placeholder="Search organizations..."
                    aria-label="Search organizations by name or description"
                    className="h-10 w-full rounded-md border border-stone-300 bg-white pl-9 pr-3 text-sm text-stone-900 outline-none placeholder:text-stone-400 focus:border-lime-500 dark:border-white/10 dark:bg-stone-900 dark:text-stone-50"
                  />
                </div>

                <EditorialDropdown
                  icon={<Building2 className="h-3.5 w-3.5" />}
                  label="org"
                  value={focusedSlug}
                  options={orgOptions}
                  onChange={setFocusedSlug}
                  searchable
                  searchPlaceholder="Search organizations..."
                />

                <button
                  type="button"
                  onClick={() => setShowFilters(!showFilters)}
                  aria-expanded={showFilters}
                  className={`inline-flex h-10 cursor-pointer items-center gap-1.5 rounded-md border px-3 text-xs font-bold transition-colors ${
                    activeFilterCount > 0
                      ? "border-lime-400 bg-lime-400 text-stone-950 hover:bg-lime-300"
                      : "border-stone-300 bg-white text-stone-700 hover:border-stone-500 dark:border-white/10 dark:bg-stone-900 dark:text-stone-300 dark:hover:border-white/25"
                  }`}
                >
                  <Filter className="h-3 w-3" />
                  Filters
                  {activeFilterCount > 0 && (
                    <span className="inline-flex h-4 min-w-4 items-center justify-center rounded-md bg-stone-950 px-1 font-mono text-xs text-lime-400">
                      {activeFilterCount}
                    </span>
                  )}
                  <ChevronDown
                    className={`h-3 w-3 transition-transform ${showFilters ? "rotate-180" : ""}`}
                  />
                </button>

                {hasActiveFilter && (
                  <button
                    type="button"
                    onClick={clearFilters}
                    className="cursor-pointer border-0 bg-transparent font-mono text-xs uppercase tracking-widest text-stone-500 transition-colors hover:text-stone-900 dark:text-stone-400 dark:hover:text-stone-50"
                  >
                    / clear all
                  </button>
                )}
              </div>

              <AnimatePresence>
                {showFilters && (
                  <motion.div
                    initial={{ height: 0, opacity: 0 }}
                    animate={{ height: "auto", opacity: 1 }}
                    exit={{ height: 0, opacity: 0 }}
                    className="overflow-hidden"
                  >
                    <div className="mt-3 flex flex-wrap gap-2 rounded-md border border-stone-200 bg-white p-4 dark:border-white/10 dark:bg-stone-900">
                      <EditorialDropdown
                        icon={<Calendar className="h-3.5 w-3.5" />}
                        label="year"
                        value={filters.year}
                        options={yearOptions}
                        onChange={setFilter("year")}
                      />
                      <EditorialDropdown
                        icon={<Layers className="h-3.5 w-3.5" />}
                        label="category"
                        value={filters.category}
                        options={categoryOptions}
                        onChange={setFilter("category")}
                        searchable
                      />
                      <EditorialDropdown
                        icon={<Code2 className="h-3.5 w-3.5" />}
                        label="tech"
                        value={filters.technology}
                        options={techOptions}
                        onChange={setFilter("technology")}
                        searchable
                      />
                      <EditorialDropdown
                        icon={<Tag className="h-3.5 w-3.5" />}
                        label="topic"
                        value={filters.topic}
                        options={topicOptions}
                        onChange={setFilter("topic")}
                        searchable
                      />
                      <EditorialDropdown
                        icon={<Hash className="h-3.5 w-3.5" />}
                        label="size"
                        value={filters.minProjects}
                        options={MIN_PROJECT_OPTIONS}
                        onChange={setFilter("minProjects")}
                      />
                      <EditorialDropdown
                        icon={<Clock className="h-3.5 w-3.5" />}
                        label="tenure"
                        value={filters.yearsActive}
                        options={YEARS_ACTIVE_OPTIONS}
                        onChange={setFilter("yearsActive")}
                      />
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>

            {/* ── Results label ───────────────────────────────── */}
            <div className="mb-4">
              <p className="font-mono text-xs uppercase tracking-widest text-stone-500 dark:text-stone-400">
                <span className="text-stone-900 dark:text-stone-50">{orgs.length}</span> organization
                {orgs.length !== 1 ? "s" : ""}
                {hasActiveFilter && " (filtered)"}
              </p>
            </div>

            {/* ── Single organization ─────────────────────────── */}
            {focusedOrg && (
              <OrgSpotlight
                key={focusedOrg.slug}
                org={focusedOrg}
                scope={spotlightScope}
                onClose={() => setFocusedSlug(ALL)}
              />
            )}

            {/* ── No results ──────────────────────────────────── */}
            {orgs.length === 0 && (
              <div className="rounded-md border border-stone-200 bg-white py-16 text-center dark:border-white/10 dark:bg-stone-900">
                <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-md bg-stone-100 dark:bg-white/5">
                  <AlertCircle className="h-5 w-5 text-stone-400 dark:text-stone-500" />
                </div>
                <h3 className="mb-1 text-base font-bold text-stone-900 dark:text-stone-50">
                  No organizations found
                </h3>
                <p className="text-sm text-stone-500 dark:text-stone-400">
                  Try adjusting or clearing your filters.
                </p>
                <button
                  type="button"
                  onClick={clearFilters}
                  className="mt-3 cursor-pointer border-0 bg-transparent font-mono text-xs uppercase tracking-widest text-lime-600 hover:underline dark:text-lime-400"
                >
                  / clear filters
                </button>
              </div>
            )}

            {/* ── Charts grid ─────────────────────────────────── */}
            {orgs.length > 0 && (
              <>
                <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-center gap-1.5">
                    <div className="h-1 w-1 bg-lime-400" />
                    <p className="font-mono text-xs uppercase tracking-widest text-stone-500 dark:text-stone-400">
                      gsoc organization charts
                    </p>
                  </div>
                  <EditorialDropdown
                    icon={<ListOrdered className="h-3.5 w-3.5" />}
                    label="rank"
                    value={topN}
                    options={TOP_N_OPTIONS}
                    onChange={setTopN}
                  />
                </div>

                <div className="mb-6 grid grid-cols-1 gap-px overflow-hidden rounded-md border border-stone-200 bg-stone-200 lg:grid-cols-2 dark:border-white/10 dark:bg-white/10">
                  {/* 1 - Organizations by category */}
                  <ChartCard title="Organizations by Category" subtitle="share of the set" index={0}>
                    {(h) => (
                      <AccessibleChart
                        label="Horizontal bar chart of GSoC organizations grouped by category"
                        caption="Number of GSoC organizations in each category, largest first."
                      >
                        <RankedBars
                          data={categoryRows}
                          dataKey="count"
                          name="Organizations"
                          unit="orgs"
                          height={h}
                          labelWidth={120}
                        />
                      </AccessibleChart>
                    )}
                  </ChartCard>

                  {/* 2 - Year-wise participation */}
                  <ChartCard
                    title="Year-wise Participation"
                    subtitle="organizations per year"
                    index={1}
                  >
                    {(h) => (
                      <AccessibleChart
                        label="Line chart of GSoC organization participation by year"
                        caption="Number of organizations taking part in Google Summer of Code in each program year."
                      >
                        <ResponsiveContainer width="100%" height={h}>
                          <LineChart data={yearRows} margin={{ top: 8, right: 12, left: -18, bottom: 0 }}>
                            <CartesianGrid strokeDasharray="3 3" stroke={GRID} vertical={false} />
                            <XAxis dataKey="year" tick={axisTick} stroke={AXIS} />
                            <YAxis tick={axisTick} stroke={AXIS} />
                            <Tooltip content={<ChartTooltip unit="orgs" />} />
                            <Line
                              type="monotone"
                              dataKey="count"
                              name="Organizations"
                              stroke={MARK}
                              strokeWidth={2}
                              dot={{ r: 3, fill: MARK }}
                              activeDot={{ r: 5 }}
                            />
                          </LineChart>
                        </ResponsiveContainer>
                      </AccessibleChart>
                    )}
                  </ChartCard>

                  {/* 3 - First-time vs returning */}
                  <ChartCard
                    title="First-time vs Returning Orgs"
                    subtitle="who shows up each year"
                    index={2}
                  >
                    {(h) => (
                      <AccessibleChart
                        label="Stacked bar chart of first-time and returning GSoC organizations per year"
                        caption="Each year splits into organizations mentoring for the first time and those that had taken part in an earlier year. The full bar height is that year's total."
                      >
                        <ResponsiveContainer width="100%" height={h}>
                          <BarChart data={cohortRows} margin={{ top: 8, right: 12, left: -18, bottom: 0 }}>
                            <CartesianGrid strokeDasharray="3 3" stroke={GRID} vertical={false} />
                            <XAxis dataKey="year" tick={axisTickSm} stroke={AXIS} />
                            <YAxis tick={axisTickSm} stroke={AXIS} />
                            <Tooltip content={<ChartTooltip unit="orgs" />} cursor={{ fill: GRID }} />
                            <Legend formatter={(value) => <LegendLabel value={value} />} />
                            <Bar
                              dataKey="returning"
                              name="Returning"
                              stackId="a"
                              fill={MARK_MUTED}
                              maxBarSize={30}
                            />
                            <Bar
                              dataKey="joined"
                              name="First time"
                              stackId="a"
                              fill={MARK}
                              radius={[3, 3, 0, 0]}
                              maxBarSize={30}
                            />
                          </BarChart>
                        </ResponsiveContainer>
                      </AccessibleChart>
                    )}
                  </ChartCard>

                  {/* 4 - Projects vs tenure */}
                  <ChartCard title="Projects vs Years Active" subtitle="tenure against output" index={3}>
                    {(h) => (
                      <AccessibleChart
                        label="Scatter plot of GSoC project count against years active per organization"
                        caption="Each dot is one organization: horizontal position is years in the program, vertical position is total projects mentored, and dot size is the number of technologies it lists."
                      >
                        <ResponsiveContainer width="100%" height={h}>
                          <ScatterChart margin={{ top: 8, right: 16, left: -18, bottom: 4 }}>
                            <CartesianGrid strokeDasharray="3 3" stroke={GRID} />
                            <XAxis
                              type="number"
                              dataKey="tenure"
                              name="Years active"
                              tick={axisTickSm}
                              stroke={AXIS}
                            />
                            <YAxis
                              type="number"
                              dataKey="projects"
                              name="Projects"
                              tick={axisTickSm}
                              stroke={AXIS}
                            />
                            <ZAxis type="number" dataKey="stack" range={[24, 220]} name="Technologies" />
                            <Tooltip
                              content={<ChartTooltip titleFrom="name" footerFrom="category" />}
                              cursor={{ strokeDasharray: "3 3", stroke: AXIS }}
                            />
                            <Scatter
                              data={scatterRows}
                              name="Organizations"
                              fill={MARK}
                              fillOpacity={0.5}
                              stroke={MARK}
                            />
                          </ScatterChart>
                        </ResponsiveContainer>
                      </AccessibleChart>
                    )}
                  </ChartCard>

                  {/* 5 - Top technologies */}
                  <ChartCard
                    title="Top Technologies"
                    subtitle="most common across orgs"
                    index={4}
                    height={Math.max(300, techRows.length * 22)}
                  >
                    {(h) => (
                      <AccessibleChart
                        label="Horizontal bar chart of the technologies most used across GSoC organizations"
                        caption="Technologies ranked by how many GSoC organizations list them in their stack."
                      >
                        <RankedBars
                          data={techRows}
                          dataKey="count"
                          name="Organizations"
                          unit="orgs"
                          height={h}
                          labelWidth={90}
                        />
                      </AccessibleChart>
                    )}
                  </ChartCard>

                  {/* 6 - Top topics */}
                  <ChartCard
                    title="Top Topics"
                    subtitle="most common focus areas"
                    index={5}
                    height={Math.max(300, topicRows.length * 22)}
                  >
                    {(h) => (
                      <AccessibleChart
                        label="Horizontal bar chart of the most common topics across GSoC organizations"
                        caption="Project topics and focus areas ranked by how many GSoC organizations claim them."
                      >
                        <RankedBars
                          data={topicRows}
                          dataKey="count"
                          name="Organizations"
                          unit="orgs"
                          height={h}
                          labelWidth={110}
                        />
                      </AccessibleChart>
                    )}
                  </ChartCard>

                  {/* 7 - Largest organizations */}
                  <ChartCard
                    title="Largest Organizations"
                    subtitle="most gsoc projects"
                    index={6}
                    height={Math.max(300, topProjectRows.length * 22)}
                  >
                    {(h) => (
                      <AccessibleChart
                        label="Horizontal bar chart of GSoC organizations with the most projects"
                        caption="Organizations ranked by the total number of Google Summer of Code projects they have mentored."
                      >
                        <RankedBars
                          data={topProjectRows}
                          dataKey="projects"
                          name="Projects"
                          unit="projects"
                          height={h}
                          labelWidth={130}
                          footerFrom="category"
                        />
                      </AccessibleChart>
                    )}
                  </ChartCard>

                  {/* 8 - Throughput */}
                  <ChartCard
                    title="Busiest per Program Year"
                    subtitle="projects per active year"
                    index={7}
                    height={Math.max(300, throughputRows.length * 22)}
                  >
                    {(h) => (
                      <AccessibleChart
                        label="Horizontal bar chart of average projects per active year, by organization"
                        caption="Total projects divided by years in the program, which surfaces high-throughput organizations regardless of how long they have taken part."
                      >
                        <RankedBars
                          data={throughputRows}
                          dataKey="perYear"
                          name="Projects per year"
                          unit="per year"
                          height={h}
                          labelWidth={130}
                          footerFrom="category"
                        />
                      </AccessibleChart>
                    )}
                  </ChartCard>

                  {/* 9 - Average size by category */}
                  <ChartCard
                    title="Average Size by Category"
                    subtitle="projects per organization"
                    index={8}
                  >
                    {(h) => (
                      <AccessibleChart
                        label="Horizontal bar chart of average projects per organization within each category"
                        caption="Mean number of projects per organization in each category, which shows where the larger mentoring orgs cluster."
                      >
                        <RankedBars
                          data={avgCategoryRows}
                          dataKey="average"
                          name="Average projects"
                          unit="avg"
                          height={h}
                          labelWidth={120}
                          footerFrom="category"
                        />
                      </AccessibleChart>
                    )}
                  </ChartCard>

                  {/* 10 - Volume distribution */}
                  <ChartCard
                    title="Project Volume Distribution"
                    subtitle="how big orgs get"
                    index={9}
                  >
                    {(h) => (
                      <AccessibleChart
                        label="Bar chart of organizations grouped into project count bands"
                        caption="Number of organizations falling into each band of total projects mentored, from none through more than one hundred."
                      >
                        <ResponsiveContainer width="100%" height={h}>
                          <BarChart data={volumeRows} margin={{ top: 8, right: 12, left: -18, bottom: 0 }}>
                            <CartesianGrid strokeDasharray="3 3" stroke={GRID} vertical={false} />
                            <XAxis dataKey="bucket" tick={axisTickSm} stroke={AXIS} />
                            <YAxis tick={axisTickSm} stroke={AXIS} />
                            <Tooltip content={<ChartTooltip unit="orgs" />} cursor={{ fill: GRID }} />
                            <Bar
                              dataKey="count"
                              name="Organizations"
                              fill={MARK}
                              radius={[4, 4, 0, 0]}
                              maxBarSize={40}
                            />
                          </BarChart>
                        </ResponsiveContainer>
                      </AccessibleChart>
                    )}
                  </ChartCard>

                  {/* 11 - Longevity */}
                  <ChartCard title="Longevity Distribution" subtitle="years active in gsoc" index={10}>
                    {(h) => (
                      <AccessibleChart
                        label="Bar chart of how many years organizations have taken part in GSoC"
                        caption="Number of organizations grouped by how many program years they have participated in."
                      >
                        <ResponsiveContainer width="100%" height={h}>
                          <BarChart
                            data={longevityRows}
                            margin={{ top: 8, right: 12, left: -18, bottom: 0 }}
                          >
                            <CartesianGrid strokeDasharray="3 3" stroke={GRID} vertical={false} />
                            <XAxis dataKey="yearsActive" tick={axisTickSm} stroke={AXIS} />
                            <YAxis tick={axisTickSm} stroke={AXIS} />
                            <Tooltip content={<ChartTooltip unit="orgs" />} cursor={{ fill: GRID }} />
                            <Bar
                              dataKey="count"
                              name="Organizations"
                              fill={MARK}
                              radius={[4, 4, 0, 0]}
                              maxBarSize={40}
                            />
                          </BarChart>
                        </ResponsiveContainer>
                      </AccessibleChart>
                    )}
                  </ChartCard>

                  {/* 12 - Category x year punchcard */}
                  <ChartCard
                    title="Category Mix Across Years"
                    subtitle="categories against program years"
                    index={11}
                    className="lg:col-span-2"
                  >
                    {() => (
                      <AccessibleChart
                        label="Matrix of category against program year, where dot size is the organization count"
                        caption="Rows are the largest categories and columns are program years. Dot area is the number of organizations from that category taking part in that year, so a growing row means the category is expanding."
                      >
                        <Punchcard
                          rows={matrix.rows}
                          cols={matrix.cols}
                          valueAt={matrix.valueAt}
                          unit="orgs"
                          rowHeader="category"
                        />
                      </AccessibleChart>
                    )}
                  </ChartCard>
                </div>

                {/* ── Comparison radar ──────────────────────────── */}
                <div className="rounded-md border border-stone-200 bg-white p-5 dark:border-white/10 dark:bg-stone-900">
                  <div className="mb-0.5 flex items-center gap-1.5">
                    <div className="h-1 w-1 bg-lime-400" />
                    <p className="font-mono text-xs uppercase tracking-widest text-stone-500 dark:text-stone-400">
                      comparison
                    </p>
                  </div>
                  <h3 className="text-sm font-bold text-stone-900 dark:text-stone-50">
                    Organization Comparison
                  </h3>
                  <p className="mt-1 text-xs text-stone-500 dark:text-stone-400">
                    Overlay up to {MAX_COMPARE} organizations. Search above to narrow the list, or pick
                    an org from the org filter for a single-organization breakdown.
                  </p>

                  <div className="mb-5 mt-4 flex max-h-24 flex-wrap gap-1.5 overflow-y-auto">
                    {orgs.slice(0, COMPARE_CHIP_LIMIT).map((o) => {
                      const active = selectedOrgs.includes(o.id);
                      return (
                        <button
                          key={o.id}
                          type="button"
                          aria-pressed={active}
                          onClick={() => toggleOrg(o.id)}
                          className={`inline-flex cursor-pointer items-center rounded-md border px-2.5 py-1 text-xs font-bold transition-colors ${
                            active
                              ? "border-lime-400 bg-lime-400 text-stone-950"
                              : "border-stone-200 bg-white text-stone-700 hover:border-stone-400 dark:border-white/10 dark:bg-stone-900 dark:text-stone-300 dark:hover:border-white/25"
                          }`}
                        >
                          {o.name}
                        </button>
                      );
                    })}
                    {orgs.length > COMPARE_CHIP_LIMIT && (
                      <span className="py-1 text-xs text-stone-400 dark:text-stone-500">
                        +{orgs.length - COMPARE_CHIP_LIMIT} more, search to narrow the list
                      </span>
                    )}
                  </div>

                  {comparedOrgs.length >= 2 ? (
                    <div className="mx-auto max-w-xl">
                      <AccessibleChart
                        label="Radar chart comparing the selected GSoC organizations"
                        caption="Selected organizations compared on projects, years active, technologies, and topics. Each axis is a percentage of the largest value across the organizations in view."
                      >
                        <ResponsiveContainer width="100%" height={300}>
                          <RadarChart data={radarRows}>
                            <PolarGrid stroke={GRID} />
                            <PolarAngleAxis dataKey="axis" tick={axisTick} />
                            <PolarRadiusAxis angle={90} domain={[0, 100]} tick={axisTickSm} />
                            {comparedOrgs.map((o, i) => {
                              const slot = SERIES[i % SERIES.length];
                              return (
                                <Radar
                                  key={o.id}
                                  name={o.name}
                                  dataKey={o.name}
                                  stroke={slot.stroke}
                                  strokeWidth={2}
                                  strokeDasharray={slot.dash}
                                  fill={slot.stroke}
                                  fillOpacity={0.12}
                                />
                              );
                            })}
                            <Legend formatter={(value) => <LegendLabel value={value} />} />
                            <Tooltip content={<ChartTooltip unit="/ 100" />} />
                          </RadarChart>
                        </ResponsiveContainer>
                      </AccessibleChart>
                    </div>
                  ) : (
                    <div className="flex h-32 items-center justify-center px-4 text-center text-sm text-stone-400 dark:text-stone-500">
                      {comparedOrgs.length === 1
                        ? "Pick one more organization to overlay, or use the org filter for a single-org breakdown."
                        : "Select at least 2 organizations to compare."}
                    </div>
                  )}
                </div>
              </>
            )}
          </>
        )}
      </div>
    </div>
  );
}
