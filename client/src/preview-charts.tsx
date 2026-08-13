/* Throwaway harness used to eyeball the analytics charts. Not part of the app. */
import { createRoot } from "react-dom/client";
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
import "./index.css";
import {
  AccessibleChart,
  ChartCard,
  ChartTooltip,
  LegendLabel,
  Punchcard,
  StatTile,
} from "./module/student/opensource/analytics/chart-kit";
import {
  AXIS,
  axisTick,
  axisTickSm,
  GRID,
  MARK,
  MARK_MUTED,
  SERIES,
} from "./module/student/opensource/analytics/chart-tokens";

const CATS = [
  "End user applications",
  "Development tools",
  "Science and medicine",
  "Web",
  "Data",
  "Infrastructure and cloud",
  "Programming languages",
  "Media",
  "Security",
  "Operating systems",
];
const YEARS = ["2016", "2017", "2018", "2019", "2020", "2021", "2022", "2023", "2024", "2025", "2026"];

const categoryRows = CATS.map((name, i) => ({ name, count: 90 - i * 8 }));
const yearRows = YEARS.map((year, i) => ({ year, count: 130 + i * 9 - (i % 3) * 14 }));
const cohortRows = YEARS.map((year, i) => ({
  year,
  joined: Math.max(4, 40 - i * 3),
  returning: i * 14,
}));
const scatterRows = Array.from({ length: 160 }, (_, i) => ({
  name: `Org ${i + 1}`,
  category: CATS[i % CATS.length],
  tenure: (i % 11) + 1,
  projects: Math.round(((i % 11) + 1) * (3 + (i % 7)) * 1.4),
  stack: (i % 6) + 1,
}));
const volumeRows = [
  { bucket: "0", count: 41 },
  { bucket: "1-5", count: 168 },
  { bucket: "6-10", count: 112 },
  { bucket: "11-25", count: 96 },
  { bucket: "26-50", count: 61 },
  { bucket: "51-100", count: 30 },
  { bucket: "100+", count: 12 },
];
const radarRows = ["Projects", "Years active", "Technologies", "Topics"].map((axis, i) => ({
  axis,
  "NumFOCUS": 100 - i * 12,
  "Python Software Foundation": 74 - i * 6,
  "Django": 40 + i * 9,
  "Zulip": 55 - i * 4,
}));
const COMPARED = ["NumFOCUS", "Python Software Foundation", "Django", "Zulip"];

// Deterministic pseudo-values so the punchcard shows a real size spread.
const cell = (r: number, c: number) => {
  const v = Math.round((Math.sin(r * 2.1 + c * 0.7) + 1) * 21) + (c > 4 ? 6 : 0) - (r > 6 ? 8 : 0);
  return Math.max(0, v);
};
const matrixValue = (row: string, col: string) => cell(CATS.indexOf(row), YEARS.indexOf(col));

