import { Router } from "express";
import { z } from "zod";
import pool from "../db/pool.js";

const router = Router();

const gradeBodySchema = z.object({
  name: z.string().min(1),
  difficulty: z.number().int().min(1),
  color: z.string().optional().nullable(),
});

// GET /api/grades — list all grades in difficulty order
router.get("/", async (req, res) => {
  const userId = req.session.userId!;
  const { rows } = await pool.query<{
    id: number;
    name: string;
    difficulty: number;
    color: string | null;
  }>(
    "SELECT id, name, difficulty, color FROM grades WHERE user_id = $1 ORDER BY difficulty ASC",
    [userId]
  );
  res.json(rows);
});

// POST /api/grades — create a new grade
router.post("/", async (req, res) => {
  const result = gradeBodySchema.safeParse(req.body);
  if (!result.success) {
    res.status(400).json({ error: "Invalid request", details: result.error.flatten() });
    return;
  }

  const userId = req.session.userId!;
  const { name, difficulty, color } = result.data;

  const { rows } = await pool.query<{ id: number }>(
    "INSERT INTO grades (user_id, name, difficulty, color) VALUES ($1, $2, $3, $4) RETURNING id",
    [userId, name, difficulty, color ?? null]
  );
  res.status(201).json({ id: rows[0].id, name, difficulty, color: color ?? null });
});

// PUT /api/grades/:id — update a grade
router.put("/:id", async (req, res) => {
  const id = parseInt(req.params.id, 10);
  if (isNaN(id)) {
    res.status(400).json({ error: "Invalid id" });
    return;
  }

  const result = gradeBodySchema.safeParse(req.body);
  if (!result.success) {
    res.status(400).json({ error: "Invalid request", details: result.error.flatten() });
    return;
  }

  const userId = req.session.userId!;
  const { name, difficulty, color } = result.data;

  const { rowCount } = await pool.query(
    "UPDATE grades SET name = $1, difficulty = $2, color = $3 WHERE id = $4 AND user_id = $5",
    [name, difficulty, color ?? null, id, userId]
  );

  if (rowCount === 0) {
    res.status(404).json({ error: "Grade not found" });
    return;
  }

  res.json({ id, name, difficulty, color: color ?? null });
});

// DELETE /api/grades/:id — delete a grade (blocked if climbing entries exist)
router.delete("/:id", async (req, res) => {
  const id = parseInt(req.params.id, 10);
  if (isNaN(id)) {
    res.status(400).json({ error: "Invalid id" });
    return;
  }

  const userId = req.session.userId!;

  // Check ownership
  const { rows: ownerRows } = await pool.query<{ id: number }>(
    "SELECT id FROM grades WHERE id = $1 AND user_id = $2",
    [id, userId]
  );
  if (ownerRows.length === 0) {
    res.status(404).json({ error: "Grade not found" });
    return;
  }

  // Check for climbing session entries referencing this grade
  const { rows: entryRows } = await pool.query<{ count: string }>(
    "SELECT COUNT(*) AS count FROM climbing_session_entries WHERE grade_id = $1",
    [id]
  );
  if (parseInt(entryRows[0].count, 10) > 0) {
    res.status(409).json({
      error: "Cannot delete a grade that has climbing session entries attached.",
    });
    return;
  }

  await pool.query("DELETE FROM grades WHERE id = $1 AND user_id = $2", [id, userId]);
  res.json({ ok: true });
});

export default router;
