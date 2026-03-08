import {
  Chart,
  ArcElement,
  BarController,
  BarElement,
  CategoryScale,
  Legend,
  LinearScale,
  LineController,
  LineElement,
  PointElement,
  Title,
  Tooltip
} from "chart.js";
import { parseTimestamp } from "../utils/format";

Chart.register(
  ArcElement,
  BarController,
  BarElement,
  CategoryScale,
  Legend,
  LinearScale,
  LineController,
  LineElement,
  PointElement,
  Title,
  Tooltip
);

const CHART_COLORS = {
  ok: "rgb(74, 222, 128)",
  failure: "rgb(248, 113, 113)",
  neutral: "rgb(148, 163, 184)",
  palette: [
    "rgb(99, 102, 241)",
    "rgb(139, 92, 246)",
    "rgb(236, 72, 153)",
    "rgb(249, 115, 22)",
    "rgb(234, 179, 8)",
    "rgb(34, 197, 94)",
    "rgb(6, 182, 212)",
    "rgb(59, 130, 246)"
  ]
};

let timeSeriesChart: Chart | null = null;
let statusChart: Chart | null = null;
let outcomeChart: Chart | null = null;
let priorityChart: Chart | null = null;
let resizeObserver: ResizeObserver | null = null;

export function destroyAnalyticsCharts(): void {
  resizeObserver?.disconnect();
  resizeObserver = null;
  timeSeriesChart?.destroy();
  timeSeriesChart = null;
  statusChart?.destroy();
  statusChart = null;
  outcomeChart?.destroy();
  outcomeChart = null;
  priorityChart?.destroy();
  priorityChart = null;
}

function resizeCharts(): void {
  timeSeriesChart?.resize();
  statusChart?.resize();
  outcomeChart?.resize();
  priorityChart?.resize();
}

export interface AnalyticsChartData {
  timeSeries: { date: string; completed: number; failed: number }[];
  timeRange: AnalyticsTimeRange;
  status: { label: string; count: number }[];
  outcome: { label: string; count: number; color: string }[];
  priority: { label: string; count: number }[];
}

const STATUS_LABELS: Record<string, string> = {
  pending: "Pending",
  available: "Available",
  assigned: "Assigned",
  in_progress: "In progress",
  blocked: "Blocked",
  completed: "Completed",
  failed: "Failed",
  cancelled: "Cancelled"
};

export type AnalyticsTimeRange = "day" | "week" | "month" | "year";

function formatChartDate(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "2-digit" });
}

function formatChartMonth(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleDateString(undefined, { month: "short", year: "2-digit" });
}

