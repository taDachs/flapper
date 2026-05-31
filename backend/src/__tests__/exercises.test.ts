/**
 * Exercise library API tests
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

// ── Test helpers ──────────────────────────────────────────────────────────

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

/** Returns an authenticated supertest agent for the given credentials. */
async function loginAgent(email: string, password: string) {
  const agent = request.agent(app);
  await agent.post("/api/auth/login").send({ email, password }).expect(200);
  return agent;
}

// ── Suite ────────────────────────────────────────────────────────────────

describe("Exercise library API", () => {
  const testEmail = `test-exercises-${Date.now()}@example.com`;
  let userId: number;
  let agent: ReturnType<typeof request.agent>;

  beforeAll(async () => {
    userId = await createTestUser(testEmail);
    agent = await loginAgent(testEmail, "testpassword");
  });

  afterAll(async () => {
    await deleteTestUser(testEmail);
  });

  // ── Tracer bullet: GET returns empty list ─────────────────────────────

  it("GET /api/exercises returns an empty list for a fresh user", async () => {
    const res = await agent.get("/api/exercises").expect(200);
    expect(res.body).toEqual([]);
  });

  // ── Create ────────────────────────────────────────────────────────────

  it("POST /api/exercises creates an exercise with required fields", async () => {
    const res = await agent
      .post("/api/exercises")
      .send({ name: "Pull-ups", category: "strength" })
      .expect(201);

    expect(res.body).toMatchObject({
      name: "Pull-ups",
      category: "strength",
      description: null,
      default_sets_reps: null,
      archived_at: null,
      fields: [],
    });
    expect(typeof res.body.id).toBe("number");
  });

  it("POST /api/exercises creates an exercise with all optional fields", async () => {
    const res = await agent
      .post("/api/exercises")
      .send({
        name: "Dead hang",
        category: "finger",
        description: "Hang from a bar",
        default_sets_reps: "3×10s",
      })
      .expect(201);

    expect(res.body).toMatchObject({
      name: "Dead hang",
      category: "finger",
      description: "Hang from a bar",
      default_sets_reps: "3×10s",
    });
  });

  it("POST /api/exercises rejects a request missing the required name", async () => {
    const res = await agent
      .post("/api/exercises")
      .send({ category: "finger" })
      .expect(400);
    expect(res.body.error).toBe("Invalid request");
  });

  it("POST /api/exercises rejects a request missing the required category", async () => {
    const res = await agent
      .post("/api/exercises")
      .send({ name: "Something" })
      .expect(400);
    expect(res.body.error).toBe("Invalid request");
  });

  // ── List ──────────────────────────────────────────────────────────────

  it("GET /api/exercises lists active exercises ordered by category then name", async () => {
    // Clean slate for this assertion — use a fresh user
    const email2 = `test-list-${Date.now()}@example.com`;
    await createTestUser(email2);
    const agent2 = await loginAgent(email2, "testpassword");

    await agent2.post("/api/exercises").send({ name: "Stretching", category: "stretch" });
    await agent2.post("/api/exercises").send({ name: "Deadlift", category: "strength" });
    await agent2.post("/api/exercises").send({ name: "Bench press", category: "strength" });

    const res = await agent2.get("/api/exercises").expect(200);

    const names = res.body.map((e: { name: string }) => e.name);
    expect(names).toEqual(["Bench press", "Deadlift", "Stretching"]);

    await deleteTestUser(email2);
  });

  // ── Update ────────────────────────────────────────────────────────────

  it("PUT /api/exercises/:id updates exercise metadata", async () => {
    const create = await agent
      .post("/api/exercises")
      .send({ name: "Old name", category: "strength" })
      .expect(201);

    const id = create.body.id;

    const res = await agent
      .put(`/api/exercises/${id}`)
      .send({
        name: "New name",
        category: "finger",
        description: "Updated",
        default_sets_reps: "4×8",
      })
      .expect(200);

    expect(res.body).toMatchObject({
      id,
      name: "New name",
      category: "finger",
      description: "Updated",
      default_sets_reps: "4×8",
    });
  });

  it("PUT /api/exercises/:id returns 404 for unknown exercise", async () => {
    const res = await agent
      .put("/api/exercises/999999")
      .send({ name: "X", category: "strength" })
      .expect(404);
    expect(res.body.error).toBe("Exercise not found");
  });

  // ── Archive ───────────────────────────────────────────────────────────

  it("POST /api/exercises/:id/archive archives the exercise (disappears from active list)", async () => {
    const create = await agent
      .post("/api/exercises")
      .send({ name: "ToArchive", category: "stretch" })
      .expect(201);
    const id = create.body.id;

    await agent.post(`/api/exercises/${id}/archive`).expect(200);

    // Should no longer appear in the active list
    const list = await agent.get("/api/exercises").expect(200);
    const found = list.body.find((e: { id: number }) => e.id === id);
    expect(found).toBeUndefined();
  });

  it("POST /api/exercises/:id/archive returns 404 for unknown exercise", async () => {
    const res = await agent.post("/api/exercises/999999/archive").expect(404);
    expect(res.body.error).toMatch(/not found/i);
  });

  // ── Hard delete ───────────────────────────────────────────────────────

  it("DELETE /api/exercises/:id hard-deletes an exercise with no log entries", async () => {
    const create = await agent
      .post("/api/exercises")
      .send({ name: "ToDelete", category: "strength" })
      .expect(201);
    const id = create.body.id;

    await agent.delete(`/api/exercises/${id}`).expect(200);

    // Verify it's gone
    const list = await agent.get("/api/exercises").expect(200);
    const found = list.body.find((e: { id: number }) => e.id === id);
    expect(found).toBeUndefined();
  });

  it("DELETE /api/exercises/:id returns 404 for unknown exercise", async () => {
    const res = await agent.delete("/api/exercises/999999").expect(404);
    expect(res.body.error).toBe("Exercise not found");
  });

  it("DELETE /api/exercises/:id returns 409 when log entries exist", async () => {
    // Create a training session exercise entry to simulate a log
    const create = await agent
      .post("/api/exercises")
      .send({ name: "Logged exercise", category: "strength" })
      .expect(201);
    const exerciseId = create.body.id;

    // Insert a training session manually to create a log entry
    const { rows: sessionRows } = await pool.query<{ id: number }>(
      "INSERT INTO training_sessions (user_id, date, weekday) VALUES ($1, CURRENT_DATE, 1) RETURNING id",
      [userId]
    );
    const sessionId = sessionRows[0].id;
    await pool.query(
      "INSERT INTO training_session_exercises (session_id, exercise_id) VALUES ($1, $2)",
      [sessionId, exerciseId]
    );

    const res = await agent.delete(`/api/exercises/${exerciseId}`).expect(409);
    expect(res.body.error).toMatch(/cannot delete/i);

    // Cleanup
    await pool.query("DELETE FROM training_sessions WHERE id = $1", [sessionId]);
  });

  // ── Exercise Fields ───────────────────────────────────────────────────

  it("POST /api/exercises/:id/fields adds a numeric field to an exercise", async () => {
    const create = await agent
      .post("/api/exercises")
      .send({ name: "Weighted pull-up", category: "strength" })
      .expect(201);
    const exerciseId = create.body.id;

    const res = await agent
      .post(`/api/exercises/${exerciseId}/fields`)
      .send({ name: "weight", unit: "kg", display_order: 0 })
      .expect(201);

    expect(res.body).toMatchObject({
      exercise_id: exerciseId,
      name: "weight",
      unit: "kg",
      display_order: 0,
    });
    expect(typeof res.body.id).toBe("number");

    // Verify it appears in the exercise list
    const list = await agent.get("/api/exercises").expect(200);
    const ex = list.body.find((e: { id: number }) => e.id === exerciseId);
    expect(ex.fields).toHaveLength(1);
    expect(ex.fields[0]).toMatchObject({ name: "weight", unit: "kg" });
  });

  it("POST /api/exercises/:id/fields rejects a field with no name", async () => {
    const create = await agent
      .post("/api/exercises")
      .send({ name: "Some exercise", category: "strength" })
      .expect(201);
    const exerciseId = create.body.id;

    const res = await agent
      .post(`/api/exercises/${exerciseId}/fields`)
      .send({ unit: "kg" })
      .expect(400);
    expect(res.body.error).toBe("Invalid request");
  });

  it("PUT /api/exercises/:id/fields/:fieldId updates a field", async () => {
    const create = await agent
      .post("/api/exercises")
      .send({ name: "Deadlift updated", category: "strength" })
      .expect(201);
    const exerciseId = create.body.id;

    const fieldRes = await agent
      .post(`/api/exercises/${exerciseId}/fields`)
      .send({ name: "reps", display_order: 0 })
      .expect(201);
    const fieldId = fieldRes.body.id;

    const res = await agent
      .put(`/api/exercises/${exerciseId}/fields/${fieldId}`)
      .send({ name: "repetitions", unit: "count", display_order: 1 })
      .expect(200);

    expect(res.body).toMatchObject({
      id: fieldId,
      name: "repetitions",
      unit: "count",
      display_order: 1,
    });
  });

  it("DELETE /api/exercises/:id/fields/:fieldId removes a field", async () => {
    const create = await agent
      .post("/api/exercises")
      .send({ name: "Squat", category: "strength" })
      .expect(201);
    const exerciseId = create.body.id;

    const fieldRes = await agent
      .post(`/api/exercises/${exerciseId}/fields`)
      .send({ name: "load", unit: "kg" })
      .expect(201);
    const fieldId = fieldRes.body.id;

    await agent.delete(`/api/exercises/${exerciseId}/fields/${fieldId}`).expect(200);

    // Field should be gone from the exercise list
    const list = await agent.get("/api/exercises").expect(200);
    const ex = list.body.find((e: { id: number }) => e.id === exerciseId);
    // fields array may not exist if exercise is newly created with no other fields
    const fields = ex?.fields ?? [];
    expect(fields.find((f: { id: number }) => f.id === fieldId)).toBeUndefined();
  });
});
