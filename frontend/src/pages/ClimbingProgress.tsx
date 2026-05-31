import { useEffect, useState, useMemo } from "react";
import {
  ComposedChart,
  Scatter,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
  Legend,
} from "recharts";
import { apiGet } from "../api";
import styles from "./ClimbingProgress.module.css";

// ── Types ──────────────────────────────────────────────────────────────────

interface ProgressEntry {
  session_id: number;
  date: string;
  entry_id: number;
  grade_id: number;
  grade_name: string;
  grade_difficulty: number;
  grade_color: string | null;
  sends: number;
  attempts: number;
}

type Outcome = "full-send" | "partial-send" | "attempt-only";

interface ScatterPoint {
  x: number; // timestamp ms
  y: number; // grade difficulty
  outcome: Outcome;
  gradeName: string;
  date: string;
  sends: number;
  attempts: number;
}

interface TrendPoint {
  x: number; // timestamp ms
  y: number; // grade difficulty
  date: string;
  gradeName: string;
}

// ── Helpers ────────────────────────────────────────────────────────────────

function classifyOutcome(sends: number, attempts: number): Outcome {
  if (sends >= attempts && sends > 0 && attempts > 0) return "full-send";
  if (sends > 0) return "partial-send";
  return "attempt-only";
}

function dateToTimestamp(date: string): number {
  return new Date(date).getTime();
}

function formatDate(ts: number): string {
  return new Date(ts).toISOString().slice(0, 10);
}

// Outcome colours – visible on dark background
const OUTCOME_COLORS: Record<Outcome, string> = {
  "full-send": "#4ade80",     // green-400
  "partial-send": "#facc15",  // yellow-400
  "attempt-only": "#f87171",  // red-400
};

const OUTCOME_LABELS: Record<Outcome, string> = {
  "full-send": "Full send",
  "partial-send": "Partial send",
  "attempt-only": "Attempt only",
};

// ── Custom tooltip ─────────────────────────────────────────────────────────

interface TooltipPayloadEntry {
  payload?: ScatterPoint | TrendPoint;
}

function CustomTooltip({
  active,
  payload,
}: {
  active?: boolean;
  payload?: TooltipPayloadEntry[];
}) {
  if (!active || !payload?.length) return null;
  const p = payload[0]?.payload;
  if (!p) return null;

  const isScatter = "sends" in p;

  return (
    <div className={styles.tooltip}>
      <p className={styles.tooltipDate}>{p.date}</p>
      <p className={styles.tooltipGrade}>{p.gradeName} (difficulty {p.y})</p>
      {isScatter && (
        <>
          <p className={styles.tooltipStat}>
            Sends: {(p as ScatterPoint).sends} / Attempts: {(p as ScatterPoint).attempts}
          </p>
          <p
            className={styles.tooltipOutcome}
            style={{ color: OUTCOME_COLORS[(p as ScatterPoint).outcome] }}
          >
            {OUTCOME_LABELS[(p as ScatterPoint).outcome]}
          </p>
        </>
      )}
      {!isScatter && (
        <p className={styles.tooltipStat}>Peak send this session</p>
      )}
    </div>
  );
}

// ── Custom legend ──────────────────────────────────────────────────────────

function CustomLegend() {
  return (
    <div className={styles.legend}>
      {(Object.keys(OUTCOME_LABELS) as Outcome[]).map((key) => (
        <span key={key} className={styles.legendItem}>
          <span
            className={styles.legendSwatch}
            style={{ background: OUTCOME_COLORS[key] }}
          />
          {OUTCOME_LABELS[key]}
        </span>
      ))}
      <span className={styles.legendItem}>
        <span className={`${styles.legendSwatch} ${styles.legendLine}`} />
        Peak sent grade
      </span>
    </div>
  );
}

// ── Page ───────────────────────────────────────────────────────────────────

