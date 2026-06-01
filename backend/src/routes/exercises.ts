import { Router } from "express";
import { z } from "zod";
import pool from "../db/pool.js";

const router = Router();

// ── Schemas ────────────────────────────────────────────────────────────────

const exerciseBodySchema = z.object({
  name: z.string().min(1),
  category: z.string().min(1),
  description: z.string().optional().nullable(),
  default_sets_reps: z.string().optional().nullable(),
});

const fieldBodySchema = z.object({
  name: z.string().min(1),
  unit: z.string().optional().nullable(),
  display_order: z.number().int().min(0).optional(),
});

// ── Exercise Progress ──────────────────────────────────────────────────────

// GET /api/exercises/progress — time-series data for every exercise field that
// has at least one logged value, grouped by exercise.
//
// Response shape:
// [
//   {
//     exercise_id: number,
//     exercise_name: string,
//     fields: [
//       {
//         field_id: number,
//         field_name: string,
//         unit: string | null,
//         data_points: [{ date: string, value: string }]  // sorted asc by date
//       }
//     ]
//   }
// ]
router.get("/progress", async (req, res) => {
  const userId = req.session.userId!;

  // Fetch all logged field values for this user's exercises, joined with
  // session date and field/exercise metadata.
  const { rows } = await pool.query<{
    exercise_id: number;
    exercise_name: string;
    field_id: number;
    field_name: string;
    unit: string | null;
    date: string;
    value: string;
  }>(
    `SELECT
       e.id            AS exercise_id,
       e.name          AS exercise_name,
       ef.id           AS field_id,
       ef.name         AS field_name,
       ef.unit         AS unit,
       ts.date::text   AS date,
       tsfv.value::text AS value
     FROM training_session_field_values tsfv
     JOIN exercise_fields ef ON ef.id = tsfv.field_id
     JOIN exercises e ON e.id = ef.exercise_id
     JOIN training_session_exercises tse ON tse.id = tsfv.session_exercise_id
     JOIN training_sessions ts ON ts.id = tse.session_id
     WHERE e.user_id = $1
     ORDER BY e.id ASC, ef.id ASC, ts.date ASC, ts.id ASC`,
    [userId]
  );

  if (rows.length === 0) {
    res.json([]);
    return;
  }

  // Group: exercise_id -> field_id -> data_points[]
  const exerciseMap = new Map<
    number,
    {
      exercise_id: number;
      exercise_name: string;
      fieldMap: Map<
        number,
        {
          field_id: number;
          field_name: string;
          unit: string | null;
          data_points: Array<{ date: string; value: string }>;
        }
      >;
    }
  >();

  for (const row of rows) {
    if (!exerciseMap.has(row.exercise_id)) {
      exerciseMap.set(row.exercise_id, {
        exercise_id: row.exercise_id,
        exercise_name: row.exercise_name,
        fieldMap: new Map(),
      });
    }
    const ex = exerciseMap.get(row.exercise_id)!;

    if (!ex.fieldMap.has(row.field_id)) {
      ex.fieldMap.set(row.field_id, {
        field_id: row.field_id,
        field_name: row.field_name,
        unit: row.unit,
        data_points: [],
      });
    }
    ex.fieldMap.get(row.field_id)!.data_points.push({
      date: row.date,
      value: row.value,
    });
  }

  const result = Array.from(exerciseMap.values()).map((ex) => ({
    exercise_id: ex.exercise_id,
    exercise_name: ex.exercise_name,
    fields: Array.from(ex.fieldMap.values()),
  }));

  res.json(result);
});

// ── Exercise CRUD ──────────────────────────────────────────────────────────

// GET /api/exercises — list exercises with their fields
// Query param: includeArchived=true to include archived exercises
router.get("/", async (req, res) => {
  const userId = req.session.userId!;
  const includeArchived = req.query.includeArchived === "true";

  const { rows: exercises } = await pool.query<{
    id: number;
    name: string;
    category: string;
    description: string | null;
    default_sets_reps: string | null;
    archived_at: string | null;
    created_at: string;
  }>(
    includeArchived
      ? `SELECT id, name, category, description, default_sets_reps, archived_at, created_at
         FROM exercises
         WHERE user_id = $1
         ORDER BY category ASC, name ASC`
      : `SELECT id, name, category, description, default_sets_reps, archived_at, created_at
         FROM exercises
         WHERE user_id = $1 AND archived_at IS NULL
         ORDER BY category ASC, name ASC`,
    [userId]
  );

  if (exercises.length === 0) {
    res.json([]);
    return;
  }

  const exerciseIds = exercises.map((e) => e.id);
  const { rows: fields } = await pool.query<{
    id: number;
    exercise_id: number;
    name: string;
    unit: string | null;
    display_order: number;
  }>(
    `SELECT id, exercise_id, name, unit, display_order
     FROM exercise_fields
     WHERE exercise_id = ANY($1)
     ORDER BY display_order ASC, id ASC`,
    [exerciseIds]
  );

  const fieldsByExercise = new Map<number, typeof fields>();
  for (const field of fields) {
    if (!fieldsByExercise.has(field.exercise_id)) {
      fieldsByExercise.set(field.exercise_id, []);
    }
    fieldsByExercise.get(field.exercise_id)!.push(field);
  }

  const result = exercises.map((e) => ({
    ...e,
    fields: (fieldsByExercise.get(e.id) ?? []).map((f) => ({
      id: f.id,
      name: f.name,
      unit: f.unit,
      display_order: f.display_order,
    })),
  }));

  res.json(result);
});

