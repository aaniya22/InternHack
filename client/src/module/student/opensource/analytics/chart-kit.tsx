import { useState, type ReactNode } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Maximize2, X } from "lucide-react";
import { dotDiameter, DOT_MAX_PX, MARK, type ChartHeight } from "./chart-tokens";

type TooltipEntry = {
  value?: number | string;
  name?: string;
  color?: string;
  payload?: Record<string, unknown>;
};

/** Tooltip shared by every recharts chart on the analytics page. */
export function ChartTooltip({
  active,
  payload,
  label,
  unit,
  titleFrom,
  footerFrom,
}: {
  active?: boolean;
  payload?: TooltipEntry[];
  label?: string | number;
  /** Appended after each value, e.g. "orgs". */
  unit?: string;
  /** Datum key to use as the title instead of the axis label (scatter marks). */
  titleFrom?: string;
  /** Datum key rendered as a muted line under the values. */
  footerFrom?: string;
}) {
  if (!active || !payload?.length) return null;

  const datum = payload[0]?.payload;
  const rawTitle = titleFrom && datum ? datum[titleFrom] : label;
  const title =
    typeof rawTitle === "string" || typeof rawTitle === "number" ? String(rawTitle) : null;
  const footer = footerFrom && datum ? datum[footerFrom] : null;

  return (
    <div className="rounded-md border border-stone-200 bg-white px-3 py-2 text-xs shadow-xl dark:border-white/10 dark:bg-stone-900">
      {title && <p className="mb-1 font-bold text-stone-900 dark:text-stone-50">{title}</p>}
      {payload.map((entry, i) => (
        <p key={i} className="flex items-center gap-1.5 text-stone-600 dark:text-stone-400">
          {entry.color && (
            <span aria-hidden className="h-2 w-2 shrink-0" style={{ background: entry.color }} />
          )}
          {entry.name && <span>{entry.name}:</span>}
          <span className="font-bold tabular-nums text-stone-900 dark:text-stone-50">
            {typeof entry.value === "number" ? entry.value.toLocaleString() : entry.value}
            {unit ? ` ${unit}` : ""}
          </span>
        </p>
      ))}
      {typeof footer === "string" && (
        <p className="mt-1 font-mono text-[10px] uppercase tracking-widest text-stone-400">{footer}</p>
      )}
    </div>
  );
}

/**
 * Legend text, kept on the page's ink tokens rather than the series colour: the
 * swatch beside it already carries identity.
 */
export function LegendLabel({ value }: { value: unknown }) {
  return <span className="text-xs text-stone-600 dark:text-stone-400">{String(value)}</span>;
}

