/**
 * Training Session logging API tests
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

async function createExercise(
  agent: ReturnType<typeof request.agent>,
  name: string,
  fields: Array<{ name: string; unit?: string }> = []
) {
  const res = await agent
    .post("/api/exercises")
    .send({ name, category: "strength" })
    .expect(201);
  const exerciseId = res.body.id as number;
  const fieldIds: number[] = [];
  for (const field of fields) {
    const fr = await agent
      .post(`/api/exercises/${exerciseId}/fields`)
      .send({ name: field.name, unit: field.unit ?? null })
      .expect(201);
    fieldIds.push(fr.body.id as number);
  }
  return { exerciseId, fieldIds };
}

async function createActiveTemplate(
  agent: ReturnType<typeof request.agent>,
  exerciseId: number,
  weekday: number
) {
  const t = (await agent.post("/api/week-templates").send({ name: "Test Template" }).expect(201)).body;
  await agent
    .post(`/api/week-templates/${t.id}/days/${weekday}/exercises`)
    .send({ exercise_id: exerciseId, sets_reps_override: "3×10" })
    .expect(201);
  await agent.post(`/api/week-templates/${t.id}/activate`).expect(200);
  return t.id as number;
}

// ── Suite ──────────────────────────────────────────────────────────────────

describe("Training Sessions API", () => {
  const testEmail = `test-training-${Date.now()}@example.com`;
  let agent: ReturnType<typeof request.agent>;

  beforeAll(async () => {
    await createTestUser(testEmail);
    agent = await loginAgent(testEmail, "testpassword");
  });

  afterAll(async () => {
    await deleteTestUser(testEmail);
  });

  // ── GET /api/training-sessions — list sessions ─────────────────────────

  it("GET /api/training-sessions returns empty list for fresh user", async () => {
    const res = await agent.get("/api/training-sessions").expect(200);
    expect(res.body).toEqual([]);
  });

  // ── GET /api/training-sessions/for-date/:date — get or init session ───

  it("GET /api/training-sessions/for-date/:date returns session structure for a date with active template", async () => {
    const email2 = `test-fordate-${Date.now()}@example.com`;
    await createTestUser(email2);
    const agent2 = await loginAgent(email2, "testpassword");

    const { exerciseId } = await createExercise(agent2, `ForDate-${Date.now()}`);

    // Use a known weekday: 2026-05-25 is Monday (weekday=1)
    const date = "2026-05-25";
    const weekday = 1;
    await createActiveTemplate(agent2, exerciseId, weekday);

    const res = await agent2
      .get(`/api/training-sessions/for-date/${date}`)
      .expect(200);

    expect(res.body).toMatchObject({
      date,
      weekday,
    });
    expect(typeof res.body.id).toBe("number");
    expect(Array.isArray(res.body.exercises)).toBe(true);
    // The exercise from the active template for this weekday should be pre-populated
    expect(res.body.exercises.length).toBeGreaterThanOrEqual(1);
    const ex = res.body.exercises[0];
    expect(ex.exercise_id).toBe(exerciseId);
    expect(typeof ex.completed).toBe("boolean");

    await deleteTestUser(email2);
  });

  it("GET /api/training-sessions/for-date/:date creates a session on first access", async () => {
    const email3 = `test-create-${Date.now()}@example.com`;
    await createTestUser(email3);
    const agent3 = await loginAgent(email3, "testpassword");

    const date = "2026-05-26"; // Tuesday weekday=2

    // No template — session should still be returned (empty exercises)
    const res = await agent3
      .get(`/api/training-sessions/for-date/${date}`)
      .expect(200);
    expect(res.body.date).toBe(date);
    expect(res.body.exercises).toEqual([]);

    // Calling again should return the same session (not create a duplicate)
    const res2 = await agent3
      .get(`/api/training-sessions/for-date/${date}`)
      .expect(200);
    expect(res2.body.id).toBe(res.body.id);

    await deleteTestUser(email3);
  });

  it("GET /api/training-sessions/for-date/:date re-seeds exercises into empty session when template is activated after session creation", async () => {
    // Use the shared agent so no extra login is needed (rate limit stays within budget)
    // Use a date that is isolated from other tests: 2026-07-06 is Monday (weekday=1)
    const reseedDate = "2026-07-06";
    const weekday = 1;

    // Step 1: Access training page before a template is active — creates empty session
    const res1 = await agent
      .get(`/api/training-sessions/for-date/${reseedDate}`)
      .expect(200);
    expect(res1.body.exercises).toEqual([]);
    const sessionId = res1.body.id;

    // Step 2: Create an exercise and activate a template for Monday
    const reseedEx = await agent
      .post("/api/exercises")
      .send({ name: `ReseedEx-${Date.now()}`, category: "strength" })
      .expect(201);
    const reseedExId = reseedEx.body.id as number;
    await createActiveTemplate(agent, reseedExId, weekday);

    // Step 3: Access the same training session again — it should now have exercises
    const res2 = await agent
      .get(`/api/training-sessions/for-date/${reseedDate}`)
      .expect(200);
    expect(res2.body.id).toBe(sessionId); // same session, not a new one
    expect(res2.body.exercises.length).toBeGreaterThanOrEqual(1);
    expect(res2.body.exercises[0].exercise_id).toBe(reseedExId);
  });

  it("GET /api/training-sessions/for-date/:date does not re-seed when session already has exercises", async () => {
    // Use the shared agent; template is now active from the previous test.
    // Use Tuesday so there are no template exercises for this weekday (template only has Mon)
    // 2026-07-07 is Tuesday (weekday=2)
    const noReseedDate = "2026-07-07";

    // Create an extra exercise to manually add later
    const extraEx = await agent
      .post("/api/exercises")
      .send({ name: `ExtraEx-${Date.now()}`, category: "strength" })
      .expect(201);
    const extraExId = extraEx.body.id as number;

    // First access — session created with 0 exercises (no template for Tuesday)
    const res1 = await agent
      .get(`/api/training-sessions/for-date/${noReseedDate}`)
      .expect(200);
    expect(res1.body.exercises).toEqual([]);
    const sessionId = res1.body.id;

    // Manually add one exercise
    await agent
      .post(`/api/training-sessions/${sessionId}/exercises`)
      .send({ exercise_id: extraExId })
      .expect(201);

    // Fetch again — should still have exactly 1 exercise (no double-seeding)
    const res2 = await agent
      .get(`/api/training-sessions/for-date/${noReseedDate}`)
      .expect(200);
    expect(res2.body.id).toBe(sessionId);
    expect(res2.body.exercises.length).toBe(1);
  });

  it("GET /api/training-sessions/for-date/:date rejects invalid date", async () => {
    await agent.get("/api/training-sessions/for-date/not-a-date").expect(400);
  });

  // ── PATCH /api/training-sessions/:sessionId/exercises/:seId — update completion/fields ──

  it("PATCH /api/training-sessions/:sessionId/exercises/:seId updates completed", async () => {
    const email4 = `test-complete-${Date.now()}@example.com`;
    await createTestUser(email4);
    const agent4 = await loginAgent(email4, "testpassword");
    const { exerciseId } = await createExercise(agent4, `Complete-${Date.now()}`);
    await createActiveTemplate(agent4, exerciseId, 1); // Monday

    const sessionRes = await agent4
      .get("/api/training-sessions/for-date/2026-05-25")
      .expect(200);
    const sessionId = sessionRes.body.id;
    const seId = sessionRes.body.exercises[0].id;

    const res = await agent4
      .patch(`/api/training-sessions/${sessionId}/exercises/${seId}`)
      .send({ completed: true })
      .expect(200);

    expect(res.body.completed).toBe(true);

    await deleteTestUser(email4);
  });

  it("PATCH /api/training-sessions/:sessionId/exercises/:seId updates field values", async () => {
    const email5 = `test-fields-${Date.now()}@example.com`;
    await createTestUser(email5);
    const agent5 = await loginAgent(email5, "testpassword");
    const { exerciseId, fieldIds } = await createExercise(
      agent5,
      `WithFields-${Date.now()}`,
      [{ name: "weight", unit: "kg" }]
    );
    await createActiveTemplate(agent5, exerciseId, 1);

    const sessionRes = await agent5
      .get("/api/training-sessions/for-date/2026-05-25")
      .expect(200);
    const sessionId = sessionRes.body.id;
    const seId = sessionRes.body.exercises[0].id;

    const res = await agent5
      .patch(`/api/training-sessions/${sessionId}/exercises/${seId}`)
      .send({
        field_values: [{ field_id: fieldIds[0], value: 80 }],
      })
      .expect(200);

    const fv = res.body.field_values.find(
      (f: { field_id: number }) => f.field_id === fieldIds[0]
    );
    expect(fv).toBeDefined();
    expect(Number(fv.value)).toBe(80);

    await deleteTestUser(email5);
  });

  it("PATCH validates input — rejects non-boolean completed", async () => {
    const email6 = `test-val-${Date.now()}@example.com`;
    await createTestUser(email6);
    const agent6 = await loginAgent(email6, "testpassword");
    const { exerciseId } = await createExercise(agent6, `Val-${Date.now()}`);
    await createActiveTemplate(agent6, exerciseId, 1);

    const sessionRes = await agent6
      .get("/api/training-sessions/for-date/2026-05-25")
      .expect(200);
    const sessionId = sessionRes.body.id;
    const seId = sessionRes.body.exercises[0].id;

    const res = await agent6
      .patch(`/api/training-sessions/${sessionId}/exercises/${seId}`)
      .send({ completed: "yes" })
      .expect(400);

    expect(res.body.error).toBe("Invalid request");

    await deleteTestUser(email6);
  });

  // ── POST /api/training-sessions/:sessionId/exercises — add extra exercise ──

  it("POST /api/training-sessions/:sessionId/exercises adds an exercise to a session", async () => {
    const email7 = `test-addex-${Date.now()}@example.com`;
    await createTestUser(email7);
    const agent7 = await loginAgent(email7, "testpassword");
    const { exerciseId } = await createExercise(agent7, `BaseEx-${Date.now()}`);
    const { exerciseId: extraId } = await createExercise(agent7, `ExtraEx-${Date.now()}`);

    // Create a session (no template needed for this test)
    const sessionRes = await agent7
      .get("/api/training-sessions/for-date/2026-06-01")
      .expect(200);
    const sessionId = sessionRes.body.id;
    void exerciseId;

    const res = await agent7
      .post(`/api/training-sessions/${sessionId}/exercises`)
      .send({ exercise_id: extraId })
      .expect(201);

    expect(res.body.exercise_id).toBe(extraId);
    expect(res.body.completed).toBe(false);

    await deleteTestUser(email7);
  });

  it("POST /api/training-sessions/:sessionId/exercises returns 404 for unknown exercise", async () => {
    const email8 = `test-noex-${Date.now()}@example.com`;
    await createTestUser(email8);
    const agent8 = await loginAgent(email8, "testpassword");

    const sessionRes = await agent8
      .get("/api/training-sessions/for-date/2026-06-02")
      .expect(200);
    const sessionId = sessionRes.body.id;

    const res = await agent8
      .post(`/api/training-sessions/${sessionId}/exercises`)
      .send({ exercise_id: 999999 })
      .expect(404);

    expect(res.body.error).toBe("Exercise not found");

    await deleteTestUser(email8);
  });

  // ── GET /api/training-sessions — history list ──────────────────────────

  it("GET /api/training-sessions lists past sessions with completion summary", async () => {
    const email9 = `test-hist-${Date.now()}@example.com`;
    await createTestUser(email9);
    const agent9 = await loginAgent(email9, "testpassword");
    const { exerciseId } = await createExercise(agent9, `HistEx-${Date.now()}`);
    await createActiveTemplate(agent9, exerciseId, 1);

    // Create two sessions
    await agent9.get("/api/training-sessions/for-date/2026-05-25").expect(200);
    await agent9.get("/api/training-sessions/for-date/2026-05-26").expect(200);

    const list = await agent9.get("/api/training-sessions").expect(200);
    expect(list.body.length).toBeGreaterThanOrEqual(2);

    // Each entry should have id, date, completed_count, total_count
    for (const entry of list.body) {
      expect(typeof entry.id).toBe("number");
      expect(typeof entry.date).toBe("string");
      expect(typeof entry.completed_count).toBe("number");
      expect(typeof entry.total_count).toBe("number");
    }

    await deleteTestUser(email9);
  });

  // ── Zod validation ─────────────────────────────────────────────────────

  it("POST /api/training-sessions/:sessionId/exercises rejects missing exercise_id", async () => {
    const email10 = `test-zodval-${Date.now()}@example.com`;
    await createTestUser(email10);
    const agent10 = await loginAgent(email10, "testpassword");

    const sessionRes = await agent10
      .get("/api/training-sessions/for-date/2026-06-03")
      .expect(200);
    const sessionId = sessionRes.body.id;

    const res = await agent10
      .post(`/api/training-sessions/${sessionId}/exercises`)
      .send({})
      .expect(400);

    expect(res.body.error).toBe("Invalid request");

    await deleteTestUser(email10);
  });
});
