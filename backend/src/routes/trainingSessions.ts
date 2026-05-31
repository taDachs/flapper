import { Router } from "express";
import { z } from "zod";
import pool from "../db/pool.js";

const router = Router();

// ── Schemas ────────────────────────────────────────────────────────────────

const dateParamSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "date must be YYYY-MM-DD");

const addExerciseSchema = z.object({
  exercise_id: z.number().int().positive(),
});

const patchSessionExerciseSchema = z
  .object({
    completed: z.boolean().optional(),
    field_values: z
      .array(
        z.object({
          field_id: z.number().int().positive(),
          value: z.number(),
        })
      )
      .optional(),
  })
  .refine((d) => d.completed !== undefined || d.field_values !== undefined, {
    message: "At least one of completed or field_values must be provided",
  });

// ── Helpers ────────────────────────────────────────────────────────────────

interface SessionExerciseRow {
  id: number;
  session_id: number;
  exercise_id: number;
  completed: boolean;
  sets_reps_note: string | null;
}

interface FieldValueRow {
  id: number;
  session_exercise_id: number;
  field_id: number;
  value: string; // NUMERIC comes back as string from pg
}

async function fetchSessionWithExercises(sessionId: number) {
  const { rows: seRows } = await pool.query<SessionExerciseRow>(
    `SELECT id, session_id, exercise_id, completed, sets_reps_note
     FROM training_session_exercises
     WHERE session_id = $1
     ORDER BY id ASC`,
    [sessionId]
  );

  if (seRows.length === 0) {
    return seRows.map((se) => ({
      id: se.id,
      exercise_id: se.exercise_id,
      completed: se.completed,
      sets_reps_note: se.sets_reps_note,
      field_values: [] as Array<{ id: number; field_id: number; value: string }>,
    }));
  }

  const seIds = seRows.map((se) => se.id);
  const { rows: fvRows } = await pool.query<FieldValueRow>(
    `SELECT id, session_exercise_id, field_id, value::text AS value
     FROM training_session_field_values
     WHERE session_exercise_id = ANY($1)
     ORDER BY id ASC`,
    [seIds]
  );

  const fvBySeId = new Map<number, typeof fvRows>();
  for (const fv of fvRows) {
    if (!fvBySeId.has(fv.session_exercise_id)) fvBySeId.set(fv.session_exercise_id, []);
    fvBySeId.get(fv.session_exercise_id)!.push(fv);
  }

  return seRows.map((se) => ({
    id: se.id,
    exercise_id: se.exercise_id,
    completed: se.completed,
    sets_reps_note: se.sets_reps_note,
    field_values: (fvBySeId.get(se.id) ?? []).map((fv) => ({
      id: fv.id,
      field_id: fv.field_id,
      value: fv.value,
    })),
  }));
}

// Compute the ISO weekday (0=Sun … 6=Sat) from a YYYY-MM-DD string
function weekdayFromDate(dateStr: string): number {
  // Parse as UTC to avoid local-timezone shifts
  const [year, month, day] = dateStr.split("-").map(Number);
  const d = new Date(Date.UTC(year, month - 1, day));
  return d.getUTCDay(); // 0=Sun, 6=Sat
}

// ── GET /api/training-sessions — history list ──────────────────────────────

router.get("/", async (req, res) => {
  const userId = req.session.userId!;

  const { rows } = await pool.query<{
    id: number;
    date: string;
    completed_count: string;
    total_count: string;
  }>(
    `SELECT ts.id,
            ts.date::text AS date,
            COUNT(tse.id) FILTER (WHERE tse.completed = TRUE)  AS completed_count,
            COUNT(tse.id)                                       AS total_count
     FROM training_sessions ts
     LEFT JOIN training_session_exercises tse ON tse.session_id = ts.id
     WHERE ts.user_id = $1
     GROUP BY ts.id, ts.date
     ORDER BY ts.date DESC, ts.id DESC`,
    [userId]
  );

  res.json(
    rows.map((r) => ({
      id: r.id,
      date: r.date,
      completed_count: parseInt(r.completed_count, 10),
      total_count: parseInt(r.total_count, 10),
    }))
  );
});

// ── GET /api/training-sessions/for-date/:date — get-or-create session ─────

router.get("/for-date/:date", async (req, res) => {
  const dateResult = dateParamSchema.safeParse(req.params.date);
  if (!dateResult.success) {
    res.status(400).json({ error: "Invalid date format. Use YYYY-MM-DD." });
    return;
  }

  const date = dateResult.data;
  const userId = req.session.userId!;
  const weekday = weekdayFromDate(date);

  // Find or create training session for this date
  let sessionId: number;
  const { rows: existing } = await pool.query<{ id: number }>(
    "SELECT id FROM training_sessions WHERE user_id = $1 AND date = $2",
    [userId, date]
  );

  let needsSeed = false;
  if (existing.length > 0) {
    sessionId = existing[0].id;
    // If the session already exists but has no exercises, re-seed from the
    // active template. This handles the case where the session was created
    // before a template was activated.
    const { rows: exerciseCount } = await pool.query<{ count: string }>(
      "SELECT COUNT(*) AS count FROM training_session_exercises WHERE session_id = $1",
      [sessionId]
    );
    if (parseInt(exerciseCount[0].count, 10) === 0) {
      needsSeed = true;
    }
  } else {
    // Create the session
    const { rows: created } = await pool.query<{ id: number }>(
      "INSERT INTO training_sessions (user_id, date, weekday) VALUES ($1, $2, $3) RETURNING id",
      [userId, date, weekday]
    );
    sessionId = created[0].id;
    needsSeed = true;
  }

  if (needsSeed) {
    // Pre-populate from active template for this weekday
    const { rows: templateDays } = await pool.query<{
      day_id: number;
      exercise_id: number;
      sets_reps_override: string | null;
    }>(
      `SELECT wtde.day_id, wtde.exercise_id, wtde.sets_reps_override
       FROM week_template_day_exercises wtde
       JOIN week_template_days wtd ON wtd.id = wtde.day_id
       JOIN week_templates wt ON wt.id = wtd.template_id
       WHERE wt.user_id = $1
         AND wt.is_active = TRUE
         AND wtd.weekday = $2
       ORDER BY wtde.display_order ASC, wtde.id ASC`,
      [userId, weekday]
    );

    for (const tde of templateDays) {
      await pool.query(
        `INSERT INTO training_session_exercises (session_id, exercise_id, sets_reps_note)
         VALUES ($1, $2, $3)`,
        [sessionId, tde.exercise_id, tde.sets_reps_override ?? null]
      );
    }
  }

  const exercises = await fetchSessionWithExercises(sessionId);

  res.json({ id: sessionId, date, weekday, exercises });
});