// POST /api/exercises — create a new exercise
router.post("/", async (req, res) => {
  const result = exerciseBodySchema.safeParse(req.body);
  if (!result.success) {
    res.status(400).json({ error: "Invalid request", details: result.error.flatten() });
    return;
  }

  const userId = req.session.userId!;
  const { name, description, default_sets_reps } = result.data;
  const category = result.data.category.toLowerCase();

  const { rows } = await pool.query<{ id: number; created_at: string }>(
    `INSERT INTO exercises (user_id, name, category, description, default_sets_reps)
     VALUES ($1, $2, $3, $4, $5)
     RETURNING id, created_at`,
    [userId, name, category, description ?? null, default_sets_reps ?? null]
  );

  res.status(201).json({
    id: rows[0].id,
    name,
    category,
    description: description ?? null,
    default_sets_reps: default_sets_reps ?? null,
    archived_at: null,
    created_at: rows[0].created_at,
    fields: [],
  });
});

// PUT /api/exercises/:id — update exercise metadata
router.put("/:id", async (req, res) => {
  const id = parseInt(req.params.id, 10);
  if (isNaN(id)) {
    res.status(400).json({ error: "Invalid id" });
    return;
  }

  const result = exerciseBodySchema.safeParse(req.body);
  if (!result.success) {
    res.status(400).json({ error: "Invalid request", details: result.error.flatten() });
    return;
  }

  const userId = req.session.userId!;
  const { name, description, default_sets_reps } = result.data;
  const category = result.data.category.toLowerCase();

  const { rowCount } = await pool.query(
    `UPDATE exercises
     SET name = $1, category = $2, description = $3, default_sets_reps = $4
     WHERE id = $5 AND user_id = $6`,
    [name, category, description ?? null, default_sets_reps ?? null, id, userId]
  );

  if (rowCount === 0) {
    res.status(404).json({ error: "Exercise not found" });
    return;
  }

  res.json({ id, name, category, description: description ?? null, default_sets_reps: default_sets_reps ?? null });
});

// POST /api/exercises/:id/archive — archive an exercise (soft delete)
router.post("/:id/archive", async (req, res) => {
  const id = parseInt(req.params.id, 10);
  if (isNaN(id)) {
    res.status(400).json({ error: "Invalid id" });
    return;
  }

  const userId = req.session.userId!;

  const { rowCount } = await pool.query(
    `UPDATE exercises SET archived_at = NOW()
     WHERE id = $1 AND user_id = $2 AND archived_at IS NULL`,
    [id, userId]
  );

  if (rowCount === 0) {
    res.status(404).json({ error: "Exercise not found or already archived" });
    return;
  }

  res.json({ ok: true });
});

// POST /api/exercises/:id/unarchive — restore an archived exercise
router.post("/:id/unarchive", async (req, res) => {
  const id = parseInt(req.params.id, 10);
  if (isNaN(id)) {
    res.status(400).json({ error: "Invalid id" });
    return;
  }

  const userId = req.session.userId!;

  const { rowCount } = await pool.query(
    `UPDATE exercises SET archived_at = NULL
     WHERE id = $1 AND user_id = $2 AND archived_at IS NOT NULL`,
    [id, userId]
  );

  if (rowCount === 0) {
    res.status(404).json({ error: "Exercise not found or not archived" });
    return;
  }

  res.json({ ok: true });
});

