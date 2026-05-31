import { Router } from "express";
import { z } from "zod";
import pool from "../db/pool.js";

const router = Router();

// ── Schemas ────────────────────────────────────────────────────────────────

const templateBodySchema = z.object({
  name: z.string().min(1),
});

const daySchema = z.object({
  weekday: z.number().int().min(0).max(6),
  includes_climbing: z.boolean().optional().default(false),
  exercises: z
    .array(
      z.object({
        exercise_id: z.number().int().positive(),
        sets_reps_override: z.string().optional().nullable(),
        display_order: z.number().int().min(0).optional().default(0),
      })
    )
    .optional()
    .default([]),
});

const templateWithDaysSchema = templateBodySchema.extend({
  days: z.array(daySchema).optional().default([]),
});

// ── Helpers ────────────────────────────────────────────────────────────────

interface TemplateDay {
  id: number;
  weekday: number;
  includes_climbing: boolean;
}

interface TemplateDayExercise {
  id: number;
  day_id: number;
  exercise_id: number;
  sets_reps_override: string | null;
  display_order: number;
}

interface TemplateRow {
  id: number;
  name: string;
  is_active: boolean;
}

async function fetchTemplateWithDays(templateId: number, userId: number) {
  const { rows: templates } = await pool.query<TemplateRow>(
    "SELECT id, name, is_active FROM week_templates WHERE id = $1 AND user_id = $2",
    [templateId, userId]
  );
  if (templates.length === 0) return null;

  const { rows: days } = await pool.query<TemplateDay>(
    "SELECT id, weekday, includes_climbing FROM week_template_days WHERE template_id = $1 ORDER BY weekday ASC",
    [templateId]
  );

  if (days.length === 0) {
    return { ...templates[0], days: [] };
  }

  const dayIds = days.map((d) => d.id);
  const { rows: dayExercises } = await pool.query<TemplateDayExercise>(
    `SELECT id, day_id, exercise_id, sets_reps_override, display_order
     FROM week_template_day_exercises
     WHERE day_id = ANY($1)
     ORDER BY display_order ASC, id ASC`,
    [dayIds]
  );

  const exercisesByDay = new Map<number, TemplateDayExercise[]>();
  for (const ex of dayExercises) {
    if (!exercisesByDay.has(ex.day_id)) exercisesByDay.set(ex.day_id, []);
    exercisesByDay.get(ex.day_id)!.push(ex);
  }

  return {
    ...templates[0],
    days: days.map((d) => ({
      id: d.id,
      weekday: d.weekday,
      includes_climbing: d.includes_climbing,
      exercises: (exercisesByDay.get(d.id) ?? []).map((e) => ({
        id: e.id,
        exercise_id: e.exercise_id,
        sets_reps_override: e.sets_reps_override,
        display_order: e.display_order,
      })),
    })),
  };
}

// ── Template CRUD ──────────────────────────────────────────────────────────

// GET /api/week-templates — list all templates
router.get("/", async (req, res) => {
  const userId = req.session.userId!;
  const { rows } = await pool.query<TemplateRow>(
    "SELECT id, name, is_active FROM week_templates WHERE user_id = $1 ORDER BY id ASC",
    [userId]
  );
  res.json(rows);
});

// POST /api/week-templates — create a new template
router.post("/", async (req, res) => {
  const result = templateBodySchema.safeParse(req.body);
  if (!result.success) {
    res.status(400).json({ error: "Invalid request", details: result.error.flatten() });
    return;
  }

  const userId = req.session.userId!;
  const { name } = result.data;

  const { rows } = await pool.query<{ id: number }>(
    "INSERT INTO week_templates (user_id, name, is_active) VALUES ($1, $2, FALSE) RETURNING id",
    [userId, name]
  );

  res.status(201).json({ id: rows[0].id, name, is_active: false, days: [] });
});

// GET /api/week-templates/:id — get a single template with days and exercises
router.get("/:id", async (req, res) => {
  const id = parseInt(req.params.id, 10);
  if (isNaN(id)) {
    res.status(400).json({ error: "Invalid id" });
    return;
  }

  const userId = req.session.userId!;
  const template = await fetchTemplateWithDays(id, userId);
  if (!template) {
    res.status(404).json({ error: "Template not found" });
    return;
  }

  res.json(template);
});

// PUT /api/week-templates/:id — update template name
router.put("/:id", async (req, res) => {
  const id = parseInt(req.params.id, 10);
  if (isNaN(id)) {
    res.status(400).json({ error: "Invalid id" });
    return;
  }

  const result = templateBodySchema.safeParse(req.body);
  if (!result.success) {
    res.status(400).json({ error: "Invalid request", details: result.error.flatten() });
    return;
  }

  const userId = req.session.userId!;
  const { name } = result.data;

  const { rowCount } = await pool.query(
    "UPDATE week_templates SET name = $1 WHERE id = $2 AND user_id = $3",
    [name, id, userId]
  );

  if (rowCount === 0) {
    res.status(404).json({ error: "Template not found" });
    return;
  }

  res.json({ id, name });
});