export function ChartModal({
  open,
  onClose,
  title,
  subtitle,
  children,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  subtitle: string;
  children: ReactNode;
}) {
  return (
    <AnimatePresence>
      {open && (
        <>
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="fixed inset-0 z-50 bg-stone-950/60 backdrop-blur-sm"
            onClick={onClose}
          />
          <motion.div
            initial={{ opacity: 0, scale: 0.9, y: 40 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.9, y: 40 }}
            transition={{ type: "spring", damping: 25, stiffness: 300 }}
            className="fixed inset-3 z-50 flex flex-col overflow-hidden rounded-md border border-stone-200 bg-white shadow-2xl sm:inset-6 md:inset-12 lg:inset-20 dark:border-white/10 dark:bg-stone-900"
          >
            <div className="flex shrink-0 items-center justify-between border-b border-stone-200 px-5 py-4 dark:border-white/10">
              <div>
                <div className="mb-0.5 flex items-center gap-1.5">
                  <div className="h-1 w-1 bg-lime-400" />
                  <p className="font-mono text-xs uppercase tracking-widest text-stone-500 dark:text-stone-400">
                    {subtitle}
                  </p>
                </div>
                <h3 className="text-base font-bold text-stone-900 dark:text-stone-50">{title}</h3>
              </div>
              <button
                type="button"
                onClick={onClose}
                aria-label="Close chart"
                className="flex h-8 w-8 cursor-pointer items-center justify-center rounded-md text-stone-500 hover:bg-stone-100 dark:text-stone-400 dark:hover:bg-white/5"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="min-h-0 flex-1 overflow-auto p-5">{children}</div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}

/** Wraps a chart so screen readers get a description of what it shows. */
export function AccessibleChart({
  label,
  caption,
  children,
}: {
  label: string;
  caption: string;
  children: ReactNode;
}) {
  return (
    <figure role="img" aria-label={label} tabIndex={0} className="h-full w-full">
      {children}
      <figcaption className="sr-only">{caption}</figcaption>
    </figure>
  );
}

/**
 * A chart tile that can be blown up to full screen. `children` is a function of
 * the height to draw at, so each chart is declared once and the expanded copy
 * fills the modal instead of being a duplicated 300px block.
 */
export function ChartCard({
  title,
  subtitle,
  index,
  height = 300,
  children,
  className = "",
}: {
  title: string;
  subtitle: string;
  index: number;
  /** Inline height in pixels; the expanded copy always fills the modal. */
  height?: number;
  children: (height: ChartHeight) => ReactNode;
  className?: string;
}) {
  const [expanded, setExpanded] = useState(false);
  return (
    <>
      <motion.div
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: Math.min(index, 6) * 0.06, duration: 0.4 }}
        className={`group bg-white p-5 dark:bg-stone-900 ${className}`}
      >
        <div className="mb-1 flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="mb-0.5 flex items-center gap-1.5">
              <div className="h-1 w-1 shrink-0 bg-lime-400" />
              <p className="font-mono text-xs uppercase tracking-widest text-stone-500 dark:text-stone-400">
                {subtitle}
              </p>
            </div>
            <h3 className="text-sm font-bold text-stone-900 dark:text-stone-50">{title}</h3>
          </div>
          <button
            type="button"
            onClick={() => setExpanded(true)}
            className="flex h-7 w-7 shrink-0 cursor-pointer items-center justify-center rounded-md text-stone-400 transition-colors hover:bg-stone-100 hover:text-stone-700 dark:text-stone-500 dark:hover:bg-white/5 dark:hover:text-lime-400"
            aria-label={`Expand ${title}`}
            title={`Expand ${title}`}
          >
            <Maximize2 className="h-3.5 w-3.5" />
          </button>
        </div>
        <div className="mt-4">{children(height)}</div>
      </motion.div>
      <ChartModal
        open={expanded}
        onClose={() => setExpanded(false)}
        title={title}
        subtitle={subtitle}
      >
        {children("100%")}
      </ChartModal>
    </>
  );
}

/** A compact figure for a single number, for facts not worth a plot. */
export function StatTile({
  label,
  value,
  hint,
}: {
  label: string;
  value: string | number;
  hint?: string;
}) {
  return (
    <div className="bg-white p-3 dark:bg-stone-900">
      <p className="font-mono text-[10px] uppercase tracking-widest text-stone-500 dark:text-stone-400">
        {label}
      </p>
      <p className="mt-1 text-xl font-bold tabular-nums text-stone-900 dark:text-stone-50">{value}</p>
      {hint && <p className="mt-0.5 font-mono text-[10px] text-stone-400">{hint}</p>}
    </div>
  );
}

/**
 * A row/column matrix where dot area encodes magnitude. Size does the work a
 * colour ramp would, which keeps the whole grid on one validated hue.
 */
export function Punchcard({
  rows,
  cols,
  valueAt,
  unit,
  rowHeader,
}: {
  rows: string[];
  cols: string[];
  valueAt: (row: string, col: string) => number;
  unit: string;
  rowHeader: string;
}) {
  const max = Math.max(1, ...rows.flatMap((r) => cols.map((c) => valueAt(r, c))));

  return (
    <div className="overflow-x-auto">
      <div className="min-w-140">
        <div
          className="grid gap-y-1"
          style={{
            gridTemplateColumns: `minmax(7rem, 11rem) repeat(${cols.length}, minmax(0, 1fr))`,
          }}
        >
          <div className="font-mono text-[10px] uppercase tracking-widest text-stone-400">
            {rowHeader}
          </div>
          {cols.map((c) => (
            <div key={c} className="text-center font-mono text-[10px] text-stone-400">
              {c.length > 4 ? c.slice(2) : c}
            </div>
          ))}

          {rows.map((r) => (
            <div key={r} className="contents">
              <div className="truncate pr-2 text-xs text-stone-600 dark:text-stone-400" title={r}>
                {r}
              </div>
              {cols.map((c) => {
                const v = valueAt(r, c);
                const px = dotDiameter(v, max);
                return (
                  <div
                    key={c}
                    className="flex h-5 items-center justify-center"
                    title={`${r} · ${c}: ${v} ${unit}`}
                  >
                    {px === 0 ? (
                      <span aria-hidden className="h-px w-1 bg-stone-300 dark:bg-stone-700" />
                    ) : (
                      <span
                        aria-hidden
                        data-dot={v}
                        className="rounded-full"
                        style={{ width: `${px}px`, height: `${px}px`, background: MARK }}
                      />
                    )}
                  </div>
                );
              })}
            </div>
          ))}
        </div>
      </div>

      <div className="mt-4 flex items-center gap-2 font-mono text-[10px] uppercase tracking-widest text-stone-400">
        <span>fewer</span>
        {[0.15, 0.4, 0.7, 1].map((f) => {
          const px = Math.round(Math.sqrt(f) * DOT_MAX_PX);
          return (
            <span
              key={f}
              aria-hidden
              className="shrink-0 rounded-full"
              style={{ width: `${px}px`, height: `${px}px`, background: MARK }}
            />
          );
        })}
        <span>more {unit}</span>
      </div>
    </div>
  );
}
