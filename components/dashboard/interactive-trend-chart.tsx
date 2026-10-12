"use client";

import { useId, useState, type PointerEvent } from "react";

export type TrendPoint = {
  date: string;
  value: number;
};

type TrendSeries = "income" | "attendance";
type PlotPoint = TrendPoint & { x: number; y: number };

const VIEW_WIDTH = 1000;
const VIEW_HEIGHT = 320;
const PLOT_LEFT = 76;
const PLOT_RIGHT = 24;
const PLOT_TOP = 24;
const PLOT_BOTTOM = 44;

function makeSmoothPath(points: PlotPoint[]) {
  if (!points.length) return "";
  if (points.length === 1) return `M ${points[0].x} ${points[0].y}`;
  let path = `M ${points[0].x} ${points[0].y}`;
  for (let index = 0; index < points.length - 1; index += 1) {
    const previous = points[Math.max(0, index - 1)];
    const current = points[index];
    const next = points[index + 1];
    const afterNext = points[Math.min(points.length - 1, index + 2)];
    const controlOneX = current.x + (next.x - previous.x) / 6;
    const controlOneY = current.y + (next.y - previous.y) / 6;
    const controlTwoX = next.x - (afterNext.x - current.x) / 6;
    const controlTwoY = next.y - (afterNext.y - current.y) / 6;
    path += ` C ${controlOneX} ${controlOneY}, ${controlTwoX} ${controlTwoY}, ${next.x} ${next.y}`;
  }
  return path;
}

function displayDate(value: string) {
  const parsed = new Date(`${value}T12:00:00.000Z`);
  return new Intl.DateTimeFormat("en-IN", {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  }).format(parsed);
}

function compactMoney(value: number, currency: string) {
  try {
    return new Intl.NumberFormat("en-IN", {
      style: "currency",
      currency,
      notation: "compact",
      maximumFractionDigits: 1,
    }).format(value);
  } catch {
    return new Intl.NumberFormat("en-IN", {
      style: "currency",
      currency: "INR",
      notation: "compact",
      maximumFractionDigits: 1,
    }).format(value);
  }
}

function fullMoney(value: number, currency: string) {
  try {
    return new Intl.NumberFormat("en-IN", { style: "currency", currency }).format(value);
  } catch {
    return new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR" }).format(value);
  }
}