// DELETE /api/week-templates/:id — delete a template
router.delete("/:id", async (req, res) => {
  const id = parseInt(req.params.id, 10);
  if (isNaN(id)) {
    res.status(400).json({ error: "Invalid id" });
    return;
  }

  const userId = req.session.userId!;

  const { rowCount } = await pool.query(
    "DELETE FROM week_templates WHERE id = $1 AND user_id = $2",
    [id, userId]
  );

  if (rowCount === 0) {
    res.status(404).json({ error: "Template not found" });
    return;
  }

  res.json({ ok: true });
});

// POST /api/week-templates/:id/activate — activate a template (deactivates all others)
router.post("/:id/activate", async (req, res) => {
  const id = parseInt(req.params.id, 10);
  if (isNaN(id)) {
    res.status(400).json({ error: "Invalid id" });
    return;
  }

  const userId = req.session.userId!;

  // Check the template exists and belongs to the user
  const { rows: ownerRows } = await pool.query<{ id: number }>(
    "SELECT id FROM week_templates WHERE id = $1 AND user_id = $2",
    [id, userId]
  );
  if (ownerRows.length === 0) {
    res.status(404).json({ error: "Template not found" });
    return;
  }

  // Deactivate all templates for this user, then activate the chosen one
  await pool.query("UPDATE week_templates SET is_active = FALSE WHERE user_id = $1", [userId]);
  await pool.query("UPDATE week_templates SET is_active = TRUE WHERE id = $1", [id]);

  res.json({ ok: true });
});

// ── Day management ─────────────────────────────────────────────────────────

// PUT /api/week-templates/:id/days/:weekday — upsert a day (set includes_climbing)
router.put("/:id/days/:weekday", async (req, res) => {
  const templateId = parseInt(req.params.id, 10);
  const weekday = parseInt(req.params.weekday, 10);

  if (isNaN(templateId) || isNaN(weekday) || weekday < 0 || weekday > 6) {
    res.status(400).json({ error: "Invalid template id or weekday" });
    return;
  }

  const dayUpdateSchema = z.object({
    includes_climbing: z.boolean(),
  });

  const result = dayUpdateSchema.safeParse(req.body);
  if (!result.success) {
    res.status(400).json({ error: "Invalid request", details: result.error.flatten() });
    return;
  }

  const userId = req.session.userId!;

  // Verify template ownership
  const { rows: ownerRows } = await pool.query<{ id: number }>(
    "SELECT id FROM week_templates WHERE id = $1 AND user_id = $2",
    [templateId, userId]
  );
  if (ownerRows.length === 0) {
    res.status(404).json({ error: "Template not found" });
    return;
  }

  const { includes_climbing } = result.data;

  const { rows } = await pool.query<{ id: number }>(
    `INSERT INTO week_template_days (template_id, weekday, includes_climbing)
     VALUES ($1, $2, $3)
     ON CONFLICT (template_id, weekday)
     DO UPDATE SET includes_climbing = EXCLUDED.includes_climbing
     RETURNING id`,
    [templateId, weekday, includes_climbing]
  );

  res.json({ id: rows[0].id, template_id: templateId, weekday, includes_climbing });
});

// POST /api/week-templates/:id/days/:weekday/exercises — add an exercise to a day
router.post("/:id/days/:weekday/exercises", async (req, res) => {
  const templateId = parseInt(req.params.id, 10);
  const weekday = parseInt(req.params.weekday, 10);

  if (isNaN(templateId) || isNaN(weekday) || weekday < 0 || weekday > 6) {
    res.status(400).json({ error: "Invalid template id or weekday" });
    return;
  }

  const addExerciseSchema = z.object({
    exercise_id: z.number().int().positive(),
    sets_reps_override: z.string().optional().nullable(),
    display_order: z.number().int().min(0).optional(),
  });

  const result = addExerciseSchema.safeParse(req.body);
  if (!result.success) {
    res.status(400).json({ error: "Invalid request", details: result.error.flatten() });
    return;
  }

  const userId = req.session.userId!;

  // Verify template ownership
  const { rows: ownerRows } = await pool.query<{ id: number }>(
    "SELECT id FROM week_templates WHERE id = $1 AND user_id = $2",
    [templateId, userId]
  );
  if (ownerRows.length === 0) {
    res.status(404).json({ error: "Template not found" });
    return;
  }

  // Verify exercise belongs to the user
  const { rows: exRows } = await pool.query<{ id: number }>(
    "SELECT id FROM exercises WHERE id = $1 AND user_id = $2 AND archived_at IS NULL",
    [result.data.exercise_id, userId]
  );
  if (exRows.length === 0) {
    res.status(404).json({ error: "Exercise not found" });
    return;
  }

  // Upsert the day first
  const { rows: dayRows } = await pool.query<{ id: number }>(
    `INSERT INTO week_template_days (template_id, weekday, includes_climbing)
     VALUES ($1, $2, FALSE)
     ON CONFLICT (template_id, weekday)
     DO UPDATE SET weekday = EXCLUDED.weekday
     RETURNING id`,
    [templateId, weekday]
  );
  const dayId = dayRows[0].id;

  const { exercise_id, sets_reps_override, display_order } = result.data;

  // Get current max display_order if not provided
  let order = display_order;
  if (order === undefined) {
    const { rows: orderRows } = await pool.query<{ max: number | null }>(
      "SELECT MAX(display_order) AS max FROM week_template_day_exercises WHERE day_id = $1",
      [dayId]
    );
    order = (orderRows[0].max ?? -1) + 1;
  }

  const { rows } = await pool.query<{ id: number }>(
    `INSERT INTO week_template_day_exercises (day_id, exercise_id, sets_reps_override, display_order)
     VALUES ($1, $2, $3, $4)
     RETURNING id`,
    [dayId, exercise_id, sets_reps_override ?? null, order]
  );

  res.status(201).json({
    id: rows[0].id,
    day_id: dayId,
    exercise_id,
    sets_reps_override: sets_reps_override ?? null,
    display_order: order,
  });
});