/** YYYY-MM-DD in local timezone */
function toLocalDateString(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

/** YYYY-MM for local timezone */
function toLocalMonthString(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  return `${y}-${m}`;
}

function buildTimeSeriesForRange(
  tasks: { status: string; completedAt: string | null; failedAt: string | null }[],
  range: AnalyticsTimeRange
): { date: string; completed: number; failed: number }[] {
  const now = new Date();
  const counts = new Map<string, { completed: number; failed: number }>();

  const addToBucket = (key: string, isCompleted: boolean) => {
    const cur = counts.get(key) ?? { completed: 0, failed: 0 };
    if (isCompleted) cur.completed += 1;
    else cur.failed += 1;
    counts.set(key, cur);
  };

  if (range === "day") {
    for (let h = 0; h < 24; h++) {
      const key = `${String(h).padStart(2, "0")}:00`;
      counts.set(key, { completed: 0, failed: 0 });
    }
    const todayLocal = toLocalDateString(now);
    for (const t of tasks) {
      if (t.status === "completed" && t.completedAt) {
        const d = parseTimestamp(t.completedAt);
        if (toLocalDateString(d) === todayLocal) {
          const hour = d.getHours();
          addToBucket(`${String(hour).padStart(2, "0")}:00`, true);
        }
      }
      if (t.status === "failed" && t.failedAt) {
        const d = parseTimestamp(t.failedAt);
        if (toLocalDateString(d) === todayLocal) {
          const hour = d.getHours();
          addToBucket(`${String(hour).padStart(2, "0")}:00`, false);
        }
      }
    }
    return [...counts.entries()].sort((a, b) => a[0].localeCompare(b[0])).map(([date, c]) => ({ date, ...c }));
  }

  if (range === "week") {
    const buckets: string[] = [];
    for (let i = 6; i >= 0; i--) {
      const d = new Date(now);
      d.setDate(d.getDate() - i);
      buckets.push(toLocalDateString(d));
    }
    for (const b of buckets) counts.set(b, { completed: 0, failed: 0 });
    for (const t of tasks) {
      if (t.status === "completed" && t.completedAt) {
        const key = toLocalDateString(parseTimestamp(t.completedAt));
        if (counts.has(key)) addToBucket(key, true);
      }
      if (t.status === "failed" && t.failedAt) {
        const key = toLocalDateString(parseTimestamp(t.failedAt));
        if (counts.has(key)) addToBucket(key, false);
      }
    }
    return buckets.map((b) => ({ date: formatChartDate(b + "T12:00:00"), ...counts.get(b)! }));
  }

  if (range === "month") {
    const buckets: string[] = [];
    for (let i = 29; i >= 0; i--) {
      const d = new Date(now);
      d.setDate(d.getDate() - i);
      buckets.push(toLocalDateString(d));
    }
    for (const b of buckets) counts.set(b, { completed: 0, failed: 0 });
    for (const t of tasks) {
      if (t.status === "completed" && t.completedAt) {
        const key = toLocalDateString(parseTimestamp(t.completedAt));
        if (counts.has(key)) addToBucket(key, true);
      }
      if (t.status === "failed" && t.failedAt) {
        const key = toLocalDateString(parseTimestamp(t.failedAt));
        if (counts.has(key)) addToBucket(key, false);
      }
    }
    return buckets.map((b) => ({ date: formatChartDate(b + "T12:00:00"), ...counts.get(b)! }));
  }

  if (range === "year") {
    const buckets: string[] = [];
    for (let i = 11; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      buckets.push(toLocalMonthString(d));
    }
    for (const b of buckets) counts.set(b, { completed: 0, failed: 0 });
    for (const t of tasks) {
      if (t.status === "completed" && t.completedAt) {
        const key = toLocalMonthString(parseTimestamp(t.completedAt));
        if (counts.has(key)) addToBucket(key, true);
      }
      if (t.status === "failed" && t.failedAt) {
        const key = toLocalMonthString(parseTimestamp(t.failedAt));
        if (counts.has(key)) addToBucket(key, false);
      }
    }
    return buckets.map((b) => ({ date: formatChartMonth(b + "-01"), ...counts.get(b)! }));
  }

  const dateCounts = new Map<string, { completed: number; failed: number }>();
  for (const t of tasks) {
    if (t.status === "completed" && t.completedAt) {
      const key = toLocalDateString(parseTimestamp(t.completedAt));
      const cur = dateCounts.get(key) ?? { completed: 0, failed: 0 };
      cur.completed += 1;
      dateCounts.set(key, cur);
    }
    if (t.status === "failed" && t.failedAt) {
      const key = toLocalDateString(parseTimestamp(t.failedAt));
      const cur = dateCounts.get(key) ?? { completed: 0, failed: 0 };
      cur.failed += 1;
      dateCounts.set(key, cur);
    }
  }
  const sortedDates = [...dateCounts.keys()].sort();
  return sortedDates.map((date) => {
    const c = dateCounts.get(date)!;
    return { date: formatChartDate(date + "T12:00:00"), completed: c.completed, failed: c.failed };
  });
}

export function buildAnalyticsChartData(snapshot: {
  pipeline?: { status: string; count: number }[];
  summary?: { completedTasks: number; failedTasks: number };
  tasks?: {
    priority: string;
    status: string;
    completedAt: string | null;
    failedAt: string | null;
  }[];
} | null, timeRange: AnalyticsTimeRange = "day"): AnalyticsChartData {
  const pipeline = snapshot?.pipeline ?? [];
  const tasks = snapshot?.tasks ?? [];
  const summary = snapshot?.summary;

  const timeSeries = buildTimeSeriesForRange(tasks, timeRange);

  const statusData = pipeline.map((p) => ({ label: STATUS_LABELS[p.status] ?? p.status, count: p.count }));
  const priorityCounts = tasks.reduce((acc, t) => {
    acc[t.priority] = (acc[t.priority] ?? 0) + 1;
    return acc;
  }, {} as Record<string, number>);
  const priorityData = ["P0", "P1", "P2", "P3"]
    .filter((p) => (priorityCounts[p] ?? 0) > 0)
    .map((p) => ({ label: p, count: priorityCounts[p] ?? 0 }));

  const completedTotal = summary?.completedTasks ?? 0;
  const failedTotal = summary?.failedTasks ?? 0;

  return {
    timeSeries,
    timeRange,
    status: statusData,
    outcome: [
      { label: "Completed", count: completedTotal, color: "ok" },
      { label: "Failed", count: failedTotal, color: "failure" }
    ],
    priority: priorityData
  };
}

function getBorderColor(): string {
  return getComputedStyle(document.documentElement).getPropertyValue("--border").trim() || "rgba(0,0,0,0.1)";
}

const X_AXIS_LABELS: Record<AnalyticsTimeRange, string> = {
  day: "Hour",
  week: "Day",
  month: "Day",
  year: "Month"
};

export function initAnalyticsCharts(data: AnalyticsChartData): void {
  const borderColor = getBorderColor();
  const xAxisLabel = X_AXIS_LABELS[data.timeRange ?? "day"];

  const timeSeriesCanvas = document.getElementById("analytics-timeseries-chart") as HTMLCanvasElement | null;
  if (timeSeriesCanvas) {
    const labels = data.timeSeries.map((t) => t.date);
    timeSeriesChart = new Chart(timeSeriesCanvas, {
      type: "line",
      data: {
        labels: labels.length > 0 ? labels : ["No data yet"],
        datasets: [
          {
            label: "Completed",
            data: labels.length > 0 ? data.timeSeries.map((t) => t.completed) : [0],
            borderColor: CHART_COLORS.ok,
            backgroundColor: CHART_COLORS.ok + "20",
            pointBackgroundColor: CHART_COLORS.ok,
            pointBorderColor: CHART_COLORS.ok,
            fill: false,
            tension: 0.2,
            pointStyle: "circle"
          },
          {
            label: "Failed",
            data: labels.length > 0 ? data.timeSeries.map((t) => t.failed) : [0],
            borderColor: CHART_COLORS.failure,
            backgroundColor: CHART_COLORS.failure + "20",
            pointBackgroundColor: CHART_COLORS.failure,
            pointBorderColor: CHART_COLORS.failure,
            fill: false,
            tension: 0.2,
            pointStyle: "circle"
          }
        ]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        scales: {
          x: {
            title: { display: true, text: xAxisLabel },
            grid: { color: borderColor },
            border: { color: borderColor }
          },
          y: {
            beginAtZero: true,
            ticks: { stepSize: 1 },
            title: { display: true, text: "Tasks" },
            grid: { color: borderColor },
            border: { color: borderColor }
          }
        },
        plugins: {
          legend: { display: false }
        }
      }
    });
  }

  const statusCanvas = document.getElementById("analytics-status-chart") as HTMLCanvasElement | null;
  if (statusCanvas) {
    const statusLabels = data.status.length > 0 ? data.status.map((s) => s.label) : ["No tasks"];
    const statusValues = data.status.length > 0 ? data.status.map((s) => s.count) : [0];
    statusChart = new Chart(statusCanvas, {
      type: "bar",
      data: {
        labels: statusLabels,
        datasets: [
          {
            label: "Tasks",
            data: statusValues,
            backgroundColor: data.status.length > 0
              ? data.status.map((_, i) => CHART_COLORS.palette[i % CHART_COLORS.palette.length])
              : [CHART_COLORS.neutral]
          }
        ]
      },
      options: {
        indexAxis: "y",
        responsive: true,
        maintainAspectRatio: false,
        scales: {
          x: {
            beginAtZero: true,
            ticks: { stepSize: 1 },
            grid: { color: borderColor },
            border: { color: borderColor }
          },
          y: {
            grid: { color: borderColor },
            border: { color: borderColor }
          }
        },
        plugins: { legend: { display: false } }
      }
    });
  }

  const outcomeCanvas = document.getElementById("analytics-outcome-chart") as HTMLCanvasElement | null;
  if (outcomeCanvas) {
    const outcomeLabels = data.outcome.map((o) => o.label);
    const outcomeValues = data.outcome.map((o) => o.count);
    const hasOutcomes = outcomeValues.some((v) => v > 0);
    outcomeChart = new Chart(outcomeCanvas, {
      type: "bar",
      data: {
        labels: hasOutcomes ? outcomeLabels : ["No outcomes yet"],
        datasets: [
          {
            label: "Count",
            data: hasOutcomes ? outcomeValues : [0],
            backgroundColor: hasOutcomes
              ? data.outcome.map((o) => (o.color === "failure" ? CHART_COLORS.failure : CHART_COLORS.ok))
              : [CHART_COLORS.neutral]
          }
        ]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        scales: {
          x: {
            grid: { color: borderColor },
            border: { color: borderColor }
          },
          y: {
            beginAtZero: true,
            ticks: { stepSize: 1 },
            grid: { color: borderColor },
            border: { color: borderColor }
          }
        },
        plugins: { legend: { display: false } }
      }
    });
  }

  const priorityCanvas = document.getElementById("analytics-priority-chart") as HTMLCanvasElement | null;
  if (priorityCanvas) {
    const priorityLabels = data.priority.length > 0 ? data.priority.map((p) => p.label) : ["P0", "P1", "P2", "P3"];
    const priorityValues = data.priority.length > 0 ? data.priority.map((p) => p.count) : [0, 0, 0, 0];
    priorityChart = new Chart(priorityCanvas, {
      type: "bar",
      data: {
        labels: priorityLabels,
        datasets: [
          {
            label: "Tasks",
            data: priorityValues,
            backgroundColor: CHART_COLORS.palette[0]
          }
        ]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        scales: {
          x: {
            grid: { color: borderColor },
            border: { color: borderColor }
          },
          y: {
            beginAtZero: true,
            ticks: { stepSize: 1 },
            grid: { color: borderColor },
            border: { color: borderColor }
          }
        },
        plugins: {
          legend: { display: false }
        }
      }
    });
  }

  const analyticsEl = document.querySelector(".analytics");
  if (analyticsEl) {
    resizeObserver?.disconnect();
    resizeObserver = new ResizeObserver(() => resizeCharts());
    resizeObserver.observe(analyticsEl);
  }
  requestAnimationFrame(() => {
    setTimeout(resizeCharts, 50);
  });
}
