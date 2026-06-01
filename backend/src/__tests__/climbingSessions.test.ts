/**
 * Climbing Sessions API tests
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
  // Delete climbing session entries first (grade FK is RESTRICT, so entries must go before grades)
  await pool.query(`
    DELETE FROM climbing_session_entries
    WHERE climbing_session_id IN (
      SELECT cs.id FROM climbing_sessions cs
      JOIN users u ON u.id = cs.user_id
      WHERE u.email = $1
    )
  `, [email]);
  await pool.query("DELETE FROM users WHERE email = $1", [email]);
}

/** Returns an authenticated supertest agent for the given credentials. */
async function loginAgent(email: string, password: string) {
  const agent = request.agent(app);
  await agent.post("/api/auth/login").send({ email, password }).expect(200);
  return agent;
}

// ── Suite ────────────────────────────────────────────────────────────────

describe("Climbing Sessions API", () => {
  const testEmail = `test-climbing-${Date.now()}@example.com`;
  let userId: number;
  let agent: ReturnType<typeof request.agent>;
  let gradeId: number;

  beforeAll(async () => {
    userId = await createTestUser(testEmail);
    agent = await loginAgent(testEmail, "testpassword");

    // Create a test grade to use in entries
    const res = await agent
      .post("/api/grades")
      .send({ name: "blau", difficulty: 4, color: "#0000ff" })
      .expect(201);
    gradeId = res.body.id;
  });

  afterAll(async () => {
    await deleteTestUser(testEmail);
  });

  // ── Tracer bullet ─────────────────────────────────────────────────────

  it("GET /api/climbing-sessions returns an empty list for a fresh user", async () => {
    const res = await agent.get("/api/climbing-sessions").expect(200);
    expect(res.body).toEqual([]);
  });

  // ── Create session ────────────────────────────────────────────────────

  it("POST /api/climbing-sessions creates a session for today", async () => {
    const today = new Date().toISOString().slice(0, 10);
    const res = await agent
      .post("/api/climbing-sessions")
      .send({ date: today })
      .expect(201);

    expect(res.body).toMatchObject({ date: today, entries: [] });
    expect(typeof res.body.id).toBe("number");
  });

  it("POST /api/climbing-sessions creates a session for a specific date", async () => {
    const res = await agent
      .post("/api/climbing-sessions")
      .send({ date: "2024-03-15" })
      .expect(201);

    expect(res.body).toMatchObject({ date: "2024-03-15", entries: [] });
  });

  it("POST /api/climbing-sessions rejects a request with missing date", async () => {
    const res = await agent
      .post("/api/climbing-sessions")
      .send({})
      .expect(400);
    expect(res.body.error).toBe("Invalid request");
  });

  it("POST /api/climbing-sessions rejects an invalid date", async () => {
    const res = await agent
      .post("/api/climbing-sessions")
      .send({ date: "not-a-date" })
      .expect(400);
    expect(res.body.error).toBe("Invalid request");
  });

  // ── List sessions ─────────────────────────────────────────────────────

  it("GET /api/climbing-sessions lists sessions in reverse-chronological order", async () => {
    const email2 = `test-climbing-list-${Date.now()}@example.com`;
    await createTestUser(email2);
    const agent2 = await loginAgent(email2, "testpassword");

    // Create a grade for agent2
    const gradeRes = await agent2
      .post("/api/grades")
      .send({ name: "gelb", difficulty: 2, color: "#ffff00" })
      .expect(201);
    const gradeId2 = gradeRes.body.id;

    await agent2.post("/api/climbing-sessions").send({ date: "2024-01-10" }).expect(201);
    await agent2.post("/api/climbing-sessions").send({ date: "2024-03-05" }).expect(201);
    await agent2.post("/api/climbing-sessions").send({ date: "2024-02-20" }).expect(201);

    const res = await agent2.get("/api/climbing-sessions").expect(200);
    const dates = res.body.map((s: { date: string }) => s.date);
    expect(dates).toEqual(["2024-03-05", "2024-02-20", "2024-01-10"]);

    // cleanup
    await deleteTestUser(email2);
    void gradeId2;
  });

  it("GET /api/climbing-sessions returns entries nested inside each session", async () => {
    const email3 = `test-climbing-entries-${Date.now()}@example.com`;
    await createTestUser(email3);
    const agent3 = await loginAgent(email3, "testpassword");

    // Create grade for agent3
    const gradeRes3 = await agent3
      .post("/api/grades")
      .send({ name: "rot", difficulty: 6, color: "#ff0000" })
      .expect(201);
    const gradeId3 = gradeRes3.body.id;

    const sessionRes = await agent3
      .post("/api/climbing-sessions")
      .send({ date: "2024-05-01" })
      .expect(201);
    const sessionId3 = sessionRes.body.id;

    await agent3
      .post(`/api/climbing-sessions/${sessionId3}/entries`)
      .send({ grade_id: gradeId3, sends: 2, attempts: 5 })
      .expect(201);

    const listRes = await agent3.get("/api/climbing-sessions").expect(200);
    const session = listRes.body.find((s: { id: number }) => s.id === sessionId3);
    expect(session).toBeDefined();
    expect(session.entries).toHaveLength(1);
    expect(session.entries[0]).toMatchObject({
      grade_id: gradeId3,
      sends: 2,
      attempts: 5,
    });
    expect(session.entries[0].grade_name).toBe("rot");

    // Delete session first so entries are removed before grade deletion on user cleanup
    await agent3.delete(`/api/climbing-sessions/${sessionId3}`).expect(200);
    await deleteTestUser(email3);
  });

  // ── Add entries ───────────────────────────────────────────────────────

  it("POST /api/climbing-sessions/:id/entries adds an entry", async () => {
    const sessionRes = await agent
      .post("/api/climbing-sessions")
      .send({ date: "2024-06-01" })
      .expect(201);
    const sessionId = sessionRes.body.id;

    const res = await agent
      .post(`/api/climbing-sessions/${sessionId}/entries`)
      .send({ grade_id: gradeId, sends: 3, attempts: 7 })
      .expect(201);

    expect(res.body).toMatchObject({
      climbing_session_id: sessionId,
      grade_id: gradeId,
      sends: 3,
      attempts: 7,
    });
    expect(typeof res.body.id).toBe("number");
  });

  it("POST /api/climbing-sessions/:id/entries rejects invalid entry data", async () => {
    const sessionRes = await agent
      .post("/api/climbing-sessions")
      .send({ date: "2024-06-02" })
      .expect(201);
    const sessionId = sessionRes.body.id;

    // Missing grade_id
    const res = await agent
      .post(`/api/climbing-sessions/${sessionId}/entries`)
      .send({ sends: 1, attempts: 2 })
      .expect(400);
    expect(res.body.error).toBe("Invalid request");
  });

  it("POST /api/climbing-sessions/:id/entries returns 404 for unknown session", async () => {
    const res = await agent
      .post("/api/climbing-sessions/999999/entries")
      .send({ grade_id: gradeId, sends: 1, attempts: 2 })
      .expect(404);
    expect(res.body.error).toMatch(/not found/i);
  });

  it("POST /api/climbing-sessions/:id/entries rejects negative sends", async () => {
    const sessionRes = await agent
      .post("/api/climbing-sessions")
      .send({ date: "2024-06-03" })
      .expect(201);
    const sessionId = sessionRes.body.id;

    const res = await agent
      .post(`/api/climbing-sessions/${sessionId}/entries`)
      .send({ grade_id: gradeId, sends: -1, attempts: 2 })
      .expect(400);
    expect(res.body.error).toBe("Invalid request");
  });

  // ── Delete entry ──────────────────────────────────────────────────────

  it("DELETE /api/climbing-sessions/:sessionId/entries/:entryId deletes an entry", async () => {
    const sessionRes = await agent
      .post("/api/climbing-sessions")
      .send({ date: "2024-07-01" })
      .expect(201);
    const sessionId = sessionRes.body.id;

    const entryRes = await agent
      .post(`/api/climbing-sessions/${sessionId}/entries`)
      .send({ grade_id: gradeId, sends: 1, attempts: 3 })
      .expect(201);
    const entryId = entryRes.body.id;

    await agent
      .delete(`/api/climbing-sessions/${sessionId}/entries/${entryId}`)
      .expect(200);

    // Verify it's gone from the session list
    const listRes = await agent.get("/api/climbing-sessions").expect(200);
    const session = listRes.body.find((s: { id: number }) => s.id === sessionId);
    expect(session.entries.find((e: { id: number }) => e.id === entryId)).toBeUndefined();
  });

  it("DELETE /api/climbing-sessions/:sessionId/entries/:entryId returns 404 for unknown entry", async () => {
    const sessionRes = await agent
      .post("/api/climbing-sessions")
      .send({ date: "2024-07-02" })
      .expect(201);
    const sessionId = sessionRes.body.id;

    const res = await agent
      .delete(`/api/climbing-sessions/${sessionId}/entries/999999`)
      .expect(404);
    expect(res.body.error).toMatch(/not found/i);
  });

  // ── Delete session ────────────────────────────────────────────────────

  it("DELETE /api/climbing-sessions/:id deletes a session and its entries", async () => {
    const sessionRes = await agent
      .post("/api/climbing-sessions")
      .send({ date: "2024-08-01" })
      .expect(201);
    const sessionId = sessionRes.body.id;

    // Add an entry
    await agent
      .post(`/api/climbing-sessions/${sessionId}/entries`)
      .send({ grade_id: gradeId, sends: 2, attempts: 4 })
      .expect(201);

    // Delete the session
    await agent.delete(`/api/climbing-sessions/${sessionId}`).expect(200);

    // Verify session is gone from the list
    const listRes = await agent.get("/api/climbing-sessions").expect(200);
    const found = listRes.body.find((s: { id: number }) => s.id === sessionId);
    expect(found).toBeUndefined();

    // Verify entries were cascade-deleted
    const { rows } = await pool.query(
      "SELECT id FROM climbing_session_entries WHERE climbing_session_id = $1",
      [sessionId]
    );
    expect(rows).toHaveLength(0);
  });

  it("DELETE /api/climbing-sessions/:id returns 404 for unknown session", async () => {
    const res = await agent.delete("/api/climbing-sessions/999999").expect(404);
    expect(res.body.error).toMatch(/not found/i);
  });

  // ── Edit session date ─────────────────────────────────────────────────

  it("PATCH /api/climbing-sessions/:id updates the session date", async () => {
    const sessionRes = await agent
      .post("/api/climbing-sessions")
      .send({ date: "2024-09-10" })
      .expect(201);
    const sessionId = sessionRes.body.id;

    const res = await agent
      .patch(`/api/climbing-sessions/${sessionId}`)
      .send({ date: "2024-09-15" })
      .expect(200);

    expect(res.body).toMatchObject({ id: sessionId, date: "2024-09-15" });

    // Verify in the list
    const listRes = await agent.get("/api/climbing-sessions").expect(200);
    const found = listRes.body.find((s: { id: number }) => s.id === sessionId);
    expect(found?.date).toBe("2024-09-15");
  });

  it("PATCH /api/climbing-sessions/:id rejects an invalid date", async () => {
    const sessionRes = await agent
      .post("/api/climbing-sessions")
      .send({ date: "2024-09-20" })
      .expect(201);
    const sessionId = sessionRes.body.id;

    const res = await agent
      .patch(`/api/climbing-sessions/${sessionId}`)
      .send({ date: "not-a-date" })
      .expect(400);
    expect(res.body.error).toBe("Invalid request");
  });

  it("PATCH /api/climbing-sessions/:id returns 404 for unknown session", async () => {
    const res = await agent
      .patch("/api/climbing-sessions/999999")
      .send({ date: "2024-09-25" })
      .expect(404);
    expect(res.body.error).toMatch(/not found/i);
  });

  // ── Edit entry ────────────────────────────────────────────────────────

  it("PATCH /api/climbing-sessions/:sessionId/entries/:entryId updates an entry", async () => {
    const sessionRes = await agent
      .post("/api/climbing-sessions")
      .send({ date: "2024-10-10" })
      .expect(201);
    const sessionId = sessionRes.body.id;

    const entryRes = await agent
      .post(`/api/climbing-sessions/${sessionId}/entries`)
      .send({ grade_id: gradeId, sends: 1, attempts: 3 })
      .expect(201);
    const entryId = entryRes.body.id;

    const res = await agent
      .patch(`/api/climbing-sessions/${sessionId}/entries/${entryId}`)
      .send({ grade_id: gradeId, sends: 3, attempts: 5 })
      .expect(200);

    expect(res.body).toMatchObject({
      id: entryId,
      climbing_session_id: sessionId,
      grade_id: gradeId,
      sends: 3,
      attempts: 5,
    });

    // Verify in the list
    const listRes = await agent.get("/api/climbing-sessions").expect(200);
    const session = listRes.body.find((s: { id: number }) => s.id === sessionId);
    const entry = session?.entries.find((e: { id: number }) => e.id === entryId);
    expect(entry?.sends).toBe(3);
    expect(entry?.attempts).toBe(5);
  });

  it("PATCH /api/climbing-sessions/:sessionId/entries/:entryId rejects invalid data", async () => {
    const sessionRes = await agent
      .post("/api/climbing-sessions")
      .send({ date: "2024-10-12" })
      .expect(201);
    const sessionId = sessionRes.body.id;

    const entryRes = await agent
      .post(`/api/climbing-sessions/${sessionId}/entries`)
      .send({ grade_id: gradeId, sends: 1, attempts: 2 })
      .expect(201);
    const entryId = entryRes.body.id;

    // Missing grade_id
    const res = await agent
      .patch(`/api/climbing-sessions/${sessionId}/entries/${entryId}`)
      .send({ sends: 2, attempts: 3 })
      .expect(400);
    expect(res.body.error).toBe("Invalid request");
  });

  it("PATCH /api/climbing-sessions/:sessionId/entries/:entryId returns 404 for unknown entry", async () => {
    const sessionRes = await agent
      .post("/api/climbing-sessions")
      .send({ date: "2024-10-14" })
      .expect(201);
    const sessionId = sessionRes.body.id;

    const res = await agent
      .patch(`/api/climbing-sessions/${sessionId}/entries/999999`)
      .send({ grade_id: gradeId, sends: 1, attempts: 2 })
      .expect(404);
    expect(res.body.error).toMatch(/not found/i);
  });

  // ── Isolation: user can only see own sessions ─────────────────────────

  it("GET /api/climbing-sessions does not show sessions of other users", async () => {
    const emailOther = `test-climbing-other-${Date.now()}@example.com`;
    await createTestUser(emailOther);
    const agentOther = await loginAgent(emailOther, "testpassword");

    const sessionRes = await agentOther
      .post("/api/climbing-sessions")
      .send({ date: "2024-09-01" })
      .expect(201);
    const otherSessionId = sessionRes.body.id;

    // Our agent should not see the other user's session
    const listRes = await agent.get("/api/climbing-sessions").expect(200);
    const found = listRes.body.find((s: { id: number }) => s.id === otherSessionId);
    expect(found).toBeUndefined();

    await deleteTestUser(emailOther);
  });
});

