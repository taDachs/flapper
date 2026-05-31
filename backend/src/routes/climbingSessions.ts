import { Router } from "express";
import { z } from "zod";
import pool from "../db/pool.js";

const router = Router();

// ── Schemas ────────────────────────────────────────────────────────────────

const sessionBodySchema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "date must be in YYYY-MM-DD format"),
});

const entryBodySchema = z.object({
  grade_id: z.number().int().positive(),
  sends: z.number().int().min(0),
  attempts: z.number().int().min(0),
});

// ── Sessions CRUD ──────────────────────────────────────────────────────────

// GET /api/climbing-sessions — list all sessions with entries, reverse-chronological
router.get("/", async (req, res) => {
  const userId = req.session.userId!;

  const { rows: sessions } = await pool.query<{
    id: number;
    date: string;
  }>(
    `SELECT id, date::text AS date
     FROM climbing_sessions
     WHERE user_id = $1
     ORDER BY date DESC, id DESC`,
    [userId]
  );

  if (sessions.length === 0) {
    res.json([]);
    return;
  }

  const sessionIds = sessions.map((s) => s.id);
  const { rows: entries } = await pool.query<{
    id: number;
    climbing_session_id: number;
    grade_id: number;
    grade_name: string;
    grade_color: string | null;
    sends: number;
    attempts: number;
  }>(
    `SELECT cse.id, cse.climbing_session_id, cse.grade_id,
            g.name AS grade_name, g.color AS grade_color,
            cse.sends, cse.attempts
     FROM climbing_session_entries cse
     JOIN grades g ON g.id = cse.grade_id
     WHERE cse.climbing_session_id = ANY($1)
     ORDER BY cse.id ASC`,
    [sessionIds]
  );

  const entriesBySession = new Map<number, typeof entries>();
  for (const entry of entries) {
    if (!entriesBySession.has(entry.climbing_session_id)) {
      entriesBySession.set(entry.climbing_session_id, []);
    }
    entriesBySession.get(entry.climbing_session_id)!.push(entry);
  }

  const result = sessions.map((s) => ({
    id: s.id,
    date: s.date,
    entries: (entriesBySession.get(s.id) ?? []).map((e) => ({
      id: e.id,
      climbing_session_id: e.climbing_session_id,
      grade_id: e.grade_id,
      grade_name: e.grade_name,
      grade_color: e.grade_color,
      sends: e.sends,
      attempts: e.attempts,
    })),
  }));

  res.json(result);
});

// POST /api/climbing-sessions — create a new session
router.post("/", async (req, res) => {
  const result = sessionBodySchema.safeParse(req.body);
  if (!result.success) {
    res.status(400).json({ error: "Invalid request", details: result.error.flatten() });
    return;
  }

  const userId = req.session.userId!;
  const { date } = result.data;

  const { rows } = await pool.query<{ id: number }>(
    `INSERT INTO climbing_sessions (user_id, date) VALUES ($1, $2) RETURNING id`,
    [userId, date]
  );

  res.status(201).json({ id: rows[0].id, date, entries: [] });
});

// DELETE /api/climbing-sessions/:id — delete a session (cascades to entries)
router.delete("/:id", async (req, res) => {
  const id = parseInt(req.params.id, 10);
  if (isNaN(id)) {
    res.status(400).json({ error: "Invalid id" });
    return;
  }

  const userId = req.session.userId!;

  const { rowCount } = await pool.query(
    "DELETE FROM climbing_sessions WHERE id = $1 AND user_id = $2",
    [id, userId]
  );

  if (rowCount === 0) {
    res.status(404).json({ error: "Climbing session not found" });
    return;
  }

  res.json({ ok: true });
});

// ── Entries CRUD ───────────────────────────────────────────────────────────

// POST /api/climbing-sessions/:id/entries — add an entry to a session
router.post("/:id/entries", async (req, res) => {
  const sessionId = parseInt(req.params.id, 10);
  if (isNaN(sessionId)) {
    res.status(400).json({ error: "Invalid session id" });
    return;
  }

  const userId = req.session.userId!;

  // Verify ownership
  const { rows: ownerRows } = await pool.query<{ id: number }>(
    "SELECT id FROM climbing_sessions WHERE id = $1 AND user_id = $2",
    [sessionId, userId]
  );
  if (ownerRows.length === 0) {
    res.status(404).json({ error: "Climbing session not found" });
    return;
  }

  const result = entryBodySchema.safeParse(req.body);
  if (!result.success) {
    res.status(400).json({ error: "Invalid request", details: result.error.flatten() });
    return;
  }

  const { grade_id, sends, attempts } = result.data;

  // Verify grade belongs to this user
  const { rows: gradeRows } = await pool.query<{ id: number }>(
    "SELECT id FROM grades WHERE id = $1 AND user_id = $2",
    [grade_id, userId]
  );
  if (gradeRows.length === 0) {
    res.status(404).json({ error: "Grade not found" });
    return;
  }

  const { rows } = await pool.query<{ id: number }>(
    `INSERT INTO climbing_session_entries (climbing_session_id, grade_id, sends, attempts)
     VALUES ($1, $2, $3, $4)
     RETURNING id`,
    [sessionId, grade_id, sends, attempts]
  );

  res.status(201).json({
    id: rows[0].id,
    climbing_session_id: sessionId,
    grade_id,
    sends,
    attempts,
  });
});

// DELETE /api/climbing-sessions/:sessionId/entries/:entryId — delete an entry
router.delete("/:sessionId/entries/:entryId", async (req, res) => {
  const sessionId = parseInt(req.params.sessionId, 10);
  const entryId = parseInt(req.params.entryId, 10);
  if (isNaN(sessionId) || isNaN(entryId)) {
    res.status(400).json({ error: "Invalid id" });
    return;
  }

  const userId = req.session.userId!;

  // Verify session ownership
  const { rows: ownerRows } = await pool.query<{ id: number }>(
    "SELECT id FROM climbing_sessions WHERE id = $1 AND user_id = $2",
    [sessionId, userId]
  );
  if (ownerRows.length === 0) {
    res.status(404).json({ error: "Climbing session not found" });
    return;
  }

  const { rowCount } = await pool.query(
    "DELETE FROM climbing_session_entries WHERE id = $1 AND climbing_session_id = $2",
    [entryId, sessionId]
  );

  if (rowCount === 0) {
    res.status(404).json({ error: "Entry not found" });
    return;
  }

  res.json({ ok: true });
});

export default router;
