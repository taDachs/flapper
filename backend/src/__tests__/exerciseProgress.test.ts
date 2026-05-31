/**
 * Exercise progress API tests
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

// ── Suite ──────────────────────────────────────────────────────────────────

describe("Exercise progress API", () => {
  const testEmail = `test-ex-progress-${Date.now()}@example.com`;
  let agent: ReturnType<typeof request.agent>;

  beforeAll(async () => {
    await createTestUser(testEmail);
    agent = await loginAgent(testEmail, "testpassword");
  });

  afterAll(async () => {
    await deleteTestUser(testEmail);
  });

  it("GET /api/exercises/progress returns empty array when no data", async () => {
    const res = await agent.get("/api/exercises/progress").expect(200);
    expect(res.body).toEqual([]);
  });

  it("GET /api/exercises/progress returns time-series data for fields with logged values", async () => {
    const email = `test-progress-data-${Date.now()}@example.com`;
    await createTestUser(email);
    const a = await loginAgent(email, "testpassword");

    // Create exercise with two fields
    const exRes = await a
      .post("/api/exercises")
      .send({ name: "Deadlift", category: "strength" })
      .expect(201);
    const exerciseId = exRes.body.id as number;

    const f1Res = await a
      .post(`/api/exercises/${exerciseId}/fields`)
      .send({ name: "weight", unit: "kg" })
      .expect(201);
    const fieldId1 = f1Res.body.id as number;

    const f2Res = await a
      .post(`/api/exercises/${exerciseId}/fields`)
      .send({ name: "reps", unit: null })
      .expect(201);
    const fieldId2 = f2Res.body.id as number;

    // Create two training sessions and log values
    const sess1 = await a
      .get("/api/training-sessions/for-date/2026-06-01")
      .expect(200);
    const sessionId1 = sess1.body.id as number;
    // Add exercise to session
    const seRes1 = await a
      .post(`/api/training-sessions/${sessionId1}/exercises`)
      .send({ exercise_id: exerciseId })
      .expect(201);
    const seId1 = seRes1.body.id as number;
    // Log both fields
    await a
      .patch(`/api/training-sessions/${sessionId1}/exercises/${seId1}`)
      .send({ field_values: [{ field_id: fieldId1, value: 100 }, { field_id: fieldId2, value: 5 }] })
      .expect(200);

    // Second session (different date) — only log weight
    const sess2 = await a
      .get("/api/training-sessions/for-date/2026-06-08")
      .expect(200);
    const sessionId2 = sess2.body.id as number;
    const seRes2 = await a
      .post(`/api/training-sessions/${sessionId2}/exercises`)
      .send({ exercise_id: exerciseId })
      .expect(201);
    const seId2 = seRes2.body.id as number;
    await a
      .patch(`/api/training-sessions/${sessionId2}/exercises/${seId2}`)
      .send({ field_values: [{ field_id: fieldId1, value: 110 }] })
      .expect(200);

    const res = await a.get("/api/exercises/progress").expect(200);

    // Response should be an array of exercise-level objects
    expect(Array.isArray(res.body)).toBe(true);
    expect(res.body.length).toBeGreaterThanOrEqual(1);

    const exData = res.body.find(
      (e: { exercise_id: number }) => e.exercise_id === exerciseId
    );
    expect(exData).toBeDefined();
    expect(exData.exercise_name).toBe("Deadlift");
    expect(Array.isArray(exData.fields)).toBe(true);

    // weight field should have 2 data points
    const weightField = exData.fields.find(
      (f: { field_id: number }) => f.field_id === fieldId1
    );
    expect(weightField).toBeDefined();
    expect(weightField.field_name).toBe("weight");
    expect(weightField.unit).toBe("kg");
    expect(weightField.data_points.length).toBe(2);

    // Data points should be sorted by date ascending
    expect(weightField.data_points[0].date).toBe("2026-06-01");
    expect(Number(weightField.data_points[0].value)).toBe(100);
    expect(weightField.data_points[1].date).toBe("2026-06-08");
    expect(Number(weightField.data_points[1].value)).toBe(110);

    // reps field (only 1 data point) should be present too
    const repsField = exData.fields.find(
      (f: { field_id: number }) => f.field_id === fieldId2
    );
    expect(repsField).toBeDefined();
    expect(repsField.data_points.length).toBe(1);
    expect(Number(repsField.data_points[0].value)).toBe(5);

    await deleteTestUser(email);
  });

  it("GET /api/exercises/progress excludes fields with no logged values", async () => {
    const email = `test-progress-nodata-${Date.now()}@example.com`;
    await createTestUser(email);
    const a = await loginAgent(email, "testpassword");

    // Create exercise with a field but never log any values
    const exRes = await a
      .post("/api/exercises")
      .send({ name: "NoDataExercise", category: "stretch" })
      .expect(201);
    const exerciseId = exRes.body.id as number;

    await a
      .post(`/api/exercises/${exerciseId}/fields`)
      .send({ name: "duration", unit: "sec" })
      .expect(201);

    const res = await a.get("/api/exercises/progress").expect(200);
    // No data logged — should return empty array (or exercise not present)
    const exData = res.body.find(
      (e: { exercise_id: number }) => e.exercise_id === exerciseId
    );
    expect(exData).toBeUndefined();

    await deleteTestUser(email);
  });

  it("GET /api/exercises/progress requires authentication", async () => {
    const unauthAgent = request(app);
    await unauthAgent.get("/api/exercises/progress").expect(401);
  });

  it("GET /api/exercises/progress is isolated per user", async () => {
    const emailA = `test-progress-iso-a-${Date.now()}@example.com`;
    const emailB = `test-progress-iso-b-${Date.now()}@example.com`;
    await createTestUser(emailA);
    await createTestUser(emailB);
    const agentA = await loginAgent(emailA, "testpassword");
    const agentB = await loginAgent(emailB, "testpassword");

    // User A creates exercise and logs data
    const exRes = await agentA
      .post("/api/exercises")
      .send({ name: "Bench Press", category: "strength" })
      .expect(201);
    const exerciseId = exRes.body.id as number;
    const fieldRes = await agentA
      .post(`/api/exercises/${exerciseId}/fields`)
      .send({ name: "weight", unit: "kg" })
      .expect(201);
    const fieldId = fieldRes.body.id as number;

    const sess = await agentA
      .get("/api/training-sessions/for-date/2026-06-15")
      .expect(200);
    const seRes = await agentA
      .post(`/api/training-sessions/${sess.body.id}/exercises`)
      .send({ exercise_id: exerciseId })
      .expect(201);
    await agentA
      .patch(`/api/training-sessions/${sess.body.id}/exercises/${seRes.body.id}`)
      .send({ field_values: [{ field_id: fieldId, value: 80 }] })
      .expect(200);

    // User B should see no progress data
    const resB = await agentB.get("/api/exercises/progress").expect(200);
    const exDataB = resB.body.find(
      (e: { exercise_id: number }) => e.exercise_id === exerciseId
    );
    expect(exDataB).toBeUndefined();

    await deleteTestUser(emailA);
    await deleteTestUser(emailB);
  });
});