// ── POST /api/training-sessions/:sessionId/exercises — add extra exercise ──

router.post("/:sessionId/exercises", async (req, res) => {
  const sessionId = parseInt(req.params.sessionId, 10);
  if (isNaN(sessionId)) {
    res.status(400).json({ error: "Invalid session id" });
    return;
  }

  const result = addExerciseSchema.safeParse(req.body);
  if (!result.success) {
    res.status(400).json({ error: "Invalid request", details: result.error.flatten() });
    return;
  }

  const userId = req.session.userId!;

  // Verify session ownership
  const { rows: sessRows } = await pool.query<{ id: number }>(
    "SELECT id FROM training_sessions WHERE id = $1 AND user_id = $2",
    [sessionId, userId]
  );
  if (sessRows.length === 0) {
    res.status(404).json({ error: "Training session not found" });
    return;
  }

  const { exercise_id } = result.data;

  // Verify exercise belongs to user and is not archived
  const { rows: exRows } = await pool.query<{ id: number }>(
    "SELECT id FROM exercises WHERE id = $1 AND user_id = $2 AND archived_at IS NULL",
    [exercise_id, userId]
  );
  if (exRows.length === 0) {
    res.status(404).json({ error: "Exercise not found" });
    return;
  }

  const { rows } = await pool.query<{ id: number }>(
    `INSERT INTO training_session_exercises (session_id, exercise_id, completed)
     VALUES ($1, $2, FALSE)
     RETURNING id`,
    [sessionId, exercise_id]
  );

  res.status(201).json({
    id: rows[0].id,
    session_id: sessionId,
    exercise_id,
    completed: false,
    sets_reps_note: null,
    field_values: [],
  });
});

// ── PATCH /api/training-sessions/:sessionId/exercises/:seId — auto-save ───

router.patch("/:sessionId/exercises/:seId", async (req, res) => {
  const sessionId = parseInt(req.params.sessionId, 10);
  const seId = parseInt(req.params.seId, 10);
  if (isNaN(sessionId) || isNaN(seId)) {
    res.status(400).json({ error: "Invalid id" });
    return;
  }

  const result = patchSessionExerciseSchema.safeParse(req.body);
  if (!result.success) {
    res.status(400).json({ error: "Invalid request", details: result.error.flatten() });
    return;
  }

  const userId = req.session.userId!;

  // Verify session ownership
  const { rows: sessRows } = await pool.query<{ id: number }>(
    "SELECT id FROM training_sessions WHERE id = $1 AND user_id = $2",
    [sessionId, userId]
  );
  if (sessRows.length === 0) {
    res.status(404).json({ error: "Training session not found" });
    return;
  }

  // Verify session exercise belongs to this session
  const { rows: seRows } = await pool.query<SessionExerciseRow>(
    "SELECT id, session_id, exercise_id, completed, sets_reps_note FROM training_session_exercises WHERE id = $1 AND session_id = $2",
    [seId, sessionId]
  );
  if (seRows.length === 0) {
    res.status(404).json({ error: "Session exercise not found" });
    return;
  }

  const se = seRows[0];
  const { completed, field_values } = result.data;

  // Update completed if provided
  if (completed !== undefined) {
    await pool.query(
      "UPDATE training_session_exercises SET completed = $1 WHERE id = $2",
      [completed, seId]
    );
  }

  // Upsert field values if provided
  if (field_values && field_values.length > 0) {
    for (const fv of field_values) {
      await pool.query(
        `INSERT INTO training_session_field_values (session_exercise_id, field_id, value)
         VALUES ($1, $2, $3)
         ON CONFLICT (session_exercise_id, field_id)
         DO UPDATE SET value = EXCLUDED.value`,
        [seId, fv.field_id, fv.value]
      );
    }
  }

  // Return updated state
  const updatedCompleted = completed !== undefined ? completed : se.completed;
  const { rows: fvRows } = await pool.query<FieldValueRow>(
    `SELECT id, session_exercise_id, field_id, value::text AS value
     FROM training_session_field_values
     WHERE session_exercise_id = $1
     ORDER BY id ASC`,
    [seId]
  );

  res.json({
    id: seId,
    session_id: sessionId,
    exercise_id: se.exercise_id,
    completed: updatedCompleted,
    sets_reps_note: se.sets_reps_note,
    field_values: fvRows.map((fv) => ({
      id: fv.id,
      field_id: fv.field_id,
      value: fv.value,
    })),
  });
});

export default router;
