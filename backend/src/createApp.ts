import express from "express";
import session from "express-session";
import cookieParser from "cookie-parser";
import authRouter from "./routes/auth.js";
import gradesRouter from "./routes/grades.js";
import exercisesRouter from "./routes/exercises.js";
import climbingSessionsRouter from "./routes/climbingSessions.js";
import weekTemplatesRouter from "./routes/weekTemplates.js";
import { requireAuth } from "./middleware/requireAuth.js";

export function createApp() {
  const app = express();

  app.use(express.json());
  app.use(cookieParser());

  app.use(
    session({
      secret: "test-secret",
      resave: false,
      saveUninitialized: false,
      cookie: {
        httpOnly: true,
        secure: false,
        sameSite: "strict",
      },
    })
  );

  app.use("/api/auth", authRouter);
  app.use("/api", requireAuth);

  app.get("/api/ping", (_req, res) => {
    res.json({ ok: true });
  });

  app.use("/api/grades", gradesRouter);
  app.use("/api/exercises", exercisesRouter);
  app.use("/api/climbing-sessions", climbingSessionsRouter);
  app.use("/api/week-templates", weekTemplatesRouter);

  return app;
}
