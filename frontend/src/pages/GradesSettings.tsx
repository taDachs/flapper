import { FormEvent, useEffect, useState } from "react";
import { apiGet, apiPost, apiPut, apiDelete } from "../api";
import styles from "./GradesSettings.module.css";
import ConfirmDialog from "../components/ConfirmDialog";

// French boulder (Font) scale — difficulty is sequential 1-based integer
const FRENCH_BOULDER_PRESET = [
  "3","4","5","5+","6A","6A+","6B","6B+","6C","6C+",
  "7A","7A+","7B","7B+","7C","7C+","8A","8A+","8B","8B+","8C","8C+",
];

interface Grade {
  id: number;
  name: string;
  difficulty: number;
  color: string | null;
}

interface EditState {
  grade: Grade;
  name: string;
  difficulty: string;
  color: string;
}

export default function GradesSettings() {
  const [grades, setGrades] = useState<Grade[]>([]);
  const [loadError, setLoadError] = useState("");

  // Add form state
  const [addName, setAddName] = useState("");
  const [addDifficulty, setAddDifficulty] = useState("");
  const [addColor, setAddColor] = useState("#ffffff");
  const [addError, setAddError] = useState("");
  const [addLoading, setAddLoading] = useState(false);

  // Edit modal state
  const [editState, setEditState] = useState<EditState | null>(null);
  const [editError, setEditError] = useState("");
  const [editLoading, setEditLoading] = useState(false);

  // Delete error
  const [deleteError, setDeleteError] = useState("");

  // Preset loading state
  const [presetLoading, setPresetLoading] = useState(false);
  const [presetError, setPresetError] = useState("");
  const [showPresetConfirm, setShowPresetConfirm] = useState(false);

  async function loadGrades() {
    try {
      const data = await apiGet("/api/grades");
      setGrades(data);
      setLoadError("");
    } catch {
      setLoadError("Failed to load grades.");
    }
  }

  useEffect(() => {
    loadGrades();
  }, []);

  async function handleAdd(e: FormEvent) {
    e.preventDefault();
    setAddError("");
    const difficulty = parseInt(addDifficulty, 10);
    if (!addName.trim() || isNaN(difficulty) || difficulty < 1) {
      setAddError("Name and a valid difficulty (≥ 1) are required.");
      return;
    }
    setAddLoading(true);
    try {
      await apiPost("/api/grades", {
        name: addName.trim(),
        difficulty,
        color: addColor || null,
      });
      setAddName("");
      setAddDifficulty("");
      setAddColor("#ffffff");
      await loadGrades();
    } catch (err) {
      setAddError(err instanceof Error ? err.message : "Failed to create grade.");
    } finally {
      setAddLoading(false);
    }
  }

  function openEdit(grade: Grade) {
    setEditState({
      grade,
      name: grade.name,
      difficulty: String(grade.difficulty),
      color: grade.color ?? "#ffffff",
    });
    setEditError("");
  }

  async function handleEditSave(e: FormEvent) {
    e.preventDefault();
    if (!editState) return;
    setEditError("");
    const difficulty = parseInt(editState.difficulty, 10);
    if (!editState.name.trim() || isNaN(difficulty) || difficulty < 1) {
      setEditError("Name and a valid difficulty (≥ 1) are required.");
      return;
    }
    setEditLoading(true);
    try {
      await apiPut(`/api/grades/${editState.grade.id}`, {
        name: editState.name.trim(),
        difficulty,
        color: editState.color || null,
      });
      setEditState(null);
      await loadGrades();
    } catch (err) {
      setEditError(err instanceof Error ? err.message : "Failed to update grade.");
    } finally {
      setEditLoading(false);
    }
  }

  function handleLoadPreset() {
    if (grades.length > 0) {
      setShowPresetConfirm(true);
    } else {
      doLoadPreset();
    }
  }

  async function doLoadPreset() {
    setShowPresetConfirm(false);
    setPresetLoading(true);
    setPresetError("");
    try {
      for (let i = 0; i < FRENCH_BOULDER_PRESET.length; i++) {
        await apiPost("/api/grades", {
          name: FRENCH_BOULDER_PRESET[i],
          difficulty: i + 1,
          color: null,
        });
      }
      await loadGrades();
    } catch (err) {
      setPresetError(err instanceof Error ? err.message : "Failed to load preset.");
    } finally {
      setPresetLoading(false);
    }
  }

  async function handleDelete(grade: Grade) {
    setDeleteError("");
    try {
      await apiDelete(`/api/grades/${grade.id}`);
      await loadGrades();
    } catch (err) {
      setDeleteError(err instanceof Error ? err.message : "Failed to delete grade.");
    }
  }

  return (
    <div className={styles.container}>
      <h2 className={styles.heading}>Grade Settings</h2>

      {loadError && <p className={styles.error}>{loadError}</p>}

      <div className={styles.list}>
        {grades.length === 0 && !loadError && (
          <p className={styles.empty}>No grades yet. Add one below.</p>
        )}
        {grades.map((g) => (
          <div key={g.id} className={styles.gradeRow}>
            <span
              className={styles.colorSwatch}
              style={{ background: g.color ?? "transparent" }}
            />
            <span className={styles.gradeName}>{g.name}</span>
            <span className={styles.gradeDifficulty}>{g.difficulty}</span>
            <div className={styles.rowActions}>
              <button className={styles.btnSmall} onClick={() => openEdit(g)}>
                Edit
              </button>
              <button
                className={`${styles.btnSmall} ${styles.btnDanger}`}
                onClick={() => handleDelete(g)}
              >
                Delete
              </button>
            </div>
          </div>
        ))}
      </div>

      {deleteError && <p className={styles.error}>{deleteError}</p>}

      <div className={styles.presetSection}>
        <button
          className={styles.btnSecondary}
          onClick={handleLoadPreset}
          disabled={presetLoading}
        >
          {presetLoading ? "Loading…" : "Load French boulder grades"}
        </button>
        {presetError && <p className={styles.error}>{presetError}</p>}
      </div>

      <div className={styles.addSection}>
        <h3 className={styles.addHeading}>Add Grade</h3>
        <form onSubmit={handleAdd}>
          <div className={styles.formRow}>
            <div className={styles.fieldGroup}>
              <label>Name</label>
              <input
                className={styles.input}
                value={addName}
                onChange={(e) => setAddName(e.target.value)}
                placeholder="e.g. blau"
                required
              />
            </div>
            <div className={styles.fieldGroup}>
              <label>Difficulty</label>
              <input
                className={`${styles.input} ${styles.inputSmall}`}
                type="number"
                min={1}
                value={addDifficulty}
                onChange={(e) => setAddDifficulty(e.target.value)}
                placeholder="1"
                required
              />
              <span className={styles.helperText}>
                A higher number = harder grade. Used for ordering and progress charts.
              </span>
            </div>
            <div className={styles.fieldGroup}>
              <label>Color</label>
              <input
                className={`${styles.input} ${styles.inputColor}`}
                type="color"
                value={addColor}
                onChange={(e) => setAddColor(e.target.value)}
              />
            </div>
            <button className={styles.btnPrimary} type="submit" disabled={addLoading}>
              {addLoading ? "Adding…" : "Add Grade"}
            </button>
          </div>
          {addError && <p className={styles.error}>{addError}</p>}
        </form>
      </div>

      {/* Preset confirmation dialog */}
      {showPresetConfirm && (
        <ConfirmDialog
          message="Grades already exist. Loading the preset will add the French boulder grades on top of your current grades. Continue?"
          onConfirm={doLoadPreset}
          onCancel={() => setShowPresetConfirm(false)}
          confirmLabel="Load preset"
        />
      )}

      {/* Edit modal */}
      {editState && (
        <div className={styles.overlay}>
          <div className={styles.modal}>
            <h3 className={styles.modalHeading}>Edit Grade</h3>
            <form onSubmit={handleEditSave}>
              <div className={styles.formRow}>
                <div className={styles.fieldGroup}>
                  <label>Name</label>
                  <input
                    className={styles.input}
                    value={editState.name}
                    onChange={(e) =>
                      setEditState((s) => s && { ...s, name: e.target.value })
                    }
                    required
                  />
                </div>
                <div className={styles.fieldGroup}>
                  <label>Difficulty</label>
                  <input
                    className={`${styles.input} ${styles.inputSmall}`}
                    type="number"
                    min={1}
                    value={editState.difficulty}
                    onChange={(e) =>
                      setEditState((s) => s && { ...s, difficulty: e.target.value })
                    }
                    required
                  />
                </div>
                <div className={styles.fieldGroup}>
                  <label>Color</label>
                  <input
                    className={`${styles.input} ${styles.inputColor}`}
                    type="color"
                    value={editState.color}
                    onChange={(e) =>
                      setEditState((s) => s && { ...s, color: e.target.value })
                    }
                  />
                </div>
              </div>
              {editError && <p className={styles.error}>{editError}</p>}
              <div className={styles.modalActions} style={{ marginTop: "1rem" }}>
                <button
                  type="button"
                  className={styles.btnSecondary}
                  onClick={() => setEditState(null)}
                  disabled={editLoading}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className={styles.btnPrimary}
                  disabled={editLoading}
                >
                  {editLoading ? "Saving…" : "Save"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
