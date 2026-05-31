import { FormEvent, useEffect, useState } from "react";
import { apiGet, apiPost, apiPut, apiDelete } from "../api";
import styles from "./ExerciseLibrary.module.css";
import ConfirmDialog from "../components/ConfirmDialog";

// ── Types ──────────────────────────────────────────────────────────────────

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

// ── Exercise Library Page ──────────────────────────────────────────────────

export default function ExerciseLibrary() {
  const [exercises, setExercises] = useState<Exercise[]>([]);
  const [loadError, setLoadError] = useState("");

  // Add form state
  const [addName, setAddName] = useState("");
  const [addCategory, setAddCategory] = useState("");
  const [addDescription, setAddDescription] = useState("");
  const [addSetsReps, setAddSetsReps] = useState("");
  const [addError, setAddError] = useState("");
  const [addLoading, setAddLoading] = useState(false);

  // Edit modal state
  type EditState = {
    exercise: Exercise;
    name: string;
    category: string;
    description: string;
    default_sets_reps: string;
  };
  const [editState, setEditState] = useState<EditState | null>(null);
  const [editError, setEditError] = useState("");
  const [editLoading, setEditLoading] = useState(false);

  // Fields modal state
  const [fieldsExercise, setFieldsExercise] = useState<Exercise | null>(null);
  const [newFieldName, setNewFieldName] = useState("");
  const [newFieldUnit, setNewFieldUnit] = useState("");
  const [fieldError, setFieldError] = useState("");
  const [fieldLoading, setFieldLoading] = useState(false);

  // Edit-field inline state: fieldId -> edit values
  type FieldEditState = { name: string; unit: string };
  const [editingField, setEditingField] = useState<{ id: number; state: FieldEditState } | null>(null);

  // Action error (archive / delete)
  const [actionError, setActionError] = useState("");

  // Confirmation dialog state
  type ConfirmState = { message: string; onConfirm: () => void };
  const [confirmState, setConfirmState] = useState<ConfirmState | null>(null);

  async function loadExercises() {
    try {
      const data = await apiGet("/api/exercises");
      setExercises(data);
      setLoadError("");
    } catch {
      setLoadError("Failed to load exercises.");
    }
  }

  useEffect(() => {
    loadExercises();
  }, []);

  // ── Add exercise ──────────────────────────────────────────────────────

  async function handleAdd(e: FormEvent) {
    e.preventDefault();
    setAddError("");
    if (!addName.trim() || !addCategory.trim()) {
      setAddError("Name and category are required.");
      return;
    }
    setAddLoading(true);
    try {
      await apiPost("/api/exercises", {
        name: addName.trim(),
        category: addCategory.trim(),
        description: addDescription.trim() || null,
        default_sets_reps: addSetsReps.trim() || null,
      });
      setAddName("");
      setAddCategory("");
      setAddDescription("");
      setAddSetsReps("");
      await loadExercises();
    } catch (err) {
      setAddError(err instanceof Error ? err.message : "Failed to create exercise.");
    } finally {
      setAddLoading(false);
    }
  }

  // ── Edit exercise ─────────────────────────────────────────────────────

  function openEdit(exercise: Exercise) {
    setEditState({
      exercise,
      name: exercise.name,
      category: exercise.category,
      description: exercise.description ?? "",
      default_sets_reps: exercise.default_sets_reps ?? "",
    });
    setEditError("");
  }

  async function handleEditSave(e: FormEvent) {
    e.preventDefault();
    if (!editState) return;
    setEditError("");
    if (!editState.name.trim() || !editState.category.trim()) {
      setEditError("Name and category are required.");
      return;
    }
    setEditLoading(true);
    try {
      await apiPut(`/api/exercises/${editState.exercise.id}`, {
        name: editState.name.trim(),
        category: editState.category.trim(),
        description: editState.description.trim() || null,
        default_sets_reps: editState.default_sets_reps.trim() || null,
      });
      setEditState(null);
      await loadExercises();
    } catch (err) {
      setEditError(err instanceof Error ? err.message : "Failed to update exercise.");
    } finally {
      setEditLoading(false);
    }
  }

  // ── Archive / Delete ──────────────────────────────────────────────────

  function handleArchive(exercise: Exercise) {
    setConfirmState({
      message: `Archive "${exercise.name}"? It will be hidden from new training days but its log history will be preserved.`,
      onConfirm: async () => {
        setConfirmState(null);
        setActionError("");
        try {
          await apiPost(`/api/exercises/${exercise.id}/archive`, {});
          await loadExercises();
        } catch (err) {
          setActionError(err instanceof Error ? err.message : "Failed to archive exercise.");
        }
      },
    });
  }

  function handleDelete(exercise: Exercise) {
    setConfirmState({
      message: `Delete "${exercise.name}"? This cannot be undone.`,
      onConfirm: async () => {
        setConfirmState(null);
        setActionError("");
        try {
          await apiDelete(`/api/exercises/${exercise.id}`);
          await loadExercises();
        } catch (err) {
          setActionError(err instanceof Error ? err.message : "Failed to delete exercise.");
        }
      },
    });
  }

  // ── Fields modal ──────────────────────────────────────────────────────

  function openFields(exercise: Exercise) {
    setFieldsExercise(exercise);
    setNewFieldName("");
    setNewFieldUnit("");
    setFieldError("");
    setEditingField(null);
  }

  async function handleAddField(e: FormEvent) {
    e.preventDefault();
    if (!fieldsExercise) return;
    setFieldError("");
    if (!newFieldName.trim()) {
      setFieldError("Field name is required.");
      return;
    }
    setFieldLoading(true);
    try {
      await apiPost(`/api/exercises/${fieldsExercise.id}/fields`, {
        name: newFieldName.trim(),
        unit: newFieldUnit.trim() || null,
        display_order: fieldsExercise.fields.length,
      });
      setNewFieldName("");
      setNewFieldUnit("");
      await loadExercises();
      // Refresh the fields exercise reference
      const updated = await apiGet("/api/exercises");
      setExercises(updated);
      const updatedEx = (updated as Exercise[]).find((e) => e.id === fieldsExercise.id);
      if (updatedEx) setFieldsExercise(updatedEx);
    } catch (err) {
      setFieldError(err instanceof Error ? err.message : "Failed to add field.");
    } finally {
      setFieldLoading(false);
    }
  }

  async function handleDeleteField(field: ExerciseField) {
    if (!fieldsExercise) return;
    setFieldError("");
    try {
      await apiDelete(`/api/exercises/${fieldsExercise.id}/fields/${field.id}`);
      const updated = await apiGet("/api/exercises");
      setExercises(updated);
      const updatedEx = (updated as Exercise[]).find((e) => e.id === fieldsExercise.id);
      if (updatedEx) setFieldsExercise(updatedEx);
    } catch (err) {
      setFieldError(err instanceof Error ? err.message : "Failed to delete field.");
    }
  }

  async function handleSaveField(field: ExerciseField) {
    if (!fieldsExercise || !editingField) return;
    setFieldError("");
    if (!editingField.state.name.trim()) {
      setFieldError("Field name is required.");
      return;
    }
    setFieldLoading(true);
    try {
      await apiPut(`/api/exercises/${fieldsExercise.id}/fields/${field.id}`, {
        name: editingField.state.name.trim(),
        unit: editingField.state.unit.trim() || null,
        display_order: field.display_order,
      });
      setEditingField(null);
      const updated = await apiGet("/api/exercises");
      setExercises(updated);
      const updatedEx = (updated as Exercise[]).find((e) => e.id === fieldsExercise.id);
      if (updatedEx) setFieldsExercise(updatedEx);
    } catch (err) {
      setFieldError(err instanceof Error ? err.message : "Failed to update field.");
    } finally {
      setFieldLoading(false);
    }
  }

  // ── Group by category ────────────────────────────────────────────────

  const categories = Array.from(new Set(exercises.map((e) => e.category))).sort();

  return (
    <div className={styles.container}>
      <h2 className={styles.heading}>Exercise Library</h2>

      {loadError && <p className={styles.error}>{loadError}</p>}
      {actionError && <p className={styles.error}>{actionError}</p>}

      {exercises.length === 0 && !loadError && (
        <p className={styles.empty}>No exercises yet. Add one below.</p>
      )}

      {categories.map((category) => (
        <div key={category} className={styles.categorySection}>
          <h3 className={styles.categoryHeading}>{category}</h3>
          <div className={styles.list}>
            {exercises
              .filter((e) => e.category === category)
              .map((exercise) => (
                <div key={exercise.id} className={styles.exerciseRow}>
                  <div className={styles.exerciseInfo}>
                    <span className={styles.exerciseName}>{exercise.name}</span>
                    {exercise.default_sets_reps && (
                      <span className={styles.setsReps}>{exercise.default_sets_reps}</span>
                    )}
                    {exercise.fields.length > 0 && (
                      <span className={styles.fieldBadge}>
                        {exercise.fields.length} field{exercise.fields.length !== 1 ? "s" : ""}
                      </span>
                    )}
                  </div>
                  <div className={styles.rowActions}>
                    <button className={styles.btnSmall} onClick={() => openFields(exercise)}>
                      Fields
                    </button>
                    <button className={styles.btnSmall} onClick={() => openEdit(exercise)}>
                      Edit
                    </button>
                    <button
                      className={`${styles.btnSmall} ${styles.btnWarning}`}
                      onClick={() => handleArchive(exercise)}
                    >
                      Archive
                    </button>
                    <button
                      className={`${styles.btnSmall} ${styles.btnDanger}`}
                      onClick={() => handleDelete(exercise)}
                    >
                      Delete
                    </button>
                  </div>
                </div>
              ))}
          </div>
        </div>
      ))}

      {/* Add exercise form */}
      <div className={styles.addSection}>
        <h3 className={styles.addHeading}>Add Exercise</h3>
        <form onSubmit={handleAdd}>
          <div className={styles.formGrid}>
            <div className={styles.fieldGroup}>
              <label>Name</label>
              <input
                className={styles.input}
                value={addName}
                onChange={(e) => setAddName(e.target.value)}
                placeholder="e.g. Pull-ups"
                required
              />
            </div>
            <div className={styles.fieldGroup}>
              <label>Category</label>
              <input
                className={styles.input}
                value={addCategory}
                onChange={(e) => setAddCategory(e.target.value)}
                placeholder="e.g. strength"
                required
              />
            </div>
            <div className={styles.fieldGroup}>
              <label>Sets / Reps hint</label>
              <input
                className={styles.input}
                value={addSetsReps}
                onChange={(e) => setAddSetsReps(e.target.value)}
                placeholder="e.g. 3×10"
              />
            </div>
            <div className={`${styles.fieldGroup} ${styles.fieldGroupWide}`}>
              <label>Description</label>
              <input
                className={styles.input}
                value={addDescription}
                onChange={(e) => setAddDescription(e.target.value)}
                placeholder="Optional description"
              />
            </div>
          </div>
          {addError && <p className={styles.error}>{addError}</p>}
          <button className={styles.btnPrimary} type="submit" disabled={addLoading}>
            {addLoading ? "Adding…" : "Add Exercise"}
          </button>
        </form>
      </div>

      {/* Edit modal */}
      {editState && (
        <div className={styles.overlay}>
          <div className={styles.modal}>
            <h3 className={styles.modalHeading}>Edit Exercise</h3>
            <form onSubmit={handleEditSave}>
              <div className={styles.formGrid}>
                <div className={styles.fieldGroup}>
                  <label>Name</label>
                  <input
                    className={styles.input}
                    value={editState.name}
                    onChange={(e) => setEditState((s) => s && { ...s, name: e.target.value })}
                    required
                  />
                </div>
                <div className={styles.fieldGroup}>
                  <label>Category</label>
                  <input
                    className={styles.input}
                    value={editState.category}
                    onChange={(e) => setEditState((s) => s && { ...s, category: e.target.value })}
                    required
                  />
                </div>
                <div className={styles.fieldGroup}>
                  <label>Sets / Reps hint</label>
                  <input
                    className={styles.input}
                    value={editState.default_sets_reps}
                    onChange={(e) =>
                      setEditState((s) => s && { ...s, default_sets_reps: e.target.value })
                    }
                  />
                </div>
                <div className={`${styles.fieldGroup} ${styles.fieldGroupWide}`}>
                  <label>Description</label>
                  <input
                    className={styles.input}
                    value={editState.description}
                    onChange={(e) =>
                      setEditState((s) => s && { ...s, description: e.target.value })
                    }
                  />
                </div>
              </div>
              {editError && <p className={styles.error}>{editError}</p>}
              <div className={styles.modalActions}>
                <button
                  type="button"
                  className={styles.btnSecondary}
                  onClick={() => setEditState(null)}
                  disabled={editLoading}
                >
                  Cancel
                </button>
                <button type="submit" className={styles.btnPrimary} disabled={editLoading}>
                  {editLoading ? "Saving…" : "Save"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Fields modal */}
      {fieldsExercise && (
        <div className={styles.overlay}>
          <div className={`${styles.modal} ${styles.modalWide}`}>
            <h3 className={styles.modalHeading}>
              Fields — {fieldsExercise.name}
            </h3>

            {fieldsExercise.fields.length === 0 && (
              <p className={styles.empty}>No fields yet.</p>
            )}

            <div className={styles.fieldsList}>
              {fieldsExercise.fields.map((field) =>
                editingField?.id === field.id ? (
                  <div key={field.id} className={styles.fieldRow}>
                    <input
                      className={`${styles.input} ${styles.inputFlex}`}
                      value={editingField.state.name}
                      onChange={(e) =>
                        setEditingField((ef) =>
                          ef ? { ...ef, state: { ...ef.state, name: e.target.value } } : ef
                        )
                      }
                      placeholder="Field name"
                    />
                    <input
                      className={`${styles.input} ${styles.inputSmall}`}
                      value={editingField.state.unit}
                      onChange={(e) =>
                        setEditingField((ef) =>
                          ef ? { ...ef, state: { ...ef.state, unit: e.target.value } } : ef
                        )
                      }
                      placeholder="unit"
                    />
                    <div className={styles.rowActions}>
                      <button
                        className={styles.btnSmall}
                        onClick={() => handleSaveField(field)}
                        disabled={fieldLoading}
                      >
                        Save
                      </button>
                      <button
                        className={styles.btnSmall}
                        onClick={() => setEditingField(null)}
                        disabled={fieldLoading}
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                ) : (
                  <div key={field.id} className={styles.fieldRow}>
                    <span className={styles.fieldName}>{field.name}</span>
                    {field.unit && <span className={styles.fieldUnit}>{field.unit}</span>}
                    <div className={styles.rowActions}>
                      <button
                        className={styles.btnSmall}
                        onClick={() =>
                          setEditingField({
                            id: field.id,
                            state: { name: field.name, unit: field.unit ?? "" },
                          })
                        }
                      >
                        Edit
                      </button>
                      <button
                        className={`${styles.btnSmall} ${styles.btnDanger}`}
                        onClick={() => handleDeleteField(field)}
                      >
                        Remove
                      </button>
                    </div>
                  </div>
                )
              )}
            </div>

            {fieldError && <p className={styles.error}>{fieldError}</p>}

            <form onSubmit={handleAddField} className={styles.addFieldForm}>
              <div className={styles.formRow}>
                <input
                  className={`${styles.input} ${styles.inputFlex}`}
                  value={newFieldName}
                  onChange={(e) => setNewFieldName(e.target.value)}
                  placeholder="Field name (e.g. weight)"
                />
                <input
                  className={`${styles.input} ${styles.inputSmall}`}
                  value={newFieldUnit}
                  onChange={(e) => setNewFieldUnit(e.target.value)}
                  placeholder="unit"
                />
                <button className={styles.btnPrimary} type="submit" disabled={fieldLoading}>
                  {fieldLoading ? "Adding…" : "Add Field"}
                </button>
              </div>
            </form>

            <div className={styles.modalActions}>
              <button
                type="button"
                className={styles.btnSecondary}
                onClick={() => setFieldsExercise(null)}
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Confirmation dialog */}
      {confirmState && (
        <ConfirmDialog
          message={confirmState.message}
          onConfirm={confirmState.onConfirm}
          onCancel={() => setConfirmState(null)}
        />
      )}
    </div>
  );
}
