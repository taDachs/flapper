import { Router } from "express";
import argon2 from "argon2";
import rateLimit from "express-rate-limit";
import { z } from "zod";
import pool from "../db/pool.js";

const router = Router();

const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Too many login attempts, please try again later." },
});

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

router.post("/login", loginLimiter, async (req, res) => {
  const result = loginSchema.safeParse(req.body);
  if (!result.success) {
    res.status(400).json({ error: "Invalid request" });
    return;
  }

  const { email, password } = result.data;
  const { rows } = await pool.query<{ id: number; password_hash: string }>(
    "SELECT id, password_hash FROM users WHERE email = $1",
    [email]
  );

  const user = rows[0];
  if (!user || !(await argon2.verify(user.password_hash, password))) {
    res.status(401).json({ error: "Invalid email or password" });
    return;
  }

  req.session.userId = user.id;
  req.session.save((err) => {
    if (err) {
      res.status(500).json({ error: "Session error" });
      return;
    }
    res.json({ ok: true });
  });
});

router.post("/logout", (req, res) => {
  req.session.destroy((err) => {
    if (err) {
      res.status(500).json({ error: "Logout failed" });
      return;
    }
    res.clearCookie("connect.sid");
    res.json({ ok: true });
  });
});

router.get("/me", (req, res) => {
  if (req.session?.userId) {
    res.json({ userId: req.session.userId });
  } else {
    res.status(401).json({ error: "Not authenticated" });
  }
});

export default router;
