/**
 * Week Template management API tests
 *
 * Run against the real Postgres instance (DATABASE_URL env var).
 * Each test suite creates a dedicated test user and cleans up after itself.
 */

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import request from "supertest";
import pool from "../db/pool.js";
import { createApp } from "../createApp.js";
import argon2 from "argon2";

const app = createApp();

// ── Helpers ────────────────────────────────────────────────────────────────

async function createTestUser(email: string) {
  const hash = await argon2.hash("testpassword");
  const { rows } = await pool.query<{ id: number }>(
    "INSERT INTO users (email, password_hash) VALUES ($1, $2) RETURNING id",
    [email, hash]
  );
  return rows[0].id;
}

async function deleteTestUser(email: string) {
  await pool.query("DELETE FROM users WHERE email = $1", [email]);
}

async function loginAgent(email: string, password: string) {
  const agent = request.agent(app);
  await agent.post("/api/auth/login").send({ email, password }).expect(200);
  return agent;
}

async function createExercise(agent: ReturnType<typeof request.agent>, name = "Pull-ups") {
  const res = await agent
    .post("/api/exercises")
    .send({ name, category: "strength" })
    .expect(201);
  return res.body.id as number;
}

// ── Suite ────────────────────────────────────────────────────────────────────

describe("Week Template API", () => {
  const testEmail = `test-templates-${Date.now()}@example.com`;
  let userId: number;
  let agent: ReturnType<typeof request.agent>;

  beforeAll(async () => {
    userId = await createTestUser(testEmail);
    agent = await loginAgent(testEmail, "testpassword");
    void userId; // suppress unused warning; used for direct DB queries
  });

  afterAll(async () => {
    await deleteTestUser(testEmail);
  });

  // ── Template list and create ───────────────────────────────────────────

  it("GET /api/week-templates returns empty list for a fresh user", async () => {
    const res = await agent.get("/api/week-templates").expect(200);
    expect(res.body).toEqual([]);
  });

  it("POST /api/week-templates creates a new template", async () => {
    const res = await agent
      .post("/api/week-templates")
      .send({ name: "Beginner Week" })
      .expect(201);

    expect(res.body).toMatchObject({
      name: "Beginner Week",
      is_active: false,
      days: [],
    });
    expect(typeof res.body.id).toBe("number");
  });

  it("POST /api/week-templates rejects missing name", async () => {
    const res = await agent.post("/api/week-templates").send({}).expect(400);
    expect(res.body.error).toBe("Invalid request");
  });

  it("GET /api/week-templates lists all created templates", async () => {
    // Use fresh user to avoid interference
    const email2 = `test-tlist-${Date.now()}@example.com`;
    await createTestUser(email2);
    const agent2 = await loginAgent(email2, "testpassword");

    await agent2.post("/api/week-templates").send({ name: "Week A" }).expect(201);
    await agent2.post("/api/week-templates").send({ name: "Week B" }).expect(201);

    const res = await agent2.get("/api/week-templates").expect(200);
    expect(res.body).toHaveLength(2);
    const names = res.body.map((t: { name: string }) => t.name);
    expect(names).toContain("Week A");
    expect(names).toContain("Week B");

    await deleteTestUser(email2);
  });

  // ── Get single template ────────────────────────────────────────────────

  it("GET /api/week-templates/:id returns the template with days", async () => {
    const createRes = await agent
      .post("/api/week-templates")
      .send({ name: "Detail Template" })
      .expect(201);
    const id = createRes.body.id;

    const res = await agent.get(`/api/week-templates/${id}`).expect(200);
    expect(res.body).toMatchObject({
      id,
      name: "Detail Template",
      is_active: false,
      days: [],
    });
  });

  it("GET /api/week-templates/:id returns 404 for unknown template", async () => {
    const res = await agent.get("/api/week-templates/999999").expect(404);
    expect(res.body.error).toBe("Template not found");
  });

  // ── Update template name ───────────────────────────────────────────────

  it("PUT /api/week-templates/:id updates the template name", async () => {
    const createRes = await agent
      .post("/api/week-templates")
      .send({ name: "Old Name" })
      .expect(201);
    const id = createRes.body.id;

    const res = await agent
      .put(`/api/week-templates/${id}`)
      .send({ name: "New Name" })
      .expect(200);

    expect(res.body).toMatchObject({ id, name: "New Name" });
  });

  it("PUT /api/week-templates/:id returns 404 for unknown template", async () => {
    const res = await agent
      .put("/api/week-templates/999999")
      .send({ name: "Whatever" })
      .expect(404);
    expect(res.body.error).toBe("Template not found");
  });

  // ── Delete template ────────────────────────────────────────────────────

  it("DELETE /api/week-templates/:id removes the template", async () => {
    const createRes = await agent
      .post("/api/week-templates")
      .send({ name: "To Delete" })
      .expect(201);
    const id = createRes.body.id;

    await agent.delete(`/api/week-templates/${id}`).expect(200);

    await agent.get(`/api/week-templates/${id}`).expect(404);
  });

  // ── Activate template ──────────────────────────────────────────────────

  it("POST /api/week-templates/:id/activate marks the template as active", async () => {
    const email2 = `test-activate-${Date.now()}@example.com`;
    await createTestUser(email2);
    const agent2 = await loginAgent(email2, "testpassword");

    const t1 = (await agent2.post("/api/week-templates").send({ name: "T1" }).expect(201)).body;
    const t2 = (await agent2.post("/api/week-templates").send({ name: "T2" }).expect(201)).body;

    // Activate t1
    await agent2.post(`/api/week-templates/${t1.id}/activate`).expect(200);

    let list = await agent2.get("/api/week-templates").expect(200);
    let byId = (arr: { id: number; is_active: boolean }[], id: number) =>
      arr.find((t) => t.id === id)!;
    expect(byId(list.body, t1.id).is_active).toBe(true);
    expect(byId(list.body, t2.id).is_active).toBe(false);

    // Activate t2 — t1 should become inactive
    await agent2.post(`/api/week-templates/${t2.id}/activate`).expect(200);

    list = await agent2.get("/api/week-templates").expect(200);
    expect(byId(list.body, t1.id).is_active).toBe(false);
    expect(byId(list.body, t2.id).is_active).toBe(true);

    await deleteTestUser(email2);
  });

  it("POST /api/week-templates/:id/activate returns 404 for unknown template", async () => {
    const res = await agent.post("/api/week-templates/999999/activate").expect(404);
    expect(res.body.error).toBe("Template not found");
  });

  it("activating a template does not modify existing training sessions", async () => {
    // Create a training session
    const { rows: sessionRows } = await pool.query<{ id: number }>(
      `SELECT id FROM users WHERE email = $1`,
      [testEmail]
    );
    const uid = sessionRows[0].id;

    const { rows: sess } = await pool.query<{ id: number }>(
      "INSERT INTO training_sessions (user_id, date, weekday) VALUES ($1, CURRENT_DATE, 1) RETURNING id",
      [uid]
    );
    const sessionId = sess[0].id;

    const t = (
      await agent.post("/api/week-templates").send({ name: "Won't Affect Sessions" }).expect(201)
    ).body;

    await agent.post(`/api/week-templates/${t.id}/activate`).expect(200);

    // Training session must still exist unchanged
    const { rows: stillThere } = await pool.query(
      "SELECT id FROM training_sessions WHERE id = $1",
      [sessionId]
    );
    expect(stillThere).toHaveLength(1);

    // Cleanup
    await pool.query("DELETE FROM training_sessions WHERE id = $1", [sessionId]);
  });

  // ── Day: toggle includes_climbing ──────────────────────────────────────

  it("PUT /api/week-templates/:id/days/:weekday sets includes_climbing", async () => {
    const t = (
      await agent.post("/api/week-templates").send({ name: "Climbing Day Template" }).expect(201)
    ).body;

    const res = await agent
      .put(`/api/week-templates/${t.id}/days/1`)
      .send({ includes_climbing: true })
      .expect(200);

    expect(res.body).toMatchObject({
      template_id: t.id,
      weekday: 1,
      includes_climbing: true,
    });
    expect(typeof res.body.id).toBe("number");

    // Calling again (upsert) should update
    const res2 = await agent
      .put(`/api/week-templates/${t.id}/days/1`)
      .send({ includes_climbing: false })
      .expect(200);

    expect(res2.body.includes_climbing).toBe(false);
  });

  it("PUT /api/week-templates/:id/days/:weekday returns 400 for invalid weekday", async () => {
    const t = (
      await agent.post("/api/week-templates").send({ name: "Bad Weekday" }).expect(201)
    ).body;

    await agent
      .put(`/api/week-templates/${t.id}/days/7`)
      .send({ includes_climbing: true })
      .expect(400);
  });

  // ── Day exercises: add / update / remove ──────────────────────────────

  it("POST /api/week-templates/:id/days/:weekday/exercises adds an exercise to a day", async () => {
    const t = (
      await agent.post("/api/week-templates").send({ name: "Exercise Day Template" }).expect(201)
    ).body;
    const exerciseId = await createExercise(agent, `ExTemplate-${Date.now()}`);

    const res = await agent
      .post(`/api/week-templates/${t.id}/days/0/exercises`)
      .send({ exercise_id: exerciseId, sets_reps_override: "5×5", display_order: 0 })
      .expect(201);

    expect(res.body).toMatchObject({
      exercise_id: exerciseId,
      sets_reps_override: "5×5",
      display_order: 0,
    });
    expect(typeof res.body.id).toBe("number");
    expect(typeof res.body.day_id).toBe("number");
  });

  it("POST /api/week-templates/:id/days/:weekday/exercises adds exercise with no override", async () => {
    const t = (
      await agent.post("/api/week-templates").send({ name: "No Override" }).expect(201)
    ).body;
    const exerciseId = await createExercise(agent, `NoOverride-${Date.now()}`);

    const res = await agent
      .post(`/api/week-templates/${t.id}/days/3/exercises`)
      .send({ exercise_id: exerciseId })
      .expect(201);

    expect(res.body.sets_reps_override).toBeNull();
  });

  it("POST /api/week-templates/:id/days/:weekday/exercises returns 404 for unknown exercise", async () => {
    const t = (
      await agent.post("/api/week-templates").send({ name: "Bad Exercise" }).expect(201)
    ).body;

    const res = await agent
      .post(`/api/week-templates/${t.id}/days/0/exercises`)
      .send({ exercise_id: 999999 })
      .expect(404);

    expect(res.body.error).toBe("Exercise not found");
  });

  it("PUT /api/week-templates/:id/days/:weekday/exercises/:assignmentId updates the override", async () => {
    const t = (
      await agent.post("/api/week-templates").send({ name: "Override Update" }).expect(201)
    ).body;
    const exerciseId = await createExercise(agent, `OverrideUpd-${Date.now()}`);

    const addRes = await agent
      .post(`/api/week-templates/${t.id}/days/2/exercises`)
      .send({ exercise_id: exerciseId, sets_reps_override: "3×10" })
      .expect(201);
    const assignmentId = addRes.body.id;

    const res = await agent
      .put(`/api/week-templates/${t.id}/days/2/exercises/${assignmentId}`)
      .send({ sets_reps_override: "4×8" })
      .expect(200);

    expect(res.body).toMatchObject({ id: assignmentId, sets_reps_override: "4×8" });
  });

  it("DELETE /api/week-templates/:id/days/:weekday/exercises/:assignmentId removes exercise from day", async () => {
    const t = (
      await agent.post("/api/week-templates").send({ name: "Remove Exercise" }).expect(201)
    ).body;
    const exerciseId = await createExercise(agent, `RemoveEx-${Date.now()}`);

    const addRes = await agent
      .post(`/api/week-templates/${t.id}/days/4/exercises`)
      .send({ exercise_id: exerciseId })
      .expect(201);
    const assignmentId = addRes.body.id;

    await agent
      .delete(`/api/week-templates/${t.id}/days/4/exercises/${assignmentId}`)
      .expect(200);

    // Template detail should show no exercises on this day
    const detail = await agent.get(`/api/week-templates/${t.id}`).expect(200);
    const day = detail.body.days.find((d: { weekday: number }) => d.weekday === 4);
    if (day) {
      const found = day.exercises.find((e: { id: number }) => e.id === assignmentId);
      expect(found).toBeUndefined();
    }
  });

  it("DELETE /api/week-templates/:id/days/:weekday/exercises/:assignmentId returns 404 for unknown assignment", async () => {
    const t = (
      await agent.post("/api/week-templates").send({ name: "404 Delete" }).expect(201)
    ).body;

    const res = await agent
      .delete(`/api/week-templates/${t.id}/days/0/exercises/999999`)
      .expect(404);

    expect(res.body.error).toBe("Assignment not found");
  });

  // ── Full round-trip: template with days visible via GET /:id ──────────

  it("GET /api/week-templates/:id shows days and exercises after adding them", async () => {
    const t = (
      await agent.post("/api/week-templates").send({ name: "Full Round-trip" }).expect(201)
    ).body;
    const exerciseId = await createExercise(agent, `RoundTrip-${Date.now()}`);

    // Set Monday (1) as climbing day
    await agent
      .put(`/api/week-templates/${t.id}/days/1`)
      .send({ includes_climbing: true })
      .expect(200);

    // Add exercise to Monday
    await agent
      .post(`/api/week-templates/${t.id}/days/1/exercises`)
      .send({ exercise_id: exerciseId, sets_reps_override: "3×12", display_order: 0 })
      .expect(201);

    const detail = await agent.get(`/api/week-templates/${t.id}`).expect(200);

    expect(detail.body.days).toHaveLength(1);
    const monday = detail.body.days[0];
    expect(monday.weekday).toBe(1);
    expect(monday.includes_climbing).toBe(true);
    expect(monday.exercises).toHaveLength(1);
    expect(monday.exercises[0]).toMatchObject({
      exercise_id: exerciseId,
      sets_reps_override: "3×12",
      display_order: 0,
    });
  });

  // ── Zod validation on day exercise endpoints ──────────────────────────

  it("POST /api/week-templates/:id/days/:weekday/exercises rejects missing exercise_id", async () => {
    const t = (
      await agent.post("/api/week-templates").send({ name: "Validation Test" }).expect(201)
    ).body;

    const res = await agent
      .post(`/api/week-templates/${t.id}/days/0/exercises`)
      .send({ sets_reps_override: "3×10" })
      .expect(400);

    expect(res.body.error).toBe("Invalid request");
  });

  it("PUT /api/week-templates/:id/days/:weekday rejects missing includes_climbing", async () => {
    const t = (
      await agent.post("/api/week-templates").send({ name: "Day Validation Test" }).expect(201)
    ).body;

    const res = await agent
      .put(`/api/week-templates/${t.id}/days/0`)
      .send({})
      .expect(400);

    expect(res.body.error).toBe("Invalid request");
  });
});
