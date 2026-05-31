CREATE TABLE IF NOT EXISTS users (
  id          SERIAL PRIMARY KEY,
  email       TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS exercises (
  id                SERIAL PRIMARY KEY,
  user_id           INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name              TEXT NOT NULL,
  category          TEXT NOT NULL,
  description       TEXT,
  default_sets_reps TEXT,
  archived_at       TIMESTAMPTZ,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS exercise_fields (
  id            SERIAL PRIMARY KEY,
  exercise_id   INTEGER NOT NULL REFERENCES exercises(id) ON DELETE CASCADE,
  name          TEXT NOT NULL,
  unit          TEXT,
  display_order INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS grades (
  id            SERIAL PRIMARY KEY,
  user_id       INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name          TEXT NOT NULL,
  difficulty    INTEGER NOT NULL,
  color         TEXT,
  display_order INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS week_templates (
  id        SERIAL PRIMARY KEY,
  user_id   INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name      TEXT NOT NULL,
  is_active BOOLEAN NOT NULL DEFAULT FALSE
);

CREATE TABLE IF NOT EXISTS week_template_days (
  id                SERIAL PRIMARY KEY,
  template_id       INTEGER NOT NULL REFERENCES week_templates(id) ON DELETE CASCADE,
  weekday           SMALLINT NOT NULL CHECK (weekday BETWEEN 0 AND 6),
  includes_climbing BOOLEAN NOT NULL DEFAULT FALSE
);

CREATE TABLE IF NOT EXISTS week_template_day_exercises (
  id                SERIAL PRIMARY KEY,
  day_id            INTEGER NOT NULL REFERENCES week_template_days(id) ON DELETE CASCADE,
  exercise_id       INTEGER NOT NULL REFERENCES exercises(id) ON DELETE CASCADE,
  sets_reps_override TEXT,
  display_order     INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS training_sessions (
  id      SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  date    DATE NOT NULL,
  weekday SMALLINT NOT NULL CHECK (weekday BETWEEN 0 AND 6)
);

CREATE TABLE IF NOT EXISTS training_session_exercises (
  id          SERIAL PRIMARY KEY,
  session_id  INTEGER NOT NULL REFERENCES training_sessions(id) ON DELETE CASCADE,
  exercise_id INTEGER NOT NULL REFERENCES exercises(id) ON DELETE CASCADE,
  completed   BOOLEAN NOT NULL DEFAULT FALSE,
  sets_reps_note TEXT
);

CREATE TABLE IF NOT EXISTS training_session_field_values (
  id                   SERIAL PRIMARY KEY,
  session_exercise_id  INTEGER NOT NULL REFERENCES training_session_exercises(id) ON DELETE CASCADE,
  field_id             INTEGER NOT NULL REFERENCES exercise_fields(id) ON DELETE CASCADE,
  value                NUMERIC NOT NULL
);

CREATE TABLE IF NOT EXISTS climbing_sessions (
  id      SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  date    DATE NOT NULL
);

CREATE TABLE IF NOT EXISTS climbing_session_entries (
  id                  SERIAL PRIMARY KEY,
  climbing_session_id INTEGER NOT NULL REFERENCES climbing_sessions(id) ON DELETE CASCADE,
  grade_id            INTEGER NOT NULL REFERENCES grades(id) ON DELETE RESTRICT,
  sends               INTEGER NOT NULL DEFAULT 0,
  attempts            INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS schema_migrations (
  version TEXT PRIMARY KEY,
  applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
