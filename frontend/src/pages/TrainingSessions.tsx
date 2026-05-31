import { FormEvent, useCallback, useEffect, useRef, useState } from "react";
import { apiGet, apiPatch, apiPost } from "../api";
import styles from "./TrainingSessions.module.css";

// ── Types ──────────────────────────────────────────────────────────────────

interface ExerciseField {
  id: number;
  name: string;
  unit: string | null;
}

interface ExerciseLibraryItem {
  id: number;
  name: string;
  category: string;
  default_sets_reps: string | null;
  fields: ExerciseField[];
}

interface FieldValue {
  id: number;
  field_id: number;
  value: string;
}

interface SessionExercise {
  id: number;
  exercise_id: number;
  completed: boolean;
  sets_reps_note: string | null;
  field_values: FieldValue[];
}

interface TrainingSession {
  id: number;
  date: string;
  weekday: number;
  exercises: SessionExercise[];
}

interface SessionSummary {
  id: number;
  date: string;
  completed_count: number;
  total_count: number;
}

// ── Constants ──────────────────────────────────────────────────────────────

const WEEKDAY_NAMES = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

function toLocalDateString(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

// ── Debounce helper ────────────────────────────────────────────────────────

function useDebounce<T extends unknown[]>(
  fn: (...args: T) => void,
  delay: number
): (...args: T) => void {
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  return useCallback(
    (...args: T) => {
      if (timerRef.current) clearTimeout(timerRef.current);
      timerRef.current = setTimeout(() => fn(...args), delay);
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [fn, delay]
  );
}

// ── Component ──────────────────────────────────────────────────────────────

export default function TrainingSessions() {
  const today = toLocalDateString(new Date());

  // Date navigation
  const [currentDate, setCurrentDate] = useState(today);

  // Session for the current date
  const [session, setSession] = useState<TrainingSession | null>(null);
  const [sessionLoading, setSessionLoading] = useState(false);
  const [sessionError, setSessionError] = useState("");

  // Library of exercises (for add-exercise modal)
  const [exercises, setExercises] = useState<ExerciseLibraryItem[]>([]);

  // History list
  const [history, setHistory] = useState<SessionSummary[]>([]);
  const [historyError, setHistoryError] = useState("");
  const [showHistory, setShowHistory] = useState(false);

  // Add-exercise modal
  const [addExModalOpen, setAddExModalOpen] = useState(false);
  const [addExId, setAddExId] = useState("");
  const [addExLoading, setAddExLoading] = useState(false);
  const [addExError, setAddExError] = useState("");

  // Inline field value editing (local state before auto-save)
  const [fieldInputs, setFieldInputs] = useState<Record<string, string>>({});

  // ── Load session for a date ──────────────────────────────────────────────

  const loadSession = useCallback(async (date: string) => {
    setSessionError("");
    setSessionLoading(true);
    setFieldInputs({});
    try {
      const data: TrainingSession = await apiGet(
        `/api/training-sessions/for-date/${date}`
      );
      setSession(data);
    } catch {
      setSessionError("Failed to load session.");
    } finally {
      setSessionLoading(false);
    }
  }, []);

  const loadExercises = useCallback(async () => {
    try {
      const data: ExerciseLibraryItem[] = await apiGet("/api/exercises");
      setExercises(data);
    } catch {
      // silently ignore
    }
  }, []);

  const loadHistory = useCallback(async () => {
    setHistoryError("");
    try {
      const data: SessionSummary[] = await apiGet("/api/training-sessions");
      setHistory(data);
    } catch {
      setHistoryError("Failed to load history.");
    }
  }, []);

  useEffect(() => {
    loadSession(currentDate);
    loadExercises();
  }, [currentDate, loadSession, loadExercises]);

  // ── Date navigation ────────────────────────────────────────────────────

  function navigate(delta: number) {
    const [y, m, d] = currentDate.split("-").map(Number);
    const next = new Date(Date.UTC(y, m - 1, d + delta));
    setCurrentDate(toLocalDateString(next));
  }

  // ── Toggle completed (auto-save) ───────────────────────────────────────

  async function handleToggleCompleted(seId: number, current: boolean) {
    if (!session) return;
    // Optimistic update
    setSession((s) =>
      s
        ? {
            ...s,
            exercises: s.exercises.map((e) =>
              e.id === seId ? { ...e, completed: !current } : e
            ),
          }
        : s
    );
    try {
      await apiPatch(
        `/api/training-sessions/${session.id}/exercises/${seId}`,
        { completed: !current }
      );
    } catch {
      // Revert
      setSession((s) =>
        s
          ? {
              ...s,
              exercises: s.exercises.map((e) =>
                e.id === seId ? { ...e, completed: current } : e
              ),
            }
          : s
      );
    }
  }

  // ── Field value auto-save (debounced) ──────────────────────────────────

  const saveFieldValue = useCallback(
    async (
      sessionId: number,
      seId: number,
      fieldId: number,
      value: string
    ) => {
      const num = parseFloat(value);
      if (isNaN(num)) return;
      try {
        const updated = await apiPatch(
          `/api/training-sessions/${sessionId}/exercises/${seId}`,
          { field_values: [{ field_id: fieldId, value: num }] }
        );
        setSession((s) =>
          s
            ? {
                ...s,
                exercises: s.exercises.map((e) =>
                  e.id === seId ? { ...e, field_values: updated.field_values } : e
                ),
              }
            : s
        );
      } catch {
        // silently ignore — value stays in input
      }
    },
    []
  );

  const debouncedSave = useDebounce(saveFieldValue, 600);

  function handleFieldInput(
    seId: number,
    fieldId: number,
    value: string
  ) {
    const key = `${seId}-${fieldId}`;
    setFieldInputs((prev) => ({ ...prev, [key]: value }));
    if (session) {
      debouncedSave(session.id, seId, fieldId, value);
    }
  }

  function fieldInputValue(se: SessionExercise, fieldId: number): string {
    const key = `${se.id}-${fieldId}`;
    if (key in fieldInputs) return fieldInputs[key];
    const fv = se.field_values.find((f) => f.field_id === fieldId);
    return fv ? fv.value : "";
  }

  // ── Add exercise to session ────────────────────────────────────────────

  function openAddExercise() {
    setAddExId("");
    setAddExError("");
    setAddExModalOpen(true);
  }

  async function handleAddExercise(e: FormEvent) {
    e.preventDefault();
    if (!session || !addExId) {
      setAddExError("Please select an exercise.");
      return;
    }
    setAddExLoading(true);
    setAddExError("");
    try {
      const newSe = await apiPost(
        `/api/training-sessions/${session.id}/exercises`,
        { exercise_id: parseInt(addExId, 10) }
      );
      setSession((s) =>
        s ? { ...s, exercises: [...s.exercises, newSe] } : s
      );
      setAddExModalOpen(false);
    } catch (err) {
      setAddExError(err instanceof Error ? err.message : "Failed to add exercise.");
    } finally {
      setAddExLoading(false);
    }
  }

  // ── History panel ──────────────────────────────────────────────────────

  async function toggleHistory() {
    if (!showHistory) {
      await loadHistory();
    }
    setShowHistory((v) => !v);
  }

  // ── Helpers ────────────────────────────────────────────────────────────

  function exerciseInfo(exerciseId: number): ExerciseLibraryItem | undefined {
    return exercises.find((e) => e.id === exerciseId);
  }

  const weekdayName = (() => {
    const [y, m, d] = currentDate.split("-").map(Number);
    return WEEKDAY_NAMES[new Date(Date.UTC(y, m - 1, d)).getUTCDay()];
  })();

  const isToday = currentDate === today;

  // ── Render ─────────────────────────────────────────────────────────────

  return (
    <div className={styles.page}>
      {/* ── Date navigation ───────────────────────────────────────────── */}
      <div className={styles.dateNav}>
        <button className={styles.navBtn} onClick={() => navigate(-1)}>
          &larr; Prev
        </button>
        <div className={styles.dateDisplay}>
          <span className={styles.datePrimary}>{currentDate}</span>
          <span className={styles.dateWeekday}>{weekdayName}</span>
          {isToday && <span className={styles.todayBadge}>Today</span>}
        </div>
        <button className={styles.navBtn} onClick={() => navigate(1)}>
          Next &rarr;
        </button>
        {!isToday && (
          <button
            className={styles.navBtn}
            onClick={() => setCurrentDate(today)}
          >
            Go to today
          </button>
        )}
      </div>

      {/* ── Session view ──────────────────────────────────────────────── */}
      <div className={styles.sessionArea}>
        {sessionLoading && (
          <p className={styles.loading}>Loading session…</p>
        )}
        {sessionError && (
          <p className={styles.error}>{sessionError}</p>
        )}

        {!sessionLoading && session && (
          <>
            {session.exercises.length === 0 ? (
              <p className={styles.empty}>
                No exercises for this day. Add one from the library below.
              </p>
            ) : (
              <div className={styles.exerciseList}>
                {session.exercises.map((se) => {
                  const ex = exerciseInfo(se.exercise_id);
                  const exName = ex?.name ?? `Exercise #${se.exercise_id}`;
                  const hint = se.sets_reps_note ?? ex?.default_sets_reps ?? null;
                  return (
                    <div
                      key={se.id}
                      className={`${styles.exerciseCard} ${se.completed ? styles.exerciseCardDone : ""}`}
                    >
                      <div className={styles.exerciseHeader}>
                        <label className={styles.checkboxLabel}>
                          <input
                            type="checkbox"
                            checked={se.completed}
                            onChange={() =>
                              handleToggleCompleted(se.id, se.completed)
                            }
                          />
                          <span className={styles.exerciseName}>{exName}</span>
                        </label>
                        {hint && (
                          <span className={styles.hint}>{hint}</span>
                        )}
                      </div>

                      {/* ── Field value inputs ─────────────────────── */}
                      {ex && ex.fields.length > 0 && (
                        <div className={styles.fieldInputs}>
                          {ex.fields.map((field) => (
                            <div key={field.id} className={styles.fieldRow}>
                              <label className={styles.fieldLabel}>
                                {field.name}
                                {field.unit && (
                                  <span className={styles.unit}>
                                    {" "}({field.unit})
                                  </span>
                                )}
                              </label>
                              <input
                                type="number"
                                className={styles.fieldInput}
                                value={fieldInputValue(se, field.id)}
                                onChange={(e) =>
                                  handleFieldInput(se.id, field.id, e.target.value)
                                }
                                placeholder="—"
                                step="any"
                              />
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}

            <button className={styles.addExBtn} onClick={openAddExercise}>
              + Add exercise from library
            </button>
          </>
        )}
      </div>

      {/* ── History ───────────────────────────────────────────────────── */}
      <div className={styles.historySection}>
        <button className={styles.historyToggle} onClick={toggleHistory}>
          {showHistory ? "Hide history" : "Show session history"}
        </button>

        {showHistory && (
          <>
            {historyError && (
              <p className={styles.error}>{historyError}</p>
            )}
            {history.length === 0 && !historyError && (
              <p className={styles.empty}>No past sessions.</p>
            )}
            <div className={styles.historyList}>
              {history.map((s) => (
                <div key={s.id} className={styles.historyRow}>
                  <button
                    className={styles.historyDateBtn}
                    onClick={() => {
                      setCurrentDate(s.date);
                      setShowHistory(false);
                    }}
                  >
                    {s.date}
                  </button>
                  <span className={styles.historySummary}>
                    {s.completed_count} / {s.total_count} exercises completed
                  </span>
                </div>
              ))}
            </div>
          </>
        )}
      </div>

      {/* ── Add exercise modal ─────────────────────────────────────────── */}
      {addExModalOpen && (
        <div className={styles.overlay}>
          <div className={styles.modal}>
            <h3 className={styles.modalHeading}>Add Exercise</h3>
            <form onSubmit={handleAddExercise}>
              <div className={styles.fieldGroup}>
                <label>Exercise</label>
                <select
                  className={styles.select}
                  value={addExId}
                  onChange={(e) => setAddExId(e.target.value)}
                  onMouseDown={(e) => e.stopPropagation()}
                >
                  <option value="">— select —</option>
                  {exercises.map((ex) => (
                    <option key={ex.id} value={ex.id}>
                      {ex.name} ({ex.category})
                    </option>
                  ))}
                </select>
              </div>
              {addExError && (
                <p className={styles.error}>{addExError}</p>
              )}
              <div className={styles.modalActions}>
                <button
                  type="button"
                  className={styles.btnSecondary}
                  onClick={() => setAddExModalOpen(false)}
                  disabled={addExLoading}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className={styles.btnPrimary}
                  disabled={addExLoading}
                >
                  {addExLoading ? "Adding…" : "Add"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