// PUT /api/week-templates/:id/days/:weekday/exercises/:assignmentId — update an exercise assignment
router.put("/:id/days/:weekday/exercises/:assignmentId", async (req, res) => {
  const templateId = parseInt(req.params.id, 10);
  const weekday = parseInt(req.params.weekday, 10);
  const assignmentId = parseInt(req.params.assignmentId, 10);

  if (isNaN(templateId) || isNaN(weekday) || weekday < 0 || weekday > 6 || isNaN(assignmentId)) {
    res.status(400).json({ error: "Invalid parameters" });
    return;
  }

  const updateExerciseSchema = z.object({
    sets_reps_override: z.string().optional().nullable(),
    display_order: z.number().int().min(0).optional(),
  });

  const result = updateExerciseSchema.safeParse(req.body);
  if (!result.success) {
    res.status(400).json({ error: "Invalid request", details: result.error.flatten() });
    return;
  }

  const userId = req.session.userId!;

  // Verify template ownership
  const { rows: ownerRows } = await pool.query<{ id: number }>(
    "SELECT id FROM week_templates WHERE id = $1 AND user_id = $2",
    [templateId, userId]
  );
  if (ownerRows.length === 0) {
    res.status(404).json({ error: "Template not found" });
    return;
  }

  // Verify assignment exists and belongs to the correct day/template
  const { rows: assignRows } = await pool.query<{
    id: number;
    sets_reps_override: string | null;
    display_order: number;
  }>(
    `SELECT wtde.id, wtde.sets_reps_override, wtde.display_order
     FROM week_template_day_exercises wtde
     JOIN week_template_days wtd ON wtd.id = wtde.day_id
     WHERE wtde.id = $1 AND wtd.template_id = $2 AND wtd.weekday = $3`,
    [assignmentId, templateId, weekday]
  );
  if (assignRows.length === 0) {
    res.status(404).json({ error: "Assignment not found" });
    return;
  }

  const { sets_reps_override, display_order } = result.data;

  const newOverride =
    sets_reps_override !== undefined ? sets_reps_override : assignRows[0].sets_reps_override;
  const newOrder =
    display_order !== undefined ? display_order : assignRows[0].display_order;

  await pool.query(
    "UPDATE week_template_day_exercises SET sets_reps_override = $1, display_order = $2 WHERE id = $3",
    [newOverride, newOrder, assignmentId]
  );

  res.json({
    id: assignmentId,
    sets_reps_override: newOverride,
    display_order: newOrder,
  });
});

// DELETE /api/week-templates/:id/days/:weekday/exercises/:assignmentId — remove exercise from day
router.delete("/:id/days/:weekday/exercises/:assignmentId", async (req, res) => {
  const templateId = parseInt(req.params.id, 10);
  const weekday = parseInt(req.params.weekday, 10);
  const assignmentId = parseInt(req.params.assignmentId, 10);

  if (isNaN(templateId) || isNaN(weekday) || weekday < 0 || weekday > 6 || isNaN(assignmentId)) {
    res.status(400).json({ error: "Invalid parameters" });
    return;
  }

  const userId = req.session.userId!;

  // Verify template ownership
  const { rows: ownerRows } = await pool.query<{ id: number }>(
    "SELECT id FROM week_templates WHERE id = $1 AND user_id = $2",
    [templateId, userId]
  );
  if (ownerRows.length === 0) {
    res.status(404).json({ error: "Template not found" });
    return;
  }

  // Delete the assignment (verifying it belongs to this template/day)
  const { rowCount } = await pool.query(
    `DELETE FROM week_template_day_exercises
     WHERE id = $1
       AND day_id IN (
         SELECT id FROM week_template_days
         WHERE template_id = $2 AND weekday = $3
       )`,
    [assignmentId, templateId, weekday]
  );

  if (rowCount === 0) {
    res.status(404).json({ error: "Assignment not found" });
    return;
  }

  res.json({ ok: true });
});

export default router;
