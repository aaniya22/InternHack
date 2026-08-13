import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { motion } from "framer-motion";
import { ExternalLink, Lightbulb, Mail, BookOpen, X } from "lucide-react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  PolarAngleAxis,
  PolarGrid,
  PolarRadiusAxis,
  Radar,
  RadarChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import api from "../../../../lib/axios";
import { queryKeys } from "../../../../lib/query-keys";
import type { GSoCOrganization } from "../../../../lib/types";
import { AccessibleChart, ChartTooltip, LegendLabel, StatTile } from "./chart-kit";
import { AXIS, axisTickSm, GRID, MARK, MARK_MUTED } from "./chart-tokens";
import { latestCohort, profileVsMedian, projectsByYear, rankByProjects } from "./analytics.selectors";

function OrgMark({ org }: { org: GSoCOrganization }) {
  if (org.imageUrl) {
    return (
      <img
        src={org.imageUrl}
        alt=""
        className="h-11 w-11 shrink-0 rounded-md border border-stone-200 bg-stone-50 object-contain p-1 dark:border-white/10 dark:bg-stone-800"
      />
    );
  }
  return (
    <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-md border border-stone-200 bg-stone-100 text-base font-bold text-stone-900 dark:border-white/10 dark:bg-stone-800 dark:text-stone-50">
      {org.name.charAt(0).toUpperCase()}
    </div>
  );
}

function OrgLink({ href, icon, children }: { href: string; icon: React.ReactNode; children: React.ReactNode }) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className="inline-flex items-center gap-1.5 rounded-md border border-stone-200 px-2.5 py-1 font-mono text-[10px] uppercase tracking-widest text-stone-600 no-underline transition-colors hover:border-stone-400 hover:text-stone-900 dark:border-white/10 dark:text-stone-400 dark:hover:border-white/30 dark:hover:text-stone-50"
    >
      <span className="text-stone-400">{icon}</span>
      {children}
    </a>
  );
}

function TokenList({ label, values }: { label: string; values: string[] }) {
  if (values.length === 0) return null;
  return (
    <div>
      <p className="mb-2 font-mono text-[10px] uppercase tracking-widest text-stone-500 dark:text-stone-400">
        {label} / {values.length}
      </p>
      <div className="flex flex-wrap gap-1.5">
        {values.map((v) => (
          <span
            key={v}
            className="rounded-md border border-stone-200 px-2 py-0.5 text-[11px] text-stone-600 dark:border-white/10 dark:text-stone-400"
          >
            {v}
          </span>
        ))}
      </div>
    </div>
  );
}

/**
 * Deep dive on one organization. The list endpoint omits `projectsData`, so the
 * per-year breakdown comes from the detail endpoint, fetched only once an
 * organization is actually picked.
 */
