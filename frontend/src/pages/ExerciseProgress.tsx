import { useEffect, useMemo, useState } from "react";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from "recharts";
import { apiGet } from "../api";
import styles from "./ExerciseProgress.module.css";

// ── Types ──────────────────────────────────────────────────────────────────

interface DataPoint {
  date: string;
  value: string;
}

interface FieldProgress {
  field_id: number;
  field_name: string;
  unit: string | null;
  data_points: DataPoint[];
}

interface ExerciseProgress {
  exercise_id: number;
  exercise_name: string;
  fields: FieldProgress[];
}

// ── Helpers ────────────────────────────────────────────────────────────────

function dateToTimestamp(date: string): number {
  return new Date(date).getTime();
}

function formatDate(ts: number): string {
  return new Date(ts).toISOString().slice(0, 10);
}

// ── Custom tooltip ─────────────────────────────────────────────────────────

interface TooltipPoint {
  x: number;
  y: number;
  date: string;
}

interface TooltipPayloadEntry {
  payload?: TooltipPoint;
}

function CustomTooltip({
  active,
  payload,
  unit,
}: {
  active?: boolean;
  payload?: TooltipPayloadEntry[];
  unit: string | null;
}) {
  if (!active || !payload?.length) return null;
  const p = payload[0]?.payload;
  if (!p) return null;
  return (
    <div className={styles.tooltip}>
      <p className={styles.tooltipDate}>{p.date}</p>
      <p className={styles.tooltipValue}>
        {p.y}
        {unit ? ` ${unit}` : ""}
      </p>
    </div>
  );
}

// ── Single field chart ─────────────────────────────────────────────────────

function FieldChart({ field }: { field: FieldProgress }) {
  const chartData: TooltipPoint[] = useMemo(
    () =>
      field.data_points.map((dp) => ({
        x: dateToTimestamp(dp.date),
        y: Number(dp.value),
        date: dp.date,
      })),
    [field.data_points]
  );

  const allTs = chartData.map((p) => p.x);
  const minTs = Math.min(...allTs);
  const maxTs = Math.max(...allTs);
  const paddingMs = 86400000; // 1 day padding

  const yLabel = field.unit
    ? `${field.field_name} (${field.unit})`
    : field.field_name;

  return (
    <div className={styles.chartBlock}>
      <h4 className={styles.fieldHeading}>{yLabel}</h4>
      <div className={styles.chartWrap}>
        <ResponsiveContainer width="100%" height={220}>
          <LineChart
            data={chartData}
            margin={{ top: 12, right: 24, bottom: 8, left: 8 }}
          >
            <CartesianGrid stroke="var(--border)" strokeDasharray="3 3" />
            <XAxis
              dataKey="x"
              type="number"
              scale="time"
              domain={[minTs - paddingMs, maxTs + paddingMs]}
              tickFormatter={(ts: number) => formatDate(ts)}
              tick={{ fill: "var(--text-muted)", fontSize: 11 }}
              tickLine={{ stroke: "var(--border)" }}
              axisLine={{ stroke: "var(--border)" }}
            />
            <YAxis
              dataKey="y"
              tick={{ fill: "var(--text-muted)", fontSize: 11 }}
              tickLine={{ stroke: "var(--border)" }}
              axisLine={{ stroke: "var(--border)" }}
              width={48}
              label={
                field.unit
                  ? {
                      value: field.unit,
                      angle: -90,
                      position: "insideLeft",
                      offset: 8,
                      fill: "var(--text-muted)",
                      fontSize: 11,
                    }
                  : undefined
              }
            />
            <Tooltip
              content={<CustomTooltip unit={field.unit} />}
              cursor={{ stroke: "var(--border)" }}
            />
            <Line
              type="monotone"
              dataKey="y"
              stroke="var(--accent)"
              strokeWidth={2}
              dot={{ fill: "var(--accent)", r: 3 }}
              activeDot={{ r: 5 }}
              connectNulls
            />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

// ── Page ───────────────────────────────────────────────────────────────────

export default function ExerciseProgressPage() {
  const [data, setData] = useState<ExerciseProgress[]>([]);
  const [loadError, setLoadError] = useState("");

  useEffect(() => {
    apiGet("/api/exercises/progress")
      .then((d: ExerciseProgress[]) => {
        setData(d);
        setLoadError("");
      })
      .catch(() => {
        setLoadError("Failed to load exercise progress data.");
      });
  }, []);

  if (loadError) {
    return (
      <div className={styles.container}>
        <h2 className={styles.heading}>Exercise Progress</h2>
        <p className={styles.error}>{loadError}</p>
      </div>
    );
  }

  if (data.length === 0) {
    return (
      <div className={styles.container}>
        <h2 className={styles.heading}>Exercise Progress</h2>
        <p className={styles.empty}>
          No exercise data yet. Log some training sessions with numeric field
          values to see your progress.
        </p>
      </div>
    );
  }

  return (
    <div className={styles.container}>
      <h2 className={styles.heading}>Exercise Progress</h2>

      {data.map((ex) => (
        <section key={ex.exercise_id} className={styles.exerciseSection}>
          <h3 className={styles.exerciseHeading}>{ex.exercise_name}</h3>
          <div className={styles.fieldsGrid}>
            {ex.fields.map((field) => (
              <FieldChart key={field.field_id} field={field} />
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}
