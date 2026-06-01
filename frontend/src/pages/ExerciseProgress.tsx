import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
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

interface ExerciseField {
  id: number;
  name: string;
  unit: string | null;
  display_order: number;
}

interface Exercise {
  id: number;
  name: string;
  category: string;
  description: string | null;
  default_sets_reps: string | null;
  archived_at: string | null;
  fields: ExerciseField[];
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

  // Y-axis: base on actual data range with padding, not forced to 0
  const allY = chartData.map((p) => p.y);
  const minY = Math.min(...allY);
  const maxY = Math.max(...allY);
  const yRange = maxY - minY;
  const yPadding = yRange === 0 ? Math.max(1, Math.abs(minY) * 0.1) : yRange * 0.15;
  const yMin = minY - yPadding;
  const yMax = maxY + yPadding;

  return (
    <div className={styles.chartBlock}>
      {/* Show field name only; unit appears once on the Y-axis label */}
      <h4 className={styles.fieldHeading}>{field.field_name}</h4>
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
              domain={[yMin, yMax]}
              tick={{ fill: "var(--text-muted)", fontSize: 11 }}
              tickLine={{ stroke: "var(--border)" }}
              axisLine={{ stroke: "var(--border)" }}
              width={52}
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

// ── Exercise selector ──────────────────────────────────────────────────────

interface ExerciseOption {
  id: number;
  name: string;
}

function ExerciseSelector({
  options,
  selectedId,
  onChange,
}: {
  options: ExerciseOption[];
  selectedId: number | null;
  onChange: (id: number) => void;
}) {
  return (
    <div className={styles.selectorRow}>
      <label htmlFor="exercise-select" className={styles.selectorLabel}>
        Exercise
      </label>
      <select
        id="exercise-select"
        className={styles.selector}
        value={selectedId ?? ""}
        onChange={(e) => onChange(Number(e.target.value))}
      >
        {options.map((opt) => (
          <option key={opt.id} value={opt.id}>
            {opt.name}
          </option>
        ))}
      </select>
    </div>
  );
}

// ── Page ───────────────────────────────────────────────────────────────────

export default function ExerciseProgressPage() {
  const [progressData, setProgressData] = useState<ExerciseProgress[]>([]);
  const [allExercises, setAllExercises] = useState<Exercise[]>([]);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [loadError, setLoadError] = useState("");

  useEffect(() => {
    Promise.all([
      apiGet("/api/exercises/progress") as Promise<ExerciseProgress[]>,
      apiGet("/api/exercises") as Promise<Exercise[]>,
    ])
      .then(([progress, exercises]) => {
        setProgressData(progress);
        setAllExercises(exercises);
        setLoadError("");
        // Default to first exercise in progress data, then first exercise overall
        if (progress.length > 0) {
          setSelectedId(progress[0].exercise_id);
        } else if (exercises.length > 0) {
          setSelectedId(exercises[0].id);
        }
      })
      .catch(() => {
        setLoadError("Failed to load exercise progress data.");
      });
  }, []);

  // Build the exercise list for the selector: exercises that have logged fields
  // come first (sorted by name), then exercises without any fields.
  const selectorOptions: ExerciseOption[] = useMemo(() => {
    return allExercises.map((ex) => ({ id: ex.id, name: ex.name }));
  }, [allExercises]);

  // Currently selected exercise details
  const selectedExercise = useMemo(
    () => allExercises.find((ex) => ex.id === selectedId) ?? null,
    [allExercises, selectedId]
  );

  // Progress data for the selected exercise
  const selectedProgress = useMemo(
    () => progressData.find((ep) => ep.exercise_id === selectedId) ?? null,
    [progressData, selectedId]
  );

  if (loadError) {
    return (
      <div className={styles.container}>
        <h2 className={styles.heading}>Exercise Progress</h2>
        <p className={styles.error}>{loadError}</p>
      </div>
    );
  }

  if (allExercises.length === 0 && progressData.length === 0) {
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

  // Determine the state of the selected exercise
  const hasNoFields =
    selectedExercise !== null && selectedExercise.fields.length === 0;
  const hasFieldsButNoData =
    selectedExercise !== null &&
    selectedExercise.fields.length > 0 &&
    selectedProgress === null;
  const hasData = selectedProgress !== null && selectedProgress.fields.length > 0;

  return (
    <div className={styles.container}>
      <h2 className={styles.heading}>Exercise Progress</h2>

      {selectorOptions.length > 0 && (
        <ExerciseSelector
          options={selectorOptions}
          selectedId={selectedId}
          onChange={setSelectedId}
        />
      )}

      {hasNoFields && (
        <p className={styles.noFields} data-testid="no-fields-message">
          This exercise has no numeric fields to track. Add fields (e.g. weight,
          reps, duration) in the{" "}
          <Link to="/exercises" className={styles.link}>
            exercise library
          </Link>{" "}
          to start tracking progress.
        </p>
      )}

      {hasFieldsButNoData && (
        <p className={styles.empty} data-testid="no-data-message">
          No data logged yet for this exercise. Complete a training session that
          includes this exercise and fill in its field values to see progress
          here.
        </p>
      )}

      {hasData && (
        <section className={styles.exerciseSection}>
          <div className={styles.fieldsGrid}>
            {selectedProgress!.fields.map((field) => (
              <FieldChart key={field.field_id} field={field} />
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