export function OrgSpotlight({
  org,
  scope,
  onClose,
}: {
  /** The organization as it came from the list endpoint. */
  org: GSoCOrganization;
  /** The currently filtered set, used for ranking and the median baseline. */
  scope: GSoCOrganization[];
  onClose: () => void;
}) {
  const { data: detail, isLoading } = useQuery<{ organization: GSoCOrganization }>({
    queryKey: queryKeys.gsoc.detail(org.slug),
    queryFn: () => api.get(`/gsoc/organizations/${org.slug}`).then((r) => r.data),
    staleTime: 60 * 60 * 1000,
  });

  const full = detail?.organization ?? org;
  const yearRows = useMemo(() => projectsByYear(full), [full]);
  const cohort = useMemo(() => latestCohort(full), [full]);
  const radarRows = useMemo(() => profileVsMedian(scope, org), [scope, org]);

  const tenure = org.yearsParticipated.length;
  const firstYear = tenure > 0 ? Math.min(...org.yearsParticipated) : null;
  const latestYear = tenure > 0 ? Math.max(...org.yearsParticipated) : null;
  const perYear = tenure > 0 ? Math.round((org.totalProjects / tenure) * 10) / 10 : 0;
  const rank = rankByProjects(scope, org);

  return (
    <motion.section
      aria-label={`${org.name} breakdown`}
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35 }}
      className="mb-6 rounded-md border border-stone-200 bg-white p-5 dark:border-white/10 dark:bg-stone-900"
    >
      <div className="flex items-start justify-between gap-4">
        <div className="flex min-w-0 gap-3">
          <OrgMark org={org} />
          <div className="min-w-0">
            <div className="mb-0.5 flex items-center gap-1.5">
              <div className="h-1 w-1 bg-lime-400" />
              <p className="font-mono text-xs uppercase tracking-widest text-stone-500 dark:text-stone-400">
                single organization / {org.category.toLowerCase()}
              </p>
            </div>
            <h3 className="text-lg font-bold tracking-tight text-stone-900 dark:text-stone-50">{org.name}</h3>
            <p className="mt-1 max-w-2xl text-sm leading-relaxed text-stone-600 dark:text-stone-400">
              {org.description}
            </p>
          </div>
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label="Clear the selected organization"
          className="flex h-8 w-8 shrink-0 cursor-pointer items-center justify-center rounded-md text-stone-500 transition-colors hover:bg-stone-100 dark:text-stone-400 dark:hover:bg-white/5"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      <div className="mt-4 flex flex-wrap gap-1.5">
        {org.url && (
          <OrgLink href={org.url} icon={<ExternalLink className="h-3 w-3" />}>
            website
          </OrgLink>
        )}
        {org.ideasUrl && (
          <OrgLink href={org.ideasUrl} icon={<Lightbulb className="h-3 w-3" />}>
            ideas list
          </OrgLink>
        )}
        {org.guideUrl && (
          <OrgLink href={org.guideUrl} icon={<BookOpen className="h-3 w-3" />}>
            contributor guide
          </OrgLink>
        )}
        {org.contactEmail && (
          <OrgLink href={org.contactEmail} icon={<Mail className="h-3 w-3" />}>
            contact
          </OrgLink>
        )}
      </div>

      <div className="mt-5 grid grid-cols-2 gap-px bg-stone-200 sm:grid-cols-5 dark:bg-white/10">
        <StatTile label="projects" value={org.totalProjects} hint={`#${rank} of ${scope.length}`} />
        <StatTile label="years active" value={tenure} />
        <StatTile label="first year" value={firstYear ?? "n/a"} />
        <StatTile label="latest year" value={latestYear ?? "n/a"} />
        <StatTile label="avg per year" value={perYear} hint="projects" />
      </div>

      <div className="mt-5 grid grid-cols-1 gap-6 lg:grid-cols-2">
        <div>
          <p className="mb-3 font-mono text-[10px] uppercase tracking-widest text-stone-500 dark:text-stone-400">
            projects per year
          </p>
          {isLoading ? (
            <div className="h-55 animate-pulse rounded-md bg-stone-100 dark:bg-stone-800" />
          ) : yearRows.length > 0 ? (
            <AccessibleChart
              label={`Bar chart of projects ${org.name} ran each GSoC year`}
              caption={`Number of Google Summer of Code projects ${org.name} mentored in each year it took part.`}
            >
              <ResponsiveContainer width="100%" height={220}>
                <BarChart data={yearRows} margin={{ top: 4, right: 4, left: -18, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke={GRID} vertical={false} />
                  <XAxis dataKey="year" tick={axisTickSm} stroke={AXIS} />
                  <YAxis tick={axisTickSm} stroke={AXIS} allowDecimals={false} />
                  <Tooltip content={<ChartTooltip unit="projects" />} cursor={{ fill: GRID }} />
                  <Bar dataKey="projects" name="Projects" fill={MARK} radius={[4, 4, 0, 0]} maxBarSize={34} />
                </BarChart>
              </ResponsiveContainer>
            </AccessibleChart>
          ) : (
            <p className="py-10 text-center text-xs italic text-stone-400">
              No per-year project archive for this organization yet.
            </p>
          )}
        </div>

        <div>
          <p className="mb-3 font-mono text-[10px] uppercase tracking-widest text-stone-500 dark:text-stone-400">
            profile vs median org
          </p>
          <AccessibleChart
            label={`Radar chart comparing ${org.name} with the median organization`}
            caption={`${org.name} against the median of the organizations currently in view, on projects, years active, technologies, and topics. Each axis is a percentage of the largest value in view.`}
          >
            <ResponsiveContainer width="100%" height={220}>
              <RadarChart data={radarRows} margin={{ top: 8, right: 8, bottom: 8, left: 8 }}>
                <PolarGrid stroke={GRID} />
                <PolarAngleAxis dataKey="axis" tick={axisTickSm} />
                <PolarRadiusAxis angle={90} domain={[0, 100]} tick={{ fill: AXIS, fontSize: 9 }} />
                <Radar name={org.name} dataKey="org" stroke={MARK} fill={MARK} fillOpacity={0.18} />
                <Radar
                  name="Median org"
                  dataKey="median"
                  stroke={MARK_MUTED}
                  strokeDasharray="6 3"
                  fill={MARK_MUTED}
                  fillOpacity={0.08}
                />
                <Legend formatter={(value) => <LegendLabel value={value} />} />
                <Tooltip content={<ChartTooltip unit="/ 100" />} />
              </RadarChart>
            </ResponsiveContainer>
          </AccessibleChart>
        </div>
      </div>

      <div className="mt-6 grid grid-cols-1 gap-5 sm:grid-cols-2">
        <TokenList label="technologies" values={org.technologies} />
        <TokenList label="topics" values={org.topics} />
      </div>

      {cohort && (
        <div className="mt-6 border-t border-stone-200 pt-5 dark:border-white/10">
          <p className="mb-3 font-mono text-[10px] uppercase tracking-widest text-stone-500 dark:text-stone-400">
            {cohort.year} projects / sample of {cohort.projects.length}
          </p>
          <ul className="space-y-2 pl-0">
            {cohort.projects.slice(0, 5).map((p) => {
              const href = p.project_url || p.code_url;
              return (
                <li key={p.title} className="list-none text-sm">
                  {href ? (
                    <a
                      href={href}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="font-medium text-stone-900 no-underline hover:text-lime-600 dark:text-stone-50 dark:hover:text-lime-400"
                    >
                      {p.title}
                    </a>
                  ) : (
                    <span className="font-medium text-stone-900 dark:text-stone-50">{p.title}</span>
                  )}
                  {p.student_name && (
                    <span className="ml-2 font-mono text-[10px] uppercase tracking-widest text-stone-400">
                      {p.student_name}
                    </span>
                  )}
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </motion.section>
  );
}
