# Climbing Training Tracker

A personal webapp for tracking bouldering sessions and strength/conditioning training. Log climbing grades, plan weekly training, record exercise progress, and visualise trends over time.

## Features

- **Grade management** — configure the gym's grade system (name, difficulty, colour)
- **Exercise library** — CRUD for exercises with custom numeric fields (weight, duration, etc.) and categories
- **Week templates** — define a weekly training plan; assign exercises per weekday; activate one template at a time
- **Training sessions** — daily log pre-populated from the active template; mark exercises complete, record field values
- **Climbing sessions** — log bouldering visits with per-grade send/attempt counts
- **Progress charts** — scatter/trend chart of climbing grades over time; per-exercise line charts for numeric fields

## Tech stack

| Layer | Technology |
|---|---|
| Frontend | React 18, React Router 6, Recharts, Vite |
| Backend | Node.js, Express, TypeScript, Zod |
| Database | PostgreSQL 16 |
| Auth | Session cookies, Argon2 password hashing |
| Tests | Vitest + Supertest (integration, real DB) |
| Deploy | Docker Compose |

## Getting started

### Prerequisites

- Docker and Docker Compose
- Node.js 20+ (for local development)

### Run with Docker

```bash
docker compose up --build
```

- Frontend: http://localhost:5173
- Backend API: http://localhost:3001
- PostgreSQL: localhost:5432

### Local development

**Backend:**

```bash
cd backend
cp .env.example .env          # adjust DATABASE_URL if needed
npm install
npm run migrate               # run DB migrations
npm run seed-grades           # seed default 8-grade system
npm run create-user           # interactive prompt to create your account
npm run dev                   # starts with hot-reload on :3000
```

**Frontend:**

```bash
cd frontend
npm install
npm run dev                   # starts Vite dev server on :5173
```

### Running tests

```bash
cd backend
npm test
```

Tests run against a real PostgreSQL database. Set `DATABASE_URL` in `.env` before running.

## Project structure

```
.
├── backend/
│   ├── src/
│   │   ├── routes/           # Express route handlers
│   │   ├── db/               # migrations + query helpers
│   │   ├── middleware/        # auth, rate-limit
│   │   └── __tests__/        # integration tests
│   └── scripts/              # create-user, seed-grades
├── frontend/
│   └── src/
│       ├── pages/            # one component per route
│       ├── api.ts            # typed fetch helpers
│       └── App.tsx           # router
├── docker-compose.yml
└── CONTEXT.md                # domain glossary
```

## Domain model

See [CONTEXT.md](CONTEXT.md) for the full domain glossary. Key concepts:

- **Climbing Session** and **Training Session** are separate concerns — they can fall on the same day but are tracked independently.
- A **Week Template** defines the plan; a **Training Session** is the execution. Changing the template does not alter past sessions.
- **Grades** belong to climbing only. Exercise tracking uses numeric fields (kg, reps, sec).