// eslint-disable-next-line react-refresh/only-export-components
function RankedBars({
  data,
  dataKey,
  unit,
  height,
  labelWidth,
}: {
  data: object[];
  dataKey: string;
  unit: string;
  height: number;
  labelWidth: number;
}) {
  return (
    <ResponsiveContainer width="100%" height={height}>
      <BarChart data={data} layout="vertical" margin={{ top: 4, right: 12, left: 0, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke={GRID} horizontal={false} />
        <XAxis type="number" tick={axisTickSm} stroke={AXIS} allowDecimals={false} />
        <YAxis dataKey="name" type="category" tick={axisTickSm} stroke={AXIS} width={labelWidth} />
        <Tooltip content={<ChartTooltip unit={unit} />} cursor={{ fill: GRID }} />
        <Bar dataKey={dataKey} name="Organizations" fill={MARK} radius={[0, 4, 4, 0]} maxBarSize={18} />
      </BarChart>
    </ResponsiveContainer>
  );
}

// eslint-disable-next-line react-refresh/only-export-components
function Board() {
  return (
    <div className="mx-auto max-w-6xl px-6 py-8">
      <h1 className="mb-6 text-2xl font-bold text-stone-900 dark:text-stone-50">Chart preview</h1>

      <div className="mb-6 grid grid-cols-2 gap-px bg-stone-200 sm:grid-cols-5 dark:bg-white/10">
        <StatTile label="projects" value={276} hint="#1 of 520" />
        <StatTile label="years active" value={11} />
        <StatTile label="first year" value={2016} />
        <StatTile label="latest year" value={2026} />
        <StatTile label="avg per year" value={25.1} hint="projects" />
      </div>

      <div className="mb-6 grid grid-cols-1 gap-px overflow-hidden rounded-md border border-stone-200 bg-stone-200 lg:grid-cols-2 dark:border-white/10 dark:bg-white/10">
        <ChartCard title="Organizations by Category" subtitle="share of the set" index={0}>
          {(h) => (
            <AccessibleChart label="a" caption="a">
              <RankedBars data={categoryRows} dataKey="count" unit="orgs" height={h as number} labelWidth={120} />
            </AccessibleChart>
          )}
        </ChartCard>

        <ChartCard title="Year-wise Participation" subtitle="organizations per year" index={1}>
          {(h) => (
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
                />
              </LineChart>
            </ResponsiveContainer>
          )}
        </ChartCard>

        <ChartCard title="First-time vs Returning Orgs" subtitle="who shows up each year" index={2}>
          {(h) => (
            <ResponsiveContainer width="100%" height={h}>
              <BarChart data={cohortRows} margin={{ top: 8, right: 12, left: -18, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke={GRID} vertical={false} />
                <XAxis dataKey="year" tick={axisTickSm} stroke={AXIS} />
                <YAxis tick={axisTickSm} stroke={AXIS} />
                <Tooltip content={<ChartTooltip unit="orgs" />} cursor={{ fill: GRID }} />
                <Legend formatter={(value) => <LegendLabel value={value} />} />
                <Bar dataKey="returning" name="Returning" stackId="a" fill={MARK_MUTED} maxBarSize={30} />
                <Bar dataKey="joined" name="First time" stackId="a" fill={MARK} radius={[3, 3, 0, 0]} maxBarSize={30} />
              </BarChart>
            </ResponsiveContainer>
          )}
        </ChartCard>

        <ChartCard title="Projects vs Years Active" subtitle="tenure against output" index={3}>
          {(h) => (
            <ResponsiveContainer width="100%" height={h}>
              <ScatterChart margin={{ top: 8, right: 16, left: -18, bottom: 4 }}>
                <CartesianGrid strokeDasharray="3 3" stroke={GRID} />
                <XAxis type="number" dataKey="tenure" name="Years active" tick={axisTickSm} stroke={AXIS} />
                <YAxis type="number" dataKey="projects" name="Projects" tick={axisTickSm} stroke={AXIS} />
                <ZAxis type="number" dataKey="stack" range={[24, 220]} name="Technologies" />
                <Tooltip content={<ChartTooltip titleFrom="name" footerFrom="category" />} />
                <Scatter data={scatterRows} name="Organizations" fill={MARK} fillOpacity={0.5} stroke={MARK} />
              </ScatterChart>
            </ResponsiveContainer>
          )}
        </ChartCard>

        <ChartCard title="Project Volume Distribution" subtitle="how big orgs get" index={4}>
          {(h) => (
            <ResponsiveContainer width="100%" height={h}>
              <BarChart data={volumeRows} margin={{ top: 8, right: 12, left: -18, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke={GRID} vertical={false} />
                <XAxis dataKey="bucket" tick={axisTickSm} stroke={AXIS} />
                <YAxis tick={axisTickSm} stroke={AXIS} />
                <Tooltip content={<ChartTooltip unit="orgs" />} cursor={{ fill: GRID }} />
                <Bar dataKey="count" name="Organizations" fill={MARK} radius={[4, 4, 0, 0]} maxBarSize={40} />
              </BarChart>
            </ResponsiveContainer>
          )}
        </ChartCard>

        <ChartCard title="Organization Comparison" subtitle="four overlays" index={5}>
          {(h) => (
            <ResponsiveContainer width="100%" height={h}>
              <RadarChart data={radarRows}>
                <PolarGrid stroke={GRID} />
                <PolarAngleAxis dataKey="axis" tick={axisTick} />
                <PolarRadiusAxis angle={90} domain={[0, 100]} tick={axisTickSm} />
                {COMPARED.map((name, i) => {
                  const slot = SERIES[i % SERIES.length];
                  return (
                    <Radar
                      key={name}
                      name={name}
                      dataKey={name}
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
          )}
        </ChartCard>

        <ChartCard
          title="Category Mix Across Years"
          subtitle="categories against program years"
          index={6}
          className="lg:col-span-2"
        >
          {() => (
            <AccessibleChart label="a" caption="a">
              <Punchcard rows={CATS} cols={YEARS} valueAt={matrixValue} unit="orgs" rowHeader="category" />
            </AccessibleChart>
          )}
        </ChartCard>
      </div>
    </div>
  );
}

createRoot(document.getElementById("root")!).render(
  <div className="min-h-screen bg-stone-50 dark:bg-stone-950">
    <Board />
  </div>,
);
