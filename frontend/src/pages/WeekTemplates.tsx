import { FormEvent, useEffect, useState } from "react";
import { apiGet, apiPost, apiPut, apiDelete } from "../api";
import styles from "./WeekTemplates.module.css";

// ── Types ──────────────────────────────────────────────────────────────────

interface TemplateSummary {
  id: number;
  name: string;
  is_active: boolean;
}

interface DayExercise {
  id: number;
  exercise_id: number;
  sets_reps_override: string | null;
  display_order: number;
}

interface TemplateDay {
  id: number;
  weekday: number;
  includes_climbing: boolean;
  exercises: DayExercise[];
}

interface TemplateDetail extends TemplateSummary {
  days: TemplateDay[];
}

interface Exercise {
  id: number;
  name: string;
  category: string;
  default_sets_reps: string | null;
}

// ── Constants ──────────────────────────────────────────────────────────────

const WEEKDAY_NAMES = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const ALL_WEEKDAYS = [0, 1, 2, 3, 4, 5, 6];

// ── Component ──────────────────────────────────────────────────────────────

export default function WeekTemplates() {
  const [templates, setTemplates] = useState<TemplateSummary[]>([]);
  const [loadError, setLoadError] = useState("");

  // Selected template detail for the editor
  const [selectedTemplate, setSelectedTemplate] = useState<TemplateDetail | null>(null);
  const [editorError, setEditorError] = useState("");

  // Exercise library (needed for adding exercises to days)
  const [exercises, setExercises] = useState<Exercise[]>([]);

  // Create template form
  const [newName, setNewName] = useState("");
  const [createError, setCreateError] = useState("");
  const [createLoading, setCreateLoading] = useState(false);

  // Rename modal
  const [renameTarget, setRenameTarget] = useState<TemplateSummary | null>(null);
  const [renameName, setRenameName] = useState("");
  const [renameError, setRenameError] = useState("");
  const [renameLoading, setRenameLoading] = useState(false);

  // Add-exercise modal per day
  type AddExState = { weekday: number; exerciseId: string; setsReps: string };
  const [addExState, setAddExState] = useState<AddExState | null>(null);
  const [addExError, setAddExError] = useState("");
  const [addExLoading, setAddExLoading] = useState(false);

  // Edit sets/reps override inline
  type EditOverrideState = { assignmentId: number; weekday: number; value: string };
  const [editOverride, setEditOverride] = useState<EditOverrideState | null>(null);

  // Action error
  const [actionError, setActionError] = useState("");

  async function loadTemplates() {
    try {
      const data = await apiGet("/api/week-templates");
      setTemplates(data);
      setLoadError("");
    } catch {
      setLoadError("Failed to load templates.");
    }
  }

  async function loadExercises() {
    try {
      const data = await apiGet("/api/exercises");
      setExercises(data);
    } catch {
      // silently ignore — exercises just won't be listed
    }
  }

  async function loadTemplateDetail(id: number) {
    try {
      const data = await apiGet(`/api/week-templates/${id}`);
      setSelectedTemplate(data);
      setEditorError("");
    } catch {
      setEditorError("Failed to load template.");
    }
  }

  useEffect(() => {
    loadTemplates();
    loadExercises();
  }, []);

  // ── Create template ────────────────────────────────────────────────────

  async function handleCreate(e: FormEvent) {
    e.preventDefault();
    setCreateError("");
    if (!newName.trim()) {
      setCreateError("Name is required.");
      return;
    }
    setCreateLoading(true);
    try {
      const created = await apiPost("/api/week-templates", { name: newName.trim() });
      setNewName("");
      await loadTemplates();
      // Open the newly created template in the editor
      setSelectedTemplate(created);
    } catch (err) {
      setCreateError(err instanceof Error ? err.message : "Failed to create template.");
    } finally {
      setCreateLoading(false);
    }
  }

  // ── Activate template ──────────────────────────────────────────────────

  async function handleActivate(template: TemplateSummary) {
    setActionError("");
    try {
      await apiPost(`/api/week-templates/${template.id}/activate`, {});
      await loadTemplates();
      if (selectedTemplate?.id === template.id) {
        await loadTemplateDetail(template.id);
      }
    } catch (err) {
      setActionError(err instanceof Error ? err.message : "Failed to activate template.");
    }
  }

  // ── Delete template ────────────────────────────────────────────────────

  async function handleDelete(template: TemplateSummary) {
    setActionError("");
    try {
      await apiDelete(`/api/week-templates/${template.id}`);
      if (selectedTemplate?.id === template.id) {
        setSelectedTemplate(null);
      }
      await loadTemplates();
    } catch (err) {
      setActionError(err instanceof Error ? err.message : "Failed to delete template.");
    }
  }

  // ── Rename template ────────────────────────────────────────────────────

  function openRename(template: TemplateSummary) {
    setRenameTarget(template);
    setRenameName(template.name);
    setRenameError("");
  }

  async function handleRenameSave(e: FormEvent) {
    e.preventDefault();
    if (!renameTarget) return;
    setRenameError("");
    if (!renameName.trim()) {
      setRenameError("Name is required.");
      return;
    }
    setRenameLoading(true);
    try {
      await apiPut(`/api/week-templates/${renameTarget.id}`, { name: renameName.trim() });
      setRenameTarget(null);
      await loadTemplates();
      if (selectedTemplate?.id === renameTarget.id) {
        await loadTemplateDetail(renameTarget.id);
      }
    } catch (err) {
      setRenameError(err instanceof Error ? err.message : "Failed to rename template.");
    } finally {
      setRenameLoading(false);
    }
  }

  // ── Toggle includes_climbing ───────────────────────────────────────────

  async function handleToggleClimbing(weekday: number, currentValue: boolean) {
    if (!selectedTemplate) return;
    setEditorError("");
    try {
      await apiPut(`/api/week-templates/${selectedTemplate.id}/days/${weekday}`, {
        includes_climbing: !currentValue,
      });
      await loadTemplateDetail(selectedTemplate.id);
    } catch (err) {
      setEditorError(err instanceof Error ? err.message : "Failed to update day.");
    }
  }

  // ── Add exercise to day ────────────────────────────────────────────────

  function openAddExercise(weekday: number) {
    setAddExState({ weekday, exerciseId: "", setsReps: "" });
    setAddExError("");
  }

  async function handleAddExercise(e: FormEvent) {
    e.preventDefault();
    if (!addExState || !selectedTemplate) return;
    setAddExError("");
    if (!addExState.exerciseId) {
      setAddExError("Please select an exercise.");
      return;
    }
    setAddExLoading(true);
    try {
      const day = selectedTemplate.days.find((d) => d.weekday === addExState.weekday);
      const currentCount = day?.exercises.length ?? 0;
      await apiPost(
        `/api/week-templates/${selectedTemplate.id}/days/${addExState.weekday}/exercises`,
        {
          exercise_id: parseInt(addExState.exerciseId, 10),
          sets_reps_override: addExState.setsReps.trim() || null,
          display_order: currentCount,
        }
      );
      setAddExState(null);
      await loadTemplateDetail(selectedTemplate.id);
    } catch (err) {
      setAddExError(err instanceof Error ? err.message : "Failed to add exercise.");
    } finally {
      setAddExLoading(false);
    }
  }

  // ── Remove exercise from day ───────────────────────────────────────────

  async function handleRemoveExercise(weekday: number, assignmentId: number) {
    if (!selectedTemplate) return;
    setEditorError("");
    try {
      await apiDelete(
        `/api/week-templates/${selectedTemplate.id}/days/${weekday}/exercises/${assignmentId}`
      );
      await loadTemplateDetail(selectedTemplate.id);
    } catch (err) {
      setEditorError(err instanceof Error ? err.message : "Failed to remove exercise.");
    }
  }

  // ── Edit sets/reps override ────────────────────────────────────────────

  async function handleSaveOverride(weekday: number, assignmentId: number) {
    if (!selectedTemplate || !editOverride) return;
    setEditorError("");
    try {
      await apiPut(
        `/api/week-templates/${selectedTemplate.id}/days/${weekday}/exercises/${assignmentId}`,
        { sets_reps_override: editOverride.value.trim() || null }
      );
      setEditOverride(null);
      await loadTemplateDetail(selectedTemplate.id);
    } catch (err) {
      setEditorError(err instanceof Error ? err.message : "Failed to update exercise.");
    }
  }

  // ── Reorder exercises (move up / move down) ────────────────────────────

  async function handleMoveExercise(weekday: number, assignmentId: number, direction: -1 | 1) {
    if (!selectedTemplate) return;
    const day = selectedTemplate.days.find((d) => d.weekday === weekday);
    if (!day) return;

    const sorted = [...day.exercises].sort((a, b) => a.display_order - b.display_order);
    const idx = sorted.findIndex((e) => e.id === assignmentId);
    if (idx < 0) return;

    const swapIdx = idx + direction;
    if (swapIdx < 0 || swapIdx >= sorted.length) return;

    const a = sorted[idx];
    const b = sorted[swapIdx];
    setEditorError("");
    try {
      await Promise.all([
        apiPut(
          `/api/week-templates/${selectedTemplate.id}/days/${weekday}/exercises/${a.id}`,
          { display_order: b.display_order }
        ),
        apiPut(
          `/api/week-templates/${selectedTemplate.id}/days/${weekday}/exercises/${b.id}`,
          { display_order: a.display_order }
        ),
      ]);
      await loadTemplateDetail(selectedTemplate.id);
    } catch (err) {
      setEditorError(err instanceof Error ? err.message : "Failed to reorder exercises.");
    }
  }

  // ── Helpers ────────────────────────────────────────────────────────────

  function getDayData(weekday: number): TemplateDay | undefined {
    return selectedTemplate?.days.find((d) => d.weekday === weekday);
  }

  function exerciseName(exerciseId: number): string {
    return exercises.find((e) => e.id === exerciseId)?.name ?? `#${exerciseId}`;
  }

  // ── Render ─────────────────────────────────────────────────────────────

  return (
    <div className={styles.page}>
      {/* ── Template list ───────────────────────────────────────────── */}
      <aside className={styles.sidebar}>
        <h2 className={styles.sidebarHeading}>Templates</h2>

        {loadError && <p className={styles.error}>{loadError}</p>}
        {actionError && <p className={styles.error}>{actionError}</p>}

        {templates.length === 0 && !loadError && (
          <p className={styles.empty}>No templates yet.</p>
        )}

        <div className={styles.templateList}>
          {templates.map((t) => (
            <div
              key={t.id}
              className={`${styles.templateRow} ${selectedTemplate?.id === t.id ? styles.templateRowSelected : ""}`}
              onClick={() => loadTemplateDetail(t.id)}
            >
              <div className={styles.templateRowInfo}>
                {t.is_active && <span className={styles.activeBadge}>Active</span>}
                <span className={styles.templateName}>{t.name}</span>
              </div>
              <div className={styles.rowActions} onClick={(e) => e.stopPropagation()}>
                {!t.is_active && (
                  <button className={styles.btnSmall} onClick={() => handleActivate(t)}>
                    Activate
                  </button>
                )}
                <button className={styles.btnSmall} onClick={() => openRename(t)}>
                  Rename
                </button>
                <button
                  className={`${styles.btnSmall} ${styles.btnDanger}`}
                  onClick={() => handleDelete(t)}
                >
                  Delete
                </button>
              </div>
            </div>
          ))}
        </div>

        {/* Create form */}
        <form onSubmit={handleCreate} className={styles.createForm}>
          <input
            className={styles.input}
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            placeholder="New template name…"
          />
          {createError && <p className={styles.error}>{createError}</p>}
          <button className={styles.btnPrimary} type="submit" disabled={createLoading}>
            {createLoading ? "Creating…" : "Create Template"}
          </button>
        </form>
      </aside>

      {/* ── Template editor ─────────────────────────────────────────── */}
      <main className={styles.editor}>
        {!selectedTemplate ? (
          <p className={styles.editorPlaceholder}>
            Select a template on the left to edit it.
          </p>
        ) : (
          <>
            <div className={styles.editorHeader}>
              <h2 className={styles.editorHeading}>
                {selectedTemplate.name}
                {selectedTemplate.is_active && (
                  <span className={styles.activeBadgeInline}>Active</span>
                )}
              </h2>
            </div>

            {editorError && <p className={styles.error}>{editorError}</p>}

            <div className={styles.daysGrid}>
              {ALL_WEEKDAYS.map((weekday) => {
                const day = getDayData(weekday);
                const sorted =
                  day?.exercises.slice().sort((a, b) => a.display_order - b.display_order) ?? [];

                return (
                  <div key={weekday} className={styles.dayCard}>
                    <div className={styles.dayHeader}>
                      <span className={styles.dayName}>{WEEKDAY_NAMES[weekday]}</span>
                      <label className={styles.climbingToggle}>
                        <input
                          type="checkbox"
                          checked={day?.includes_climbing ?? false}
                          onChange={() =>
                            handleToggleClimbing(weekday, day?.includes_climbing ?? false)
                          }
                        />
                        <span>Climbing</span>
                      </label>
                    </div>

                    <div className={styles.exerciseList}>
                      {sorted.length === 0 && (
                        <p className={styles.dayEmpty}>No exercises.</p>
                      )}
                      {sorted.map((ex, idx) => (
                        <div key={ex.id} className={styles.exerciseRow}>
                          <div className={styles.exerciseInfo}>
                            <span className={styles.exerciseName}>
                              {exerciseName(ex.exercise_id)}
                            </span>
                            {editOverride?.assignmentId === ex.id ? (
                              <div className={styles.overrideEdit}>
                                <input
                                  className={`${styles.input} ${styles.inputTiny}`}
                                  value={editOverride.value}
                                  onChange={(e) =>
                                    setEditOverride((s) =>
                                      s ? { ...s, value: e.target.value } : s
                                    )
                                  }
                                  placeholder="e.g. 3×10"
                                  autoFocus
                                />
                                <button
                                  className={styles.btnSmall}
                                  onClick={() => handleSaveOverride(weekday, ex.id)}
                                >
                                  Save
                                </button>
                                <button
                                  className={styles.btnSmall}
                                  onClick={() => setEditOverride(null)}
                                >
                                  Cancel
                                </button>
                              </div>
                            ) : (
                              <button
                                className={styles.overrideBtn}
                                onClick={() =>
                                  setEditOverride({
                                    assignmentId: ex.id,
                                    weekday,
                                    value: ex.sets_reps_override ?? "",
                                  })
                                }
                                title="Edit sets/reps override"
                              >
                                {ex.sets_reps_override ? (
                                  <span className={styles.overrideBadge}>
                                    {ex.sets_reps_override}
                                  </span>
                                ) : (
                                  <span className={styles.overrideEmpty}>+ sets/reps</span>
                                )}
                              </button>
                            )}
                          </div>
                          <div className={styles.rowActions}>
                            <button
                              className={styles.btnSmall}
                              disabled={idx === 0}
                              onClick={() => handleMoveExercise(weekday, ex.id, -1)}
                              title="Move up"
                            >
                              ↑
                            </button>
                            <button
                              className={styles.btnSmall}
                              disabled={idx === sorted.length - 1}
                              onClick={() => handleMoveExercise(weekday, ex.id, 1)}
                              title="Move down"
                            >
                              ↓
                            </button>
                            <button
                              className={`${styles.btnSmall} ${styles.btnDanger}`}
                              onClick={() => handleRemoveExercise(weekday, ex.id)}
                              title="Remove"
                            >
                              ✕
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>

                    <button
                      className={styles.addExBtn}
                      onClick={() => openAddExercise(weekday)}
                    >
                      + Add exercise
                    </button>
                  </div>
                );
              })}
            </div>
          </>
        )}
      </main>

      {/* ── Rename modal ──────────────────────────────────────────────── */}
      {renameTarget && (
        <div className={styles.overlay}>
          <div className={styles.modal}>
            <h3 className={styles.modalHeading}>Rename Template</h3>
            <form onSubmit={handleRenameSave}>
              <div className={styles.fieldGroup}>
                <label>Name</label>
                <input
                  className={styles.input}
                  value={renameName}
                  onChange={(e) => setRenameName(e.target.value)}
                  required
                  autoFocus
                />
              </div>
              {renameError && <p className={styles.error}>{renameError}</p>}
              <div className={styles.modalActions}>
                <button
                  type="button"
                  className={styles.btnSecondary}
                  onClick={() => setRenameTarget(null)}
                  disabled={renameLoading}
                >
                  Cancel
                </button>
                <button type="submit" className={styles.btnPrimary} disabled={renameLoading}>
                  {renameLoading ? "Saving…" : "Save"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ── Add exercise modal ─────────────────────────────────────────── */}
      {addExState && (
        <div className={styles.overlay}>
          <div className={styles.modal}>
            <h3 className={styles.modalHeading}>
              Add Exercise — {WEEKDAY_NAMES[addExState.weekday]}
            </h3>
            <form onSubmit={handleAddExercise}>
              <div className={styles.fieldGroup}>
                <label>Exercise</label>
                <select
                  className={styles.select}
                  value={addExState.exerciseId}
                  onChange={(e) =>
                    setAddExState((s) => s && { ...s, exerciseId: e.target.value })
                  }
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
              <div className={styles.fieldGroup}>
                <label>Sets / Reps override (optional)</label>
                <input
                  className={styles.input}
                  value={addExState.setsReps}
                  onChange={(e) =>
                    setAddExState((s) => s && { ...s, setsReps: e.target.value })
                  }
                  placeholder="e.g. 3×10 (overrides exercise default)"
                />
              </div>
              {addExError && <p className={styles.error}>{addExError}</p>}
              <div className={styles.modalActions}>
                <button
                  type="button"
                  className={styles.btnSecondary}
                  onClick={() => setAddExState(null)}
                  disabled={addExLoading}
                >
                  Cancel
                </button>
                <button type="submit" className={styles.btnPrimary} disabled={addExLoading}>
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