export default function ClimbingProgress() {
  const [entries, setEntries] = useState<ProgressEntry[]>([]);
  const [loadError, setLoadError] = useState("");

  useEffect(() => {
    apiGet("/api/climbing-sessions/progress")
      .then((data: ProgressEntry[]) => {
        setEntries(data);
        setLoadError("");
      })
      .catch(() => {
        setLoadError("Failed to load climbing progress data.");
      });
  }, []);

  // ── Derived chart data ─────────────────────────────────────────────────

  const { scatterData, trendData, yTicks } = useMemo(() => {
    if (entries.length === 0) {
      return { scatterData: [] as ScatterPoint[], trendData: [] as TrendPoint[], yTicks: [] as number[] };
    }

    // Build scatter points grouped by outcome
    const scatter: ScatterPoint[] = entries.map((e) => ({
      x: dateToTimestamp(e.date),
      y: e.grade_difficulty,
      outcome: classifyOutcome(e.sends, e.attempts),
      gradeName: e.grade_name,
      date: e.date,
      sends: e.sends,
      attempts: e.attempts,
    }));

    // Build trend: highest grade sent per session
    const bySession = new Map<number, { date: string; maxDifficulty: number; gradeName: string }>();
    for (const e of entries) {
      if (e.sends > 0) {
        const existing = bySession.get(e.session_id);
        if (!existing || e.grade_difficulty > existing.maxDifficulty) {
          bySession.set(e.session_id, {
            date: e.date,
            maxDifficulty: e.grade_difficulty,
            gradeName: e.grade_name,
          });
        }
      }
    }

    const trend: TrendPoint[] = Array.from(bySession.values())
      .sort((a, b) => a.date.localeCompare(b.date))
      .map((v) => ({
        x: dateToTimestamp(v.date),
        y: v.maxDifficulty,
        date: v.date,
        gradeName: v.gradeName,
      }));

    // Y-axis ticks: deduplicated difficulties from all entries
    const difficulties = Array.from(new Set(entries.map((e) => e.grade_difficulty))).sort(
      (a, b) => a - b
    );

    return { scatterData: scatter, trendData: trend, yTicks: difficulties };
  }, [entries]);

  // Build a lookup map from difficulty to grade name for Y-axis labels
  const diffToName = useMemo(() => {
    const m = new Map<number, string>();
    for (const e of entries) {
      m.set(e.grade_difficulty, e.grade_name);
    }
    return m;
  }, [entries]);

  // ── Empty state ────────────────────────────────────────────────────────

  if (!loadError && entries.length === 0) {
    return (
      <div className={styles.container}>
        <h2 className={styles.heading}>Climbing Progress</h2>
        <p className={styles.empty}>No climbing data yet. Log some sessions to see your progress.</p>
      </div>
    );
  }

  // ── Render ─────────────────────────────────────────────────────────────

  // Merge scatter and trend points on the same x domain so ComposedChart aligns correctly.
  // Recharts ComposedChart requires a shared data array or numeric x/y for Scatter.
  // We use separate datasets — Scatter consumes scatterData directly and Line consumes trendData.
  const allTs = [
    ...scatterData.map((p) => p.x),
    ...trendData.map((p) => p.x),
  ];
  const minTs = Math.min(...allTs);
  const maxTs = Math.max(...allTs);
  const paddingMs = 86400000; // 1 day padding

  return (
    <div className={styles.container}>
      <h2 className={styles.heading}>Climbing Progress</h2>

      {loadError && <p className={styles.error}>{loadError}</p>}

      {!loadError && entries.length > 0 && (
        <>
          <CustomLegend />
          <div className={styles.chartWrap}>
            <ResponsiveContainer width="100%" height={400}>
              <ComposedChart margin={{ top: 16, right: 24, bottom: 8, left: 8 }}>
                <CartesianGrid stroke="var(--border)" strokeDasharray="3 3" />
                <XAxis
                  dataKey="x"
                  type="number"
                  scale="time"
                  domain={[minTs - paddingMs, maxTs + paddingMs]}
                  tickFormatter={(ts: number) => formatDate(ts)}
                  tick={{ fill: "var(--text-muted)", fontSize: 12 }}
                  tickLine={{ stroke: "var(--border)" }}
                  axisLine={{ stroke: "var(--border)" }}
                  label={{
                    value: "Date",
                    position: "insideBottomRight",
                    offset: -8,
                    fill: "var(--text-muted)",
                    fontSize: 12,
                  }}
                />
                <YAxis
                  dataKey="y"
                  type="number"
                  domain={["dataMin - 0.5", "dataMax + 0.5"]}
                  ticks={yTicks}
                  tickFormatter={(diff: number) => diffToName.get(diff) ?? String(diff)}
                  tick={{ fill: "var(--text-muted)", fontSize: 12 }}
                  tickLine={{ stroke: "var(--border)" }}
                  axisLine={{ stroke: "var(--border)" }}
                  width={52}
                />
                <Tooltip content={<CustomTooltip />} cursor={{ fill: "transparent" }} />

                {/* Render one Scatter series per outcome for distinct colors */}
                {(["full-send", "partial-send", "attempt-only"] as Outcome[]).map((outcome) => (
                  <Scatter
                    key={outcome}
                    name={OUTCOME_LABELS[outcome]}
                    data={scatterData.filter((p) => p.outcome === outcome)}
                    fill={OUTCOME_COLORS[outcome]}
                    opacity={0.85}
                  />
                ))}

                {/* Peak-send trend line */}
                <Line
                  data={trendData}
                  dataKey="y"
                  stroke="var(--accent)"
                  strokeWidth={2}
                  dot={{ fill: "var(--accent)", r: 3 }}
                  activeDot={{ r: 5 }}
                  type="monotone"
                  connectNulls
                  legendType="line"
                  name="Peak sent grade"
                />

                <Legend content={() => null} />
              </ComposedChart>
            </ResponsiveContainer>
          </div>
        </>
      )}
    </div>
  );
}