export function InteractiveTrendChart({
  income,
  attendance,
  currency,
}: {
  income: TrendPoint[];
  attendance: TrendPoint[];
  currency: string;
}) {
  const [series, setSeries] = useState<TrendSeries>("income");
  const [range, setRange] = useState<7 | 14 | 30>(14);
  const [requestedIndex, setRequestedIndex] = useState(-1);
  const rawPoints = series === "income" ? income : attendance;
  const visiblePoints = rawPoints.slice(-range);
  const lastIndex = Math.max(0, visiblePoints.length - 1);
  const activeIndex = requestedIndex < 0 ? lastIndex : Math.min(requestedIndex, lastIndex);
  const selected = visiblePoints[activeIndex];
  const maxValue = Math.max(1, ...visiblePoints.map((point) => Number.isFinite(point.value) ? Math.max(0, point.value) : 0)) * 1.12;
  const plotHeight = VIEW_HEIGHT - PLOT_TOP - PLOT_BOTTOM;
  const plotWidth = VIEW_WIDTH - PLOT_LEFT - PLOT_RIGHT;
  const plotted: PlotPoint[] = visiblePoints.map((point, index) => ({
    ...point,
    x: visiblePoints.length < 2
      ? PLOT_LEFT + plotWidth / 2
      : PLOT_LEFT + (index / (visiblePoints.length - 1)) * plotWidth,
    y: PLOT_TOP + plotHeight * (1 - Math.max(0, Number(point.value) || 0) / maxValue),
  }));
  const linePath = makeSmoothPath(plotted);
  const first = plotted[0];
  const last = plotted[plotted.length - 1];
  const areaPath = first && last
    ? `${linePath} L ${last.x} ${VIEW_HEIGHT - PLOT_BOTTOM} L ${first.x} ${VIEW_HEIGHT - PLOT_BOTTOM} Z`
    : "";
  const active = plotted[activeIndex];
  const gradientId = `vyroTrend${useId().replace(/:/g, "")}`;
  const isIncome = series === "income";
  const title = isIncome ? "Daily income" : "Attendance check-ins";
  const hasValues = visiblePoints.some((point) => Number(point.value) > 0);
  const valueLabel = selected
    ? isIncome ? fullMoney(selected.value, currency) : new Intl.NumberFormat("en-IN").format(selected.value)
    : isIncome ? fullMoney(0, currency) : "0";
  const previous = visiblePoints[Math.max(0, activeIndex - 1)];
  const difference = selected && previous && activeIndex > 0 ? selected.value - previous.value : null;

  function moveSelection(step: number) {
    setRequestedIndex((current) => {
      const index = current < 0 ? lastIndex : current;
      return Math.max(0, Math.min(lastIndex, index + step));
    });
  }

  function updateFromPointer(event: PointerEvent<SVGSVGElement>) {
    const rect = event.currentTarget.getBoundingClientRect();
    if (!rect.width || plotted.length < 2) return;
    const virtualX = ((event.clientX - rect.left) / rect.width) * VIEW_WIDTH;
    let closestIndex = 0;
    let closestDistance = Number.POSITIVE_INFINITY;
    for (let index = 0; index < plotted.length; index += 1) {
      const distance = Math.abs(plotted[index].x - virtualX);
      if (distance < closestDistance) {
        closestDistance = distance;
        closestIndex = index;
      }
    }
    setRequestedIndex(closestIndex);
  }

  return (
    <section className="interactive-trend-chart" aria-label="Gym performance trends">
      <div className="trend-chart-toolbar">
        <div className="trend-chart-series" role="group" aria-label="Chart metric">
          <button type="button" className="trend-chart-control" aria-pressed={isIncome} onClick={() => { setSeries("income"); setRequestedIndex(-1); }}>
            Income
          </button>
          <button type="button" className="trend-chart-control" aria-pressed={!isIncome} onClick={() => { setSeries("attendance"); setRequestedIndex(-1); }}>
            Attendance
          </button>
        </div>
        <div className="trend-chart-range" role="group" aria-label="Chart date range">
          {([7, 14, 30] as const).map((days) => (
            <button
              key={days}
              type="button"
              className="trend-chart-control trend-chart-range-control"
              aria-label={`${days} days`}
              aria-pressed={range === days}
              onClick={() => { setRange(days); setRequestedIndex(-1); }}
            >
              {days}D
            </button>
          ))}
        </div>
      </div>

      <div className="trend-chart-readout">
        <div className="min-w-0">
          <p className="trend-chart-eyebrow">{title}</p>
          <p className="trend-chart-value">{valueLabel}</p>
          <p className="trend-chart-date">{selected ? displayDate(selected.date) : "No date available"}</p>
        </div>
        <div className="trend-chart-readout-meta">
          <span className={`trend-chart-legend-dot ${isIncome ? "trend-dot-income" : "trend-dot-attendance"}`} aria-hidden="true" />
          <span>{isIncome ? "Collected revenue" : "Check-ins"}</span>
          {difference !== null ? (
            <span className="trend-chart-delta">
              {difference > 0 ? "+" : ""}{isIncome ? fullMoney(difference, currency) : new Intl.NumberFormat("en-IN").format(difference)} <span>vs previous day</span>
            </span>
          ) : null}
        </div>
      </div>

      <div className="trend-chart-plot-wrap">
        {visiblePoints.length ? (
          <svg
            className="trend-chart-svg"
            viewBox={`0 0 ${VIEW_WIDTH} ${VIEW_HEIGHT}`}
            preserveAspectRatio="none"
            role="group"
            tabIndex={0}
            aria-label={`${title} chart for the last ${range} days. Use left and right arrow keys to inspect each day.`}
            onPointerMove={updateFromPointer}
            onPointerDown={updateFromPointer}
            onPointerLeave={(event) => { if (event.pointerType === "mouse") setRequestedIndex(-1); }}
            onKeyDown={(event) => {
              if (event.key === "ArrowLeft") { event.preventDefault(); moveSelection(-1); }
              if (event.key === "ArrowRight") { event.preventDefault(); moveSelection(1); }
              if (event.key === "Home") { event.preventDefault(); setRequestedIndex(0); }
              if (event.key === "End") { event.preventDefault(); setRequestedIndex(lastIndex); }
            }}
            aria-describedby="trend-chart-keyboard-help"
          >
            <title>{title} trend graph</title>
            <desc id="trend-chart-keyboard-help">Hover, tap, or focus this chart and use the arrow keys to explore daily values.</desc>
            <defs>
              <linearGradient id={`${gradientId}Line`} x1="0" y1="0" x2="1" y2="0">
                <stop offset="0%" stopColor={isIncome ? "#ff654f" : "#e59667"} />
                <stop offset="52%" stopColor="#ff3f59" />
                <stop offset="100%" stopColor="#ff8b5f" />
              </linearGradient>
              <linearGradient id={`${gradientId}Area`} x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#ff4c60" stopOpacity="0.34" />
                <stop offset="58%" stopColor="#f03a54" stopOpacity="0.14" />
                <stop offset="100%" stopColor="#e42c4d" stopOpacity="0.015" />
              </linearGradient>
            </defs>

            {[0, 0.25, 0.5, 0.75, 1].map((step) => {
              const y = PLOT_TOP + plotHeight * step;
              const labelValue = maxValue * (1 - step);
              const label = isIncome ? compactMoney(labelValue, currency) : new Intl.NumberFormat("en-IN", { notation: "compact", maximumFractionDigits: 1 }).format(labelValue);
              return (
                <g key={step}>
                  <line className="trend-chart-grid-line" x1={PLOT_LEFT} y1={y} x2={VIEW_WIDTH - PLOT_RIGHT} y2={y} />
                  <text className="trend-chart-axis-label" x={PLOT_LEFT - 12} y={y + 4} textAnchor="end">{label}</text>
                </g>
              );
            })}

            {areaPath ? <path d={areaPath} fill={`url(#${gradientId}Area)`} /> : null}
            {linePath ? <path d={linePath} className="trend-chart-line-glow" /> : null}
            {linePath ? <path d={linePath} className="trend-chart-line-soft" /> : null}
            {linePath ? <path d={linePath} fill="none" stroke={`url(#${gradientId}Line)`} strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round" vectorEffect="non-scaling-stroke" /> : null}

            {active ? (
              <g aria-hidden="true">
                <line className="trend-chart-crosshair" x1={active.x} y1={PLOT_TOP} x2={active.x} y2={VIEW_HEIGHT - PLOT_BOTTOM} />
                <circle cx={active.x} cy={active.y} r="10" className="trend-chart-active-halo" />
                <circle cx={active.x} cy={active.y} r="4" className="trend-chart-active-point" />
              </g>
            ) : null}

            {first && last ? (
              <g className="trend-chart-axis-labels">
                {[0, Math.floor((plotted.length - 1) / 2), plotted.length - 1].filter((index, pos, indexes) => indexes.indexOf(index) === pos).map((index) => (
                  <text key={index} className="trend-chart-axis-label" x={plotted[index].x} y={VIEW_HEIGHT - 12} textAnchor={index === 0 ? "start" : index === plotted.length - 1 ? "end" : "middle"}>
                    {new Intl.DateTimeFormat("en-IN", { day: "numeric", month: "short", timeZone: "UTC" }).format(new Date(`${plotted[index].date}T12:00:00.000Z`))}
                  </text>
                ))}
              </g>
            ) : null}
          </svg>
        ) : (
          <p className="trend-chart-empty">No data is available for this period yet.</p>
        )}
        {visiblePoints.length > 0 && !hasValues ? <p className="trend-chart-empty trend-chart-zero-note">No recorded {isIncome ? "income" : "attendance"} in this period yet. The chart is shown at zero.</p> : null}
      </div>
      <p className="trend-chart-footnote">Daily totals for this gym · {range} days · data updates with recorded activity.</p>
    </section>
  );
}
