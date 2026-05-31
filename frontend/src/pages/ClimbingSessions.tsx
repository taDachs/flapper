import { FormEvent, useEffect, useState } from "react";
import { apiGet, apiPost, apiDelete } from "../api";
import styles from "./ClimbingSessions.module.css";

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

  // Add entry form (per session)
  const [addEntrySessionId, setAddEntrySessionId] = useState<number | null>(null);
  const [entryGradeId, setEntryGradeId] = useState("");
  const [entrySends, setEntrySends] = useState("0");
  const [entryAttempts, setEntryAttempts] = useState("0");
  const [entryLoading, setEntryLoading] = useState(false);
  const [entryError, setEntryError] = useState("");

  // Action errors
  const [actionError, setActionError] = useState("");

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

  // ── Delete session ────────────────────────────────────────────────────

  async function handleDeleteSession(session: ClimbingSession) {
    setActionError("");
    try {
      await apiDelete(`/api/climbing-sessions/${session.id}`);
      setSessions((prev) => prev.filter((s) => s.id !== session.id));
    } catch (err) {
      setActionError(err instanceof Error ? err.message : "Failed to delete session.");
    }
  }

  // ── Add entry ─────────────────────────────────────────────────────────

  function openAddEntry(sessionId: number) {
    setAddEntrySessionId(sessionId);
    setEntryGradeId(grades.length > 0 ? String(grades[0].id) : "");
    setEntrySends("0");
    setEntryAttempts("0");
    setEntryError("");
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

  // ── Delete entry ──────────────────────────────────────────────────────

  async function handleDeleteEntry(sessionId: number, entryId: number) {
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
          return (
            <div key={session.id} className={styles.sessionCard}>
              <div className={styles.sessionHeader}>
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
                </button>
                <div className={styles.sessionActions}>
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
              </div>

              {isExpanded && (
                <div className={styles.sessionBody}>
                  {session.entries.length === 0 && (
                    <p className={styles.emptyEntries}>No entries yet.</p>
                  )}
                  {session.entries.map((entry) => (
                    <div key={entry.id} className={styles.entryRow}>
                      <span
                        className={styles.gradeSwatch}
                        style={{ background: entry.grade_color ?? "transparent" }}
                        title={entry.grade_name}
                      />
                      <span className={styles.gradeName}>{entry.grade_name}</span>
                      <span className={styles.entryStats}>
                        {entry.sends} send{entry.sends !== 1 ? "s" : ""} / {entry.attempts} attempt{entry.attempts !== 1 ? "s" : ""}
                      </span>
                      <button
                        className={`${styles.btnSmall} ${styles.btnDanger}`}
                        onClick={() => handleDeleteEntry(session.id, entry.id)}
                      >
                        Remove
                      </button>
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
                        <p className={styles.error}>No grades configured. Add grades in Settings first.</p>
                      )}
                    </form>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