// ── Progress endpoint ─────────────────────────────────────────────────────

describe("Climbing Progress API", () => {
  const testEmail = `test-climbing-progress-${Date.now()}@example.com`;
  let agent: ReturnType<typeof request.agent>;
  let gradeBlauId: number;
  let gradeRotId: number;

  beforeAll(async () => {
    await createTestUser(testEmail);
    agent = await loginAgent(testEmail, "testpassword");

    const blauRes = await agent
      .post("/api/grades")
      .send({ name: "blau", difficulty: 4, color: "#0000ff" })
      .expect(201);
    gradeBlauId = blauRes.body.id;

    const rotRes = await agent
      .post("/api/grades")
      .send({ name: "rot", difficulty: 6, color: "#ff0000" })
      .expect(201);
    gradeRotId = rotRes.body.id;
  });

  afterAll(async () => {
    await deleteTestUser(testEmail);
  });

  it("GET /api/climbing-sessions/progress returns empty array when no sessions exist", async () => {
    const res = await agent.get("/api/climbing-sessions/progress").expect(200);
    expect(res.body).toEqual([]);
  });

  it("GET /api/climbing-sessions/progress returns flat entries with session date and grade info", async () => {
    // Create two sessions with entries
    const s1 = await agent
      .post("/api/climbing-sessions")
      .send({ date: "2024-10-01" })
      .expect(201);
    const s2 = await agent
      .post("/api/climbing-sessions")
      .send({ date: "2024-10-15" })
      .expect(201);

    await agent
      .post(`/api/climbing-sessions/${s1.body.id}/entries`)
      .send({ grade_id: gradeBlauId, sends: 3, attempts: 5 })
      .expect(201);
    await agent
      .post(`/api/climbing-sessions/${s2.body.id}/entries`)
      .send({ grade_id: gradeRotId, sends: 1, attempts: 4 })
      .expect(201);

    const res = await agent.get("/api/climbing-sessions/progress").expect(200);
    expect(res.body).toHaveLength(2);

    const entry1 = res.body[0];
    expect(entry1).toMatchObject({
      date: "2024-10-01",
      grade_name: "blau",
      grade_difficulty: 4,
      sends: 3,
      attempts: 5,
    });
    expect(entry1.grade_color).toBe("#0000ff");

    const entry2 = res.body[1];
    expect(entry2).toMatchObject({
      date: "2024-10-15",
      grade_name: "rot",
      grade_difficulty: 6,
      sends: 1,
      attempts: 4,
    });
  });

  it("GET /api/climbing-sessions/progress returns entries in chronological order", async () => {
    const emailOrder = `test-progress-order-${Date.now()}@example.com`;
    await createTestUser(emailOrder);
    const agentOrder = await loginAgent(emailOrder, "testpassword");

    const gradeRes = await agentOrder
      .post("/api/grades")
      .send({ name: "gelb", difficulty: 2, color: "#ffff00" })
      .expect(201);
    const gId = gradeRes.body.id;

    const sA = await agentOrder
      .post("/api/climbing-sessions")
      .send({ date: "2024-12-20" })
      .expect(201);
    const sB = await agentOrder
      .post("/api/climbing-sessions")
      .send({ date: "2024-12-01" })
      .expect(201);

    await agentOrder
      .post(`/api/climbing-sessions/${sA.body.id}/entries`)
      .send({ grade_id: gId, sends: 1, attempts: 2 })
      .expect(201);
    await agentOrder
      .post(`/api/climbing-sessions/${sB.body.id}/entries`)
      .send({ grade_id: gId, sends: 2, attempts: 3 })
      .expect(201);

    const res = await agentOrder.get("/api/climbing-sessions/progress").expect(200);
    const dates = res.body.map((e: { date: string }) => e.date);
    expect(dates).toEqual(["2024-12-01", "2024-12-20"]);

    await deleteTestUser(emailOrder);
  });

  it("GET /api/climbing-sessions/progress does not return other users' entries", async () => {
    const emailOther = `test-progress-other-${Date.now()}@example.com`;
    await createTestUser(emailOther);
    const agentOther = await loginAgent(emailOther, "testpassword");

    const gradeRes = await agentOther
      .post("/api/grades")
      .send({ name: "gruen", difficulty: 3, color: "#00ff00" })
      .expect(201);
    const gIdOther = gradeRes.body.id;

    const sOther = await agentOther
      .post("/api/climbing-sessions")
      .send({ date: "2024-11-01" })
      .expect(201);
    const entryRes = await agentOther
      .post(`/api/climbing-sessions/${sOther.body.id}/entries`)
      .send({ grade_id: gIdOther, sends: 1, attempts: 2 })
      .expect(201);

    // Our agent should not see other user's entries
    const res = await agent.get("/api/climbing-sessions/progress").expect(200);
    const found = res.body.find((e: { entry_id: number }) => e.entry_id === entryRes.body.id);
    expect(found).toBeUndefined();

    await deleteTestUser(emailOther);
  });
});
