import "dotenv/config";
import express from "express";
import session from "express-session";
import cookieParser from "cookie-parser";
import authRouter from "./routes/auth.js";
import { requireAuth } from "./middleware/requireAuth.js";
import migrate from "./db/runMigrate.js";

const app = express();
const PORT = process.env.PORT ?? 3000;

if (process.env.TRUST_PROXY === "1") {
  app.set("trust proxy", 1);
}

app.use(express.json());
app.use(cookieParser());

app.use(
  session({
    secret: process.env.SESSION_SECRET ?? "dev-secret-change-me",
    resave: false,
    saveUninitialized: false,
    cookie: {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "strict",
      maxAge: 7 * 24 * 60 * 60 * 1000,
    },
  })
);

app.use("/api/auth", authRouter);

// All routes below require authentication
app.use("/api", requireAuth);

app.get("/api/ping", (_req, res) => {
  res.json({ ok: true });
});

async function start() {
  await migrate();
  app.listen(PORT, () => {
    console.log(`Backend listening on port ${PORT}`);
  });
}

start().catch((err) => {
  console.error("Startup failed:", err);
  process.exit(1);
});
