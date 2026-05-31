/**
 * Dashboard API tests
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
  // Remove climbing session entries before deleting grades (FK constraint)
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

async function loginAgent(email: string, password: string) {
  const agent = request.agent(app);
  await agent.post("/api/auth/login").send({ email, password }).expect(200);
  return agent;
}

// ── Suite ──────────────────────────────────────────────────────────────────

describe("Dashboard API", () => {
  const testEmail = `test-dashboard-${Date.now()}@example.com`;
  let agent: ReturnType<typeof request.agent>;

  beforeAll(async () => {
    await createTestUser(testEmail);
    agent = await loginAgent(testEmail, "testpassword");
  });

  afterAll(async () => {
    await deleteTestUser(testEmail);
  });

  it("GET /api/dashboard returns null values for a fresh user with no data", async () => {
    const res = await agent.get("/api/dashboard").expect(200);
    expect(res.body).toEqual({
      active_plan: null,
      today_session: null,
      recent_climbing: null,
    });
  });

  it("GET /api/dashboard returns the active plan name when a template is active", async () => {
    // Create and activate a week template
    const templateRes = await agent
      .post("/api/week-templates")
      .send({ name: "My Plan" })
      .expect(201);
    const templateId = templateRes.body.id as number;
    await agent.post(`/api/week-templates/${templateId}/activate`).expect(200);

    const res = await agent.get("/api/dashboard").expect(200);
    expect(res.body.active_plan).toEqual({ id: templateId, name: "My Plan" });
    expect(res.body.today_session).toBeNull();
    expect(res.body.recent_climbing).toBeNull();
  });

  it("GET /api/dashboard returns today_session when a training session exists for today", async () => {
    // Get-or-create today's training session via the training-sessions route
    const today = new Date().toISOString().slice(0, 10);
    await agent.get(`/api/training-sessions/for-date/${today}`).expect(200);

    const res = await agent.get("/api/dashboard").expect(200);
    expect(res.body.today_session).not.toBeNull();
    expect(res.body.today_session.date).toBe(today);
    expect(typeof res.body.today_session.completed_count).toBe("number");
    expect(typeof res.body.today_session.total_count).toBe("number");
  });

  it("GET /api/dashboard returns recent_climbing with top grade after a climbing session is logged", async () => {
    // Create a grade
    const gradeRes = await agent
      .post("/api/grades")
      .send({ name: "blau", difficulty: 4, color: "#0000ff" })
      .expect(201);
    const gradeId = gradeRes.body.id as number;

    // Create a climbing session
    const sessionDate = "2024-01-15";
    const sessionRes = await agent
      .post("/api/climbing-sessions")
      .send({ date: sessionDate })
      .expect(201);
    const sessionId = sessionRes.body.id as number;

    // Add an entry with a send
    await agent
      .post(`/api/climbing-sessions/${sessionId}/entries`)
      .send({ grade_id: gradeId, sends: 2, attempts: 3 })
      .expect(201);

    const res = await agent.get("/api/dashboard").expect(200);
    expect(res.body.recent_climbing).not.toBeNull();
    expect(res.body.recent_climbing.date).toBe(sessionDate);
    expect(res.body.recent_climbing.top_grade_name).toBe("blau");
    expect(res.body.recent_climbing.top_grade_difficulty).toBe(4);
  });

  it("GET /api/dashboard requires authentication", async () => {
    const unauthenticatedAgent = request.agent(app);
    await unauthenticatedAgent.get("/api/dashboard").expect(401);
  });
});
