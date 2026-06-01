import { FormEvent, useCallback, useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { apiDelete, apiGet, apiPatch, apiPost } from "../api";
import ConfirmDialog from "../components/ConfirmDialog";
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

interface ActivePlan {
  id: number;
  name: string;
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

  // Active week plan
  const [activePlan, setActivePlan] = useState<ActivePlan | null | undefined>(undefined);

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

  // Remove-exercise confirmation
  const [removeSeId, setRemoveSeId] = useState<number | null>(null);

  // Inline field value editing (local state before auto-save)
  const [fieldInputs, setFieldInputs] = useState<Record<string, string>>({});

  // Inline notes editing (local state before auto-save)
  const [noteInputs, setNoteInputs] = useState<Record<string, string>>({});

  // ── Load session for a date ──────────────────────────────────────────────

  const loadSession = useCallback(async (date: string) => {
    setSessionError("");
    setSessionLoading(true);
    setFieldInputs({});
    setNoteInputs({});
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

  const loadActivePlan = useCallback(async () => {
    try {
      const templates: Array<{ id: number; name: string; is_active: boolean }> =
        await apiGet("/api/week-templates");
      const active = templates.find((t) => t.is_active) ?? null;
      setActivePlan(active);
    } catch {
      setActivePlan(null);
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
    loadActivePlan();
  }, [currentDate, loadSession, loadExercises, loadActivePlan]);

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

  // ── Notes auto-save (debounced) ────────────────────────────────────────

  const saveNote = useCallback(
    async (sessionId: number, seId: number, note: string) => {
      try {
        const updated = await apiPatch(
          `/api/training-sessions/${sessionId}/exercises/${seId}`,
          { sets_reps_note: note }
        );
        setSession((s) =>
          s
            ? {
                ...s,
                exercises: s.exercises.map((e) =>
                  e.id === seId
                    ? { ...e, sets_reps_note: updated.sets_reps_note }
                    : e
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

  const debouncedSaveNote = useDebounce(saveNote, 600);

  function handleNoteInput(seId: number, value: string) {
    setNoteInputs((prev) => ({ ...prev, [seId]: value }));
    if (session) {
      debouncedSaveNote(session.id, seId, value);
    }
  }

  function noteInputValue(se: SessionExercise): string {
    const key = String(se.id);
    if (key in noteInputs) return noteInputs[key];
    return se.sets_reps_note ?? "";
  }

  // ── Remove exercise from session ───────────────────────────────────────

  async function handleRemoveExercise() {
    if (!session || removeSeId === null) return;
    const seId = removeSeId;
    setRemoveSeId(null);
    // Optimistic remove
    setSession((s) =>
      s
        ? { ...s, exercises: s.exercises.filter((e) => e.id !== seId) }
        : s
    );
    try {
      await apiDelete(
        `/api/training-sessions/${session.id}/exercises/${seId}`
      );
    } catch {
      // Revert — reload session
      loadSession(currentDate);
    }
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

  // ── Completion counters ────────────────────────────────────────────────

  const completedCount = session?.exercises.filter((e) => e.completed).length ?? 0;
  const totalCount = session?.exercises.length ?? 0;
  const allDone = totalCount > 0 && completedCount === totalCount;

  // ── Render ─────────────────────────────────────────────────────────────

  return (
    <div className={styles.page}>
      {/* ── Active week plan banner ────────────────────────────────────── */}
      {activePlan !== undefined && (
        <div className={styles.activePlanBanner}>
          {activePlan ? (
            <span>
              Week Plan:{" "}
              <Link to="/week-templates" className={styles.activePlanLink}>
                {activePlan.name}
              </Link>
            </span>
          ) : (
            <span>
              No active week plan —{" "}
              <Link to="/week-templates" className={styles.activePlanLink}>
                set one up
              </Link>
            </span>
          )}
        </div>
      )}

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
            {/* ── Completion counter ────────────────────────────────── */}
            {totalCount > 0 && (
              <div className={styles.completionHeader}>
                <span className={styles.completionCounter}>
                  {completedCount} / {totalCount} done
                </span>
                {allDone && (
                  <span className={styles.sessionCompleteLabel} aria-live="polite">
                    Session complete!
                  </span>
                )}
              </div>
            )}

            {session.exercises.length === 0 ? (
              <p className={styles.empty}>
                No exercises for this day. Add one from the library below.
              </p>
            ) : (
              <div className={styles.exerciseList}>
                {session.exercises.map((se) => {
                  const ex = exerciseInfo(se.exercise_id);
                  const exName = ex?.name ?? `Exercise #${se.exercise_id}`;
                  const hasNoFields = !ex || ex.fields.length === 0;
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
                          <span
                            className={`${styles.exerciseName} ${se.completed ? styles.exerciseNameDone : ""}`}
                          >
                            {exName}
                          </span>
                        </label>
                        <button
                          className={styles.removeBtn}
                          onClick={() => setRemoveSeId(se.id)}
                          aria-label={`Remove ${exName}`}
                          title="Remove exercise"
                        >
                          &times;
                        </button>
                      </div>

                      {/* ── Notes / sets-reps field ────────────────── */}
                      <div className={styles.noteRow}>
                        <label className={styles.noteLabel} htmlFor={`note-${se.id}`}>
                          {hasNoFields ? "Sets / reps note" : "Note"}
                        </label>
                        <input
                          id={`note-${se.id}`}
                          type="text"
                          className={styles.noteInput}
                          value={noteInputValue(se)}
                          onChange={(e) => handleNoteInput(se.id, e.target.value)}
                          placeholder={
                            hasNoFields
                              ? ex?.default_sets_reps ?? "e.g. 3×10"
                              : "optional note"
                          }
                        />
                      </div>

                      {/* ── Field value inputs (only when done) ───── */}
                      {se.completed && ex && ex.fields.length > 0 && (
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

                      {/* ── Guidance for exercises with no fields ──── */}
                      {hasNoFields && !se.completed && (
                        <p className={styles.noFieldsHint}>
                          Mark done to log this exercise. Add numeric fields in
                          the Exercise Library to track weights or durations.
                        </p>
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

      {/* ── Remove exercise confirmation ───────────────────────────────── */}
      {removeSeId !== null && (
        <ConfirmDialog
          message="Remove this exercise from the session?"
          confirmLabel="Remove"
          cancelLabel="Cancel"
          onConfirm={handleRemoveExercise}
          onCancel={() => setRemoveSeId(null)}
        />
      )}
    </div>
  );
}