// DELETE /api/exercises/:id — hard-delete (blocked if log entries exist)
router.delete("/:id", async (req, res) => {
  const id = parseInt(req.params.id, 10);
  if (isNaN(id)) {
    res.status(400).json({ error: "Invalid id" });
    return;
  }

  const userId = req.session.userId!;

  // Check ownership
  const { rows: ownerRows } = await pool.query<{ id: number }>(
    "SELECT id FROM exercises WHERE id = $1 AND user_id = $2",
    [id, userId]
  );
  if (ownerRows.length === 0) {
    res.status(404).json({ error: "Exercise not found" });
    return;
  }

  // Check for training session log entries
  const { rows: logRows } = await pool.query<{ count: string }>(
    `SELECT COUNT(*) AS count FROM training_session_exercises WHERE exercise_id = $1`,
    [id]
  );
  if (parseInt(logRows[0].count, 10) > 0) {
    res.status(409).json({
      error: "Cannot delete an exercise that has log entries. Archive it instead.",
    });
    return;
  }

  await pool.query("DELETE FROM exercises WHERE id = $1 AND user_id = $2", [id, userId]);
  res.json({ ok: true });
});

// ── Exercise Fields ────────────────────────────────────────────────────────

// POST /api/exercises/:id/fields — add a field
router.post("/:id/fields", async (req, res) => {
  const exerciseId = parseInt(req.params.id, 10);
  if (isNaN(exerciseId)) {
    res.status(400).json({ error: "Invalid exercise id" });
    return;
  }

  const userId = req.session.userId!;

  // Verify ownership
  const { rows: ownerRows } = await pool.query<{ id: number }>(
    "SELECT id FROM exercises WHERE id = $1 AND user_id = $2",
    [exerciseId, userId]
  );
  if (ownerRows.length === 0) {
    res.status(404).json({ error: "Exercise not found" });
    return;
  }

  const result = fieldBodySchema.safeParse(req.body);
  if (!result.success) {
    res.status(400).json({ error: "Invalid request", details: result.error.flatten() });
    return;
  }

  const { name, unit, display_order } = result.data;

  const { rows } = await pool.query<{ id: number }>(
    `INSERT INTO exercise_fields (exercise_id, name, unit, display_order)
     VALUES ($1, $2, $3, $4)
     RETURNING id`,
    [exerciseId, name, unit ?? null, display_order ?? 0]
  );

  res.status(201).json({
    id: rows[0].id,
    exercise_id: exerciseId,
    name,
    unit: unit ?? null,
    display_order: display_order ?? 0,
  });
});

// PUT /api/exercises/:id/fields/:fieldId — update a field
router.put("/:id/fields/:fieldId", async (req, res) => {
  const exerciseId = parseInt(req.params.id, 10);
  const fieldId = parseInt(req.params.fieldId, 10);
  if (isNaN(exerciseId) || isNaN(fieldId)) {
    res.status(400).json({ error: "Invalid id" });
    return;
  }

  const userId = req.session.userId!;

  // Verify ownership via exercise
  const { rows: ownerRows } = await pool.query<{ id: number }>(
    "SELECT id FROM exercises WHERE id = $1 AND user_id = $2",
    [exerciseId, userId]
  );
  if (ownerRows.length === 0) {
    res.status(404).json({ error: "Exercise not found" });
    return;
  }

  const result = fieldBodySchema.safeParse(req.body);
  if (!result.success) {
    res.status(400).json({ error: "Invalid request", details: result.error.flatten() });
    return;
  }

  const { name, unit, display_order } = result.data;

  const { rowCount } = await pool.query(
    `UPDATE exercise_fields SET name = $1, unit = $2, display_order = $3
     WHERE id = $4 AND exercise_id = $5`,
    [name, unit ?? null, display_order ?? 0, fieldId, exerciseId]
  );

  if (rowCount === 0) {
    res.status(404).json({ error: "Field not found" });
    return;
  }

  res.json({ id: fieldId, exercise_id: exerciseId, name, unit: unit ?? null, display_order: display_order ?? 0 });
});

// DELETE /api/exercises/:id/fields/:fieldId — remove a field
router.delete("/:id/fields/:fieldId", async (req, res) => {
  const exerciseId = parseInt(req.params.id, 10);
  const fieldId = parseInt(req.params.fieldId, 10);
  if (isNaN(exerciseId) || isNaN(fieldId)) {
    res.status(400).json({ error: "Invalid id" });
    return;
  }

  const userId = req.session.userId!;

  // Verify ownership via exercise
  const { rows: ownerRows } = await pool.query<{ id: number }>(
    "SELECT id FROM exercises WHERE id = $1 AND user_id = $2",
    [exerciseId, userId]
  );
  if (ownerRows.length === 0) {
    res.status(404).json({ error: "Exercise not found" });
    return;
  }

  const { rowCount } = await pool.query(
    "DELETE FROM exercise_fields WHERE id = $1 AND exercise_id = $2",
    [fieldId, exerciseId]
  );

  if (rowCount === 0) {
    res.status(404).json({ error: "Field not found" });
    return;
  }

  res.json({ ok: true });
});

export default router;
