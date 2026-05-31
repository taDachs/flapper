import { Router } from "express";
import pool from "../db/pool.js";

const router = Router();

// GET /api/dashboard — summary data for the dashboard landing page
//
// Returns:
//   active_plan: { id, name } | null
//   today_session: { id, date, completed_count, total_count } | null
//   recent_climbing: { id, date, top_grade_name, top_grade_difficulty } | null
router.get("/", async (req, res) => {
  const userId = req.session.userId!;
  const today = new Date().toISOString().slice(0, 10);

  // ── Active week plan ───────────────────────────────────────────────────────
  const { rows: planRows } = await pool.query<{ id: number; name: string }>(
    "SELECT id, name FROM week_templates WHERE user_id = $1 AND is_active = TRUE LIMIT 1",
    [userId]
  );
  const active_plan = planRows.length > 0 ? planRows[0] : null;

  // ── Today's training session ───────────────────────────────────────────────
  // We read-only here: do NOT create a session if it doesn't exist.
  const { rows: sessionRows } = await pool.query<{
    id: number;
    date: string;
    completed_count: string;
    total_count: string;
  }>(
    `SELECT ts.id,
            ts.date::text AS date,
            COUNT(tse.id) FILTER (WHERE tse.completed = TRUE) AS completed_count,
            COUNT(tse.id) AS total_count
     FROM training_sessions ts
     LEFT JOIN training_session_exercises tse ON tse.session_id = ts.id
     WHERE ts.user_id = $1 AND ts.date = $2
     GROUP BY ts.id, ts.date`,
    [userId, today]
  );
  const today_session =
    sessionRows.length > 0
      ? {
          id: sessionRows[0].id,
          date: sessionRows[0].date,
          completed_count: parseInt(sessionRows[0].completed_count, 10),
          total_count: parseInt(sessionRows[0].total_count, 10),
        }
      : null;

  // ── Most recent climbing session ───────────────────────────────────────────
  const { rows: climbingRows } = await pool.query<{
    id: number;
    date: string;
    top_grade_name: string | null;
    top_grade_difficulty: number | null;
  }>(
    `SELECT cs.id,
            cs.date::text AS date,
            g.name AS top_grade_name,
            g.difficulty AS top_grade_difficulty
     FROM climbing_sessions cs
     LEFT JOIN climbing_session_entries cse ON cse.climbing_session_id = cs.id
     LEFT JOIN grades g ON g.id = cse.grade_id
     WHERE cs.user_id = $1
     ORDER BY cs.date DESC, cs.id DESC, g.difficulty DESC NULLS LAST
     LIMIT 1`,
    [userId]
  );
  const recent_climbing =
    climbingRows.length > 0
      ? {
          id: climbingRows[0].id,
          date: climbingRows[0].date,
          top_grade_name: climbingRows[0].top_grade_name,
          top_grade_difficulty: climbingRows[0].top_grade_difficulty,
        }
      : null;

  res.json({ active_plan, today_session, recent_climbing });
});

export default router;
