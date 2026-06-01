import { FormEvent, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { apiGet, apiPost, apiDelete, apiPatch } from "../api";
import styles from "./ClimbingSessions.module.css";
import ConfirmDialog from "../components/ConfirmDialog";

// ── Types ──────────────────────────────────────────────────────────────────

interface Grade {
  id: number;
  name: string;
  difficulty: number;
  color: string | null;
}

interface ClimbingEntry {
  id: number;
  climbing_session_id: number;
  grade_id: number;
  grade_name: string;
  grade_color: string | null;
  sends: number;
  attempts: number;
}

interface ClimbingSession {
  id: number;
  date: string;
  entries: ClimbingEntry[];
}

// ── Page ───────────────────────────────────────────────────────────────────

export default function ClimbingSessions() {
  const [sessions, setSessions] = useState<ClimbingSession[]>([]);
  const [grades, setGrades] = useState<Grade[]>([]);
  const [loadError, setLoadError] = useState("");

  // Expanded sessions set
  const [expandedIds, setExpandedIds] = useState<Set<number>>(new Set());

  // Add session form
  const today = new Date().toISOString().slice(0, 10);
  const [addDate, setAddDate] = useState(today);
  const [addLoading, setAddLoading] = useState(false);
  const [addError, setAddError] = useState("");

  // Edit session date state
  const [editDateSessionId, setEditDateSessionId] = useState<number | null>(null);
  const [editDateValue, setEditDateValue] = useState("");
  const [editDateLoading, setEditDateLoading] = useState(false);
  const [editDateError, setEditDateError] = useState("");

  // Add entry form (per session)
  const [addEntrySessionId, setAddEntrySessionId] = useState<number | null>(null);
  const [entryGradeId, setEntryGradeId] = useState("");
  const [entrySends, setEntrySends] = useState("0");
  const [entryAttempts, setEntryAttempts] = useState("0");
  const [entryLoading, setEntryLoading] = useState(false);
  const [entryError, setEntryError] = useState("");

  // Edit entry state
  const [editEntryId, setEditEntryId] = useState<number | null>(null);
  const [editEntrySessionId, setEditEntrySessionId] = useState<number | null>(null);
  const [editEntryGradeId, setEditEntryGradeId] = useState("");
  const [editEntrySends, setEditEntrySends] = useState("0");
  const [editEntryAttempts, setEditEntryAttempts] = useState("0");
  const [editEntryLoading, setEditEntryLoading] = useState(false);
  const [editEntryError, setEditEntryError] = useState("");

  // Action errors
  const [actionError, setActionError] = useState("");

  // Confirmation dialog state
  type ConfirmState = { message: string; onConfirm: () => void };
  const [confirmState, setConfirmState] = useState<ConfirmState | null>(null);

  async function loadAll() {
    try {
      const [sessData, gradeData] = await Promise.all([
        apiGet("/api/climbing-sessions"),
        apiGet("/api/grades"),
      ]);
      setSessions(sessData);
      setGrades(gradeData);
      setLoadError("");
    } catch {
      setLoadError("Failed to load data.");
    }
  }

  useEffect(() => {
    loadAll();
  }, []);

  // ── Toggle expand ─────────────────────────────────────────────────────

  function toggleExpand(id: number) {
    setExpandedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  }

  // ── Add session ───────────────────────────────────────────────────────

  async function handleAddSession(e: FormEvent) {
    e.preventDefault();
    setAddError("");
    if (!addDate) {
      setAddError("A date is required.");
      return;
    }
    // Prevent duplicate: check if a session already exists for this date
    if (sessions.some((s) => s.date === addDate)) {
      setAddError("A session already exists for this date. Please open the existing session.");
      return;
    }
    setAddLoading(true);
    try {
      const newSession: ClimbingSession = await apiPost("/api/climbing-sessions", { date: addDate });
      setSessions((prev) => [newSession, ...prev].sort((a, b) => b.date.localeCompare(a.date)));
      // Auto-expand new session
      setExpandedIds((prev) => new Set([...prev, newSession.id]));
    } catch (err) {
      setAddError(err instanceof Error ? err.message : "Failed to create session.");
    } finally {
      setAddLoading(false);
    }
  }

  // ── Edit session date ─────────────────────────────────────────────────

  function openEditDate(session: ClimbingSession) {
    setEditDateSessionId(session.id);
    setEditDateValue(session.date);
    setEditDateError("");
  }

  function closeEditDate() {
    setEditDateSessionId(null);
    setEditDateError("");
  }

  async function handleEditDate(e: FormEvent) {
    e.preventDefault();
    if (editDateSessionId === null) return;
    setEditDateError("");
    if (!editDateValue) {
      setEditDateError("A date is required.");
      return;
    }
    // Prevent duplicate: check if another session already exists for this date
    if (sessions.some((s) => s.date === editDateValue && s.id !== editDateSessionId)) {
      setEditDateError("A session already exists for this date.");
      return;
    }
    setEditDateLoading(true);
    try {
      const updated = await apiPatch(`/api/climbing-sessions/${editDateSessionId}`, { date: editDateValue });
      setSessions((prev) =>
        prev
          .map((s) => (s.id === editDateSessionId ? { ...s, date: updated.date } : s))
          .sort((a, b) => b.date.localeCompare(a.date))
      );
      closeEditDate();
    } catch (err) {
      setEditDateError(err instanceof Error ? err.message : "Failed to update date.");
    } finally {
      setEditDateLoading(false);
    }
  }

  // ── Delete session ────────────────────────────────────────────────────

  function handleDeleteSession(session: ClimbingSession) {
    setConfirmState({
      message: `Delete the climbing session for ${session.date}? This will also remove all its entries.`,
      onConfirm: async () => {
        setConfirmState(null);
        setActionError("");
        try {
          await apiDelete(`/api/climbing-sessions/${session.id}`);
          setSessions((prev) => prev.filter((s) => s.id !== session.id));
        } catch (err) {
          setActionError(err instanceof Error ? err.message : "Failed to delete session.");
        }
      },
    });
  }

  // ── Add entry ─────────────────────────────────────────────────────────

  function openAddEntry(sessionId: number) {
    setAddEntrySessionId(sessionId);
    setEntryGradeId(grades.length > 0 ? String(grades[0].id) : "");
    setEntrySends("0");
    setEntryAttempts("0");
    setEntryError("");
    // Close any open edit
    setEditEntryId(null);
    setEditEntrySessionId(null);
  }

  function closeAddEntry() {
    setAddEntrySessionId(null);
    setEntryError("");
  }

  async function handleAddEntry(e: FormEvent) {
    e.preventDefault();
    if (addEntrySessionId === null) return;
    setEntryError("");

    const gradeId = parseInt(entryGradeId, 10);
    const sends = parseInt(entrySends, 10);
    const attempts = parseInt(entryAttempts, 10);

    if (isNaN(gradeId) || isNaN(sends) || isNaN(attempts) || sends < 0 || attempts < 0) {
      setEntryError("Please fill in all fields with valid values.");
      return;
    }

    if (sends > attempts) {
      setEntryError("Sends cannot exceed attempts — you can't top more routes than you tried.");
      return;
    }

    setEntryLoading(true);
    try {
      const newEntry: ClimbingEntry = await apiPost(
        `/api/climbing-sessions/${addEntrySessionId}/entries`,
        { grade_id: gradeId, sends, attempts }
      );
      // Attach grade info from local state
      const grade = grades.find((g) => g.id === gradeId);
      const entryWithGrade: ClimbingEntry = {
        ...newEntry,
        grade_name: grade?.name ?? "",
        grade_color: grade?.color ?? null,
      };
      setSessions((prev) =>
        prev.map((s) =>
          s.id === addEntrySessionId
            ? { ...s, entries: [...s.entries, entryWithGrade] }
            : s
        )
      );
      closeAddEntry();
    } catch (err) {
      setEntryError(err instanceof Error ? err.message : "Failed to add entry.");
    } finally {
      setEntryLoading(false);
    }
  }

  // ── Edit entry ────────────────────────────────────────────────────────

  function openEditEntry(sessionId: number, entry: ClimbingEntry) {
    setEditEntryId(entry.id);
    setEditEntrySessionId(sessionId);
    setEditEntryGradeId(String(entry.grade_id));
    setEditEntrySends(String(entry.sends));
    setEditEntryAttempts(String(entry.attempts));
    setEditEntryError("");
    // Close add entry form if open
    setAddEntrySessionId(null);
  }

  function closeEditEntry() {
    setEditEntryId(null);
    setEditEntrySessionId(null);
    setEditEntryError("");
  }

  async function handleEditEntry(e: FormEvent) {
    e.preventDefault();
    if (editEntryId === null || editEntrySessionId === null) return;
    setEditEntryError("");

    const gradeId = parseInt(editEntryGradeId, 10);
    const sends = parseInt(editEntrySends, 10);
    const attempts = parseInt(editEntryAttempts, 10);

    if (isNaN(gradeId) || isNaN(sends) || isNaN(attempts) || sends < 0 || attempts < 0) {
      setEditEntryError("Please fill in all fields with valid values.");
      return;
    }

    if (sends > attempts) {
      setEditEntryError("Sends cannot exceed attempts — you can't top more routes than you tried.");
      return;
    }

    setEditEntryLoading(true);
    try {
      await apiPatch(
        `/api/climbing-sessions/${editEntrySessionId}/entries/${editEntryId}`,
        { grade_id: gradeId, sends, attempts }
      );
      // Attach grade info from local state
      const grade = grades.find((g) => g.id === gradeId);
      setSessions((prev) =>
        prev.map((s) =>
          s.id === editEntrySessionId
            ? {
                ...s,
                entries: s.entries.map((en) =>
                  en.id === editEntryId
                    ? {
                        ...en,
                        grade_id: gradeId,
                        grade_name: grade?.name ?? en.grade_name,
                        grade_color: grade?.color ?? null,
                        sends,
                        attempts,
                      }
                    : en
                ),
              }
            : s
        )
      );
      closeEditEntry();
    } catch (err) {
      setEditEntryError(err instanceof Error ? err.message : "Failed to update entry.");
    } finally {
      setEditEntryLoading(false);
    }
  }

  // ── Delete entry ──────────────────────────────────────────────────────

  function handleDeleteEntry(sessionId: number, entryId: number) {
    setConfirmState({
      message: "Remove this climbing entry?",
      onConfirm: async () => {
        setConfirmState(null);
        setActionError("");
        try {
          await apiDelete(`/api/climbing-sessions/${sessionId}/entries/${entryId}`);
          setSessions((prev) =>
            prev.map((s) =>
              s.id === sessionId
                ? { ...s, entries: s.entries.filter((e) => e.id !== entryId) }
                : s
            )
          );
        } catch (err) {
          setActionError(err instanceof Error ? err.message : "Failed to delete entry.");
        }
      },
    });
  }

  // ── Render ────────────────────────────────────────────────────────────

  return (
    <div className={styles.container}>
      <h2 className={styles.heading}>Climbing Sessions</h2>

      {loadError && <p className={styles.error}>{loadError}</p>}

      {/* Add session form */}
      <div className={styles.addSection}>
        <h3 className={styles.addHeading}>Log a Session</h3>
        <form onSubmit={handleAddSession}>
          <div className={styles.formRow}>
            <div className={styles.fieldGroup}>
              <label htmlFor="session-date">Date</label>
              <input
                id="session-date"
                className={styles.input}
                type="date"
                value={addDate}
                onChange={(e) => setAddDate(e.target.value)}
                required
              />
            </div>
            <button className={styles.btnPrimary} type="submit" disabled={addLoading}>
              {addLoading ? "Adding…" : "Add Session"}
            </button>
          </div>
          {addError && <p className={styles.error}>{addError}</p>}
        </form>
      </div>

      {actionError && <p className={styles.error}>{actionError}</p>}

      {/* Sessions list */}
      <div className={styles.list}>
        {sessions.length === 0 && !loadError && (
          <p className={styles.empty}>No sessions yet. Log one above.</p>
        )}
        {sessions.map((session) => {
          const isExpanded = expandedIds.has(session.id);
          const isEditingDate = editDateSessionId === session.id;
          const hasNoEntries = session.entries.length === 0;
          return (
            <div
              key={session.id}
              className={`${styles.sessionCard} ${hasNoEntries ? styles.sessionCardEmpty : ""}`}
            >
              <div className={styles.sessionHeader}>
                {isEditingDate ? (
                  <form className={styles.editDateForm} onSubmit={handleEditDate}>
                    <div className={styles.formRow}>
                      <div className={styles.fieldGroup}>
                        <label htmlFor={`edit-date-${session.id}`}>Date</label>
                        <input
                          id={`edit-date-${session.id}`}
                          className={styles.input}
                          type="date"
                          value={editDateValue}
                          onChange={(e) => setEditDateValue(e.target.value)}
                          autoFocus
                          required
                        />
                      </div>
                      <button
                        className={styles.btnPrimary}
                        type="submit"
                        disabled={editDateLoading}
                      >
                        {editDateLoading ? "Saving…" : "Save"}
                      </button>
                      <button
                        type="button"
                        className={styles.btnSecondary}
                        onClick={closeEditDate}
                        disabled={editDateLoading}
                      >
                        Cancel
                      </button>
                    </div>
                    {editDateError && <p className={styles.error}>{editDateError}</p>}
                  </form>
                ) : (
                  <button
                    className={styles.expandBtn}
                    onClick={() => toggleExpand(session.id)}
                    aria-expanded={isExpanded}
                  >
                    <span className={styles.expandIcon}>{isExpanded ? "▾" : "▸"}</span>
                    <span className={styles.sessionDate}>{session.date}</span>
                    <span className={styles.entryCount}>
                      {session.entries.length} {session.entries.length === 1 ? "entry" : "entries"}
                    </span>
                    {hasNoEntries && (
                      <span className={styles.emptyWarning} title="No entries — add some climbs">
                        No entries
                      </span>
                    )}
                  </button>
                )}
                {!isEditingDate && (
                  <div className={styles.sessionActions}>
                    <button
                      className={styles.btnSmall}
                      onClick={() => openEditDate(session)}
                      title="Edit date"
                    >
                      Edit date
                    </button>
                    <button
                      className={styles.btnSmall}
                      onClick={() => {
                        if (!isExpanded) toggleExpand(session.id);
                        openAddEntry(session.id);
                      }}
                    >
                      + Entry
                    </button>
                    <button
                      className={`${styles.btnSmall} ${styles.btnDanger}`}
                      onClick={() => handleDeleteSession(session)}
                    >
                      Delete
                    </button>
                  </div>
                )}
              </div>

              {isExpanded && (
                <div className={styles.sessionBody}>
                  {session.entries.length === 0 && (
                    <p className={styles.emptyEntries}>
                      No entries yet. Use "+ Entry" to log your climbs.
                    </p>
                  )}
                  {session.entries.map((entry) => (
                    <div key={entry.id} className={styles.entryRow}>
                      {editEntryId === entry.id ? (
                        <form className={styles.editEntryForm} onSubmit={handleEditEntry}>
                          <div className={styles.formRow}>
                            <div className={styles.fieldGroup}>
                              <label htmlFor={`edit-grade-${entry.id}`}>Grade</label>
                              <select
                                id={`edit-grade-${entry.id}`}
                                className={styles.input}
                                value={editEntryGradeId}
                                onChange={(e) => setEditEntryGradeId(e.target.value)}
                              >
                                {grades.map((g) => (
                                  <option key={g.id} value={g.id}>
                                    {g.name}
                                  </option>
                                ))}
                              </select>
                            </div>
                            <div className={styles.fieldGroup}>
                              <label htmlFor={`edit-sends-${entry.id}`}>Sends</label>
                              <input
                                id={`edit-sends-${entry.id}`}
                                className={`${styles.input} ${styles.inputSmall}`}
                                type="number"
                                min={0}
                                value={editEntrySends}
                                onChange={(e) => setEditEntrySends(e.target.value)}
                              />
                            </div>
                            <div className={styles.fieldGroup}>
                              <label htmlFor={`edit-attempts-${entry.id}`}>Attempts</label>
                              <input
                                id={`edit-attempts-${entry.id}`}
                                className={`${styles.input} ${styles.inputSmall}`}
                                type="number"
                                min={0}
                                value={editEntryAttempts}
                                onChange={(e) => setEditEntryAttempts(e.target.value)}
                              />
                            </div>
                            <button
                              className={styles.btnPrimary}
                              type="submit"
                              disabled={editEntryLoading}
                            >
                              {editEntryLoading ? "Saving…" : "Save"}
                            </button>
                            <button
                              type="button"
                              className={styles.btnSecondary}
                              onClick={closeEditEntry}
                              disabled={editEntryLoading}
                            >
                              Cancel
                            </button>
                          </div>
                          {editEntryError && <p className={styles.error}>{editEntryError}</p>}
                        </form>
                      ) : (
                        <>
                          <span
                            className={styles.gradeSwatch}
                            style={{
                              background: entry.grade_color ?? "var(--border)",
                            }}
                            title={entry.grade_name}
                          />
                          <span className={styles.gradeName}>{entry.grade_name}</span>
                          <span className={styles.entryStats}>
                            {entry.sends} send{entry.sends !== 1 ? "s" : ""} / {entry.attempts} attempt{entry.attempts !== 1 ? "s" : ""}
                          </span>
                          <button
                            className={styles.btnSmall}
                            onClick={() => openEditEntry(session.id, entry)}
                          >
                            Edit
                          </button>
                          <button
                            className={`${styles.btnSmall} ${styles.btnDanger}`}
                            onClick={() => handleDeleteEntry(session.id, entry.id)}
                          >
                            Remove
                          </button>
                        </>
                      )}
                    </div>
                  ))}

                  {/* Inline add-entry form for this session */}
                  {addEntrySessionId === session.id && (
                    <form className={styles.addEntryForm} onSubmit={handleAddEntry}>
                      <div className={styles.formRow}>
                        <div className={styles.fieldGroup}>
                          <label htmlFor={`grade-${session.id}`}>Grade</label>
                          <select
                            id={`grade-${session.id}`}
                            className={styles.input}
                            value={entryGradeId}
                            onChange={(e) => setEntryGradeId(e.target.value)}
                            onMouseDown={(e) => e.stopPropagation()}
                          >
                            {grades.map((g) => (
                              <option key={g.id} value={g.id}>
                                {g.name}
                              </option>
                            ))}
                          </select>
                        </div>
                        <div className={styles.fieldGroup}>
                          <label htmlFor={`sends-${session.id}`}>Sends</label>
                          <input
                            id={`sends-${session.id}`}
                            className={`${styles.input} ${styles.inputSmall}`}
                            type="number"
                            min={0}
                            value={entrySends}
                            onChange={(e) => setEntrySends(e.target.value)}
                          />
                        </div>
                        <div className={styles.fieldGroup}>
                          <label htmlFor={`attempts-${session.id}`}>Attempts</label>
                          <input
                            id={`attempts-${session.id}`}
                            className={`${styles.input} ${styles.inputSmall}`}
                            type="number"
                            min={0}
                            value={entryAttempts}
                            onChange={(e) => setEntryAttempts(e.target.value)}
                          />
                        </div>
                        <button
                          className={styles.btnPrimary}
                          type="submit"
                          disabled={entryLoading || grades.length === 0}
                        >
                          {entryLoading ? "Adding…" : "Add"}
                        </button>
                        <button
                          type="button"
                          className={styles.btnSecondary}
                          onClick={closeAddEntry}
                          disabled={entryLoading}
                        >
                          Cancel
                        </button>
                      </div>
                      {entryError && <p className={styles.error}>{entryError}</p>}
                      {grades.length === 0 && (
                        <p className={styles.error}>
                          No grades configured.{" "}
                          <Link to="/settings/grades">Add grades in Settings first.</Link>
                        </p>
                      )}
                    </form>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>
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
