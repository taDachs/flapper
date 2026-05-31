# Graph Report - .  (2026-05-31)

## Corpus Check
- Corpus is ~4,740 words - fits in a single context window. You may not need a graph.

## Summary
- 181 nodes · 222 edges · 19 communities (15 shown, 4 thin omitted)
- Extraction: 95% EXTRACTED · 5% INFERRED · 0% AMBIGUOUS · INFERRED: 11 edges (avg confidence: 0.89)
- Token cost: 10,000 input · 5,050 output

## Community Hubs (Navigation)
- [[_COMMUNITY_Frontend Auth & Routing|Frontend Auth & Routing]]
- [[_COMMUNITY_Backend Dependencies|Backend Dependencies]]
- [[_COMMUNITY_Frontend Dependencies|Frontend Dependencies]]
- [[_COMMUNITY_Backend Core & DB Layer|Backend Core & DB Layer]]
- [[_COMMUNITY_Climbing Domain Model|Climbing Domain Model]]
- [[_COMMUNITY_Frontend TypeScript Config|Frontend TypeScript Config]]
- [[_COMMUNITY_Backend TypeScript Config|Backend TypeScript Config]]
- [[_COMMUNITY_Auth Route Handlers|Auth Route Handlers]]
- [[_COMMUNITY_Monorepo Build Scripts|Monorepo Build Scripts]]
- [[_COMMUNITY_Backend Dev Dependencies|Backend Dev Dependencies]]
- [[_COMMUNITY_RALPH Agent Workflow|RALPH Agent Workflow]]
- [[_COMMUNITY_User Auth & Access Control|User Auth & Access Control]]
- [[_COMMUNITY_Agent Operation Docs|Agent Operation Docs]]
- [[_COMMUNITY_Claude Code Settings|Claude Code Settings]]
- [[_COMMUNITY_Session Type Definitions|Session Type Definitions]]
- [[_COMMUNITY_Docker Compose|Docker Compose]]
- [[_COMMUNITY_Local Settings|Local Settings]]

## God Nodes (most connected - your core abstractions)
1. `compilerOptions` - 13 edges
2. `001_initial.sql - Initial schema: all domain tables` - 12 edges
3. `compilerOptions` - 10 edges
4. `AuthProvider (React context provider)` - 9 edges
5. `useAuth()` - 8 edges
6. `Exercise - Named physical activity in global shared library` - 7 edges
7. `scripts` - 6 edges
8. `useAuth (custom hook)` - 6 edges
9. `scripts` - 5 edges
10. `main()` - 5 edges

## Surprising Connections (you probably didn't know these)
- `001_initial.sql - Initial schema: all domain tables` --implements--> `User - Account holder with email/password auth, no self-registration`  [EXTRACTED]
  backend/src/db/migrations/001_initial.sql → CONTEXT.md
- `Session-Cookie Auth Pattern - httpOnly cookie, 7-day maxAge, argon2 hashing` --conceptually_related_to--> `User - Account holder with email/password auth, no self-registration`  [INFERRED]
  backend/src/index.ts → CONTEXT.md
- `001_initial.sql - Initial schema: all domain tables` --implements--> `Exercise Field - Named numeric metric belonging to an Exercise`  [EXTRACTED]
  backend/src/db/migrations/001_initial.sql → CONTEXT.md
- `001_initial.sql - Initial schema: all domain tables` --implements--> `Grade - Difficulty level with name, integer difficulty, optional color`  [EXTRACTED]
  backend/src/db/migrations/001_initial.sql → CONTEXT.md
- `No Self-Registration - Users created only via CLI seed script` --rationale_for--> `create-user.ts - CLI seed script to create user accounts (no self-registration)`  [INFERRED]
  CONTEXT.md → backend/scripts/create-user.ts

## Import Cycles
- None detected.

## Hyperedges (group relationships)
- **RALPH Loop Agent Pipeline - orchestrator spawns workers, merger merges PRs** — agents_ralph_orchestrator, agents_ralph_worker, agents_ralph_merger [EXTRACTED 1.00]
- **Backend Startup Flow - index calls migrate then listens using pool** — src_index_start, db_run_migrate, db_pool [EXTRACTED 1.00]
- **Training Plan-to-Execution Model - Week Template drives Sessions via Training Days** — context_week_template_concept, context_training_day_concept, context_training_session_concept, context_training_day_exercise_concept, context_training_session_exercise_concept [EXTRACTED 1.00]
- **Full-Stack Authentication Flow (backend routes + frontend context + API client)** — routes_auth_login_endpoint, routes_auth_logout_endpoint, routes_auth_me_endpoint, src_authcontext_auth_provider, src_api_api_post, src_api_api_get [INFERRED 0.95]
- **Route Protection Pattern (guards + auth context + routing)** — src_app_require_auth, src_app_redirect_if_authed, src_authcontext_use_auth, src_app_app_routes [EXTRACTED 1.00]
- **Agent Workflow Documentation (domain + issue tracker + triage labels)** — agents_domain_domain_docs, agents_issue_tracker_issue_tracker, agents_triage_labels_triage_labels [INFERRED 0.85]

## Communities (19 total, 4 thin omitted)

### Community 0 - "Frontend Auth & Routing"
Cohesion: 0.14
Nodes (18): Route Protection via Auth Guards, Dashboard(), handleSubmit (login form handler), Login(), apiGet(), apiPost(), App(), AppRoutes (routing component) (+10 more)

### Community 1 - "Backend Dependencies"
Cohesion: 0.10
Nodes (19): dependencies, argon2, cookie-parser, dotenv, express, express-rate-limit, express-session, pg (+11 more)

### Community 2 - "Frontend Dependencies"
Cohesion: 0.11
Nodes (18): dependencies, react, react-dom, react-router-dom, devDependencies, @types/react, @types/react-dom, typescript (+10 more)

### Community 3 - "Backend Core & DB Layer"
Cohesion: 0.16
Nodes (11): db/migrate.ts - Standalone migration runner script (CLI entrypoint), db/pool.ts - PostgreSQL connection pool singleton (DATABASE_URL), pool, runMigrate() - Applies pending SQL migrations from disk using schema_migrations table, MIGRATIONS_DIR, requireAuth(), main(), parseArgs() (+3 more)

### Community 4 - "Climbing Domain Model"
Cohesion: 0.26
Nodes (15): Category - Free-form grouping for Exercises, Climbing Session - Logged bouldering/climbing visit on a specific date, Climbing Session Entry - Single Grade attempted in a Climbing Session with sends/attempts, Exercise-Climbing Separation Boundary - Separate tracking concerns never mixed in same record, Exercise - Named physical activity in global shared library, Exercise Field - Named numeric metric belonging to an Exercise, Grade - Difficulty level with name, integer difficulty, optional color, Exercise Soft Delete - Archive instead of hard delete when log entries exist (+7 more)

### Community 5 - "Frontend TypeScript Config"
Cohesion: 0.13
Nodes (14): compilerOptions, allowImportingTsExtensions, isolatedModules, jsx, lib, module, moduleResolution, noEmit (+6 more)

### Community 6 - "Backend TypeScript Config"
Cohesion: 0.15
Nodes (12): compilerOptions, esModuleInterop, module, moduleResolution, outDir, resolveJsonModule, rootDir, skipLibCheck (+4 more)

### Community 7 - "Auth Route Handlers"
Cohesion: 0.24
Nodes (12): Frontend Auth Context Flow, Session-based Authentication Pattern, POST /auth/login endpoint, loginLimiter, loginSchema, POST /auth/logout endpoint, GET /auth/me endpoint, router (+4 more)

### Community 8 - "Monorepo Build Scripts"
Cohesion: 0.22
Nodes (8): name, private, scripts, build, create-user, dev:backend, dev:frontend, version

### Community 9 - "Backend Dev Dependencies"
Cohesion: 0.25
Nodes (8): devDependencies, tsx, @types/cookie-parser, @types/express, @types/express-session, @types/node, @types/pg, typescript

### Community 10 - "RALPH Agent Workflow"
Cohesion: 0.48
Nodes (7): ralph-merger Agent - Merges PRs from RALPH loop workers with CI gating, ralph-orchestrator Agent - Coordinates parallel issue implementation, ralph-worker Agent - Implements a single GitHub issue in an isolated worktree, CLAUDE.md - Project Agent Instructions, CONTEXT.md - Domain Context: Climbing Training Tracker, RALPH Loop Reference - Conflict handling, merge ordering, CI gating, labels, RALPH Loop Skill - Recursive Autonomous Loop for Parallel Handling

### Community 11 - "User Auth & Access Control"
Cohesion: 0.47
Nodes (6): No Self-Registration - Users created only via CLI seed script, User - Account holder with email/password auth, no self-registration, requireAuth() - Express middleware: 401 if no session.userId, create-user.ts - CLI seed script to create user accounts (no self-registration), Session-Cookie Auth Pattern - httpOnly cookie, 7-day maxAge, argon2 hashing, session.d.ts - Express session type augmentation adding userId to SessionData

### Community 12 - "Agent Operation Docs"
Cohesion: 0.50
Nodes (4): Domain Docs Agent Skill, Issue Tracker Agent Skill (GitHub Issues), Triage Labels Configuration, Triage Workflow for Issues

## Knowledge Gaps
- **88 isolated node(s):** `name`, `version`, `private`, `dev:backend`, `dev:frontend` (+83 more)
  These have ≤1 connection - possible missing edges or undocumented components.
- **4 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `AuthProvider (React context provider)` connect `Auth Route Handlers` to `Frontend Auth & Routing`?**
  _High betweenness centrality (0.090) - this node is a cross-community bridge._
- **Why does `runMigrate() - Applies pending SQL migrations from disk using schema_migrations table` connect `Backend Core & DB Layer` to `Climbing Domain Model`?**
  _High betweenness centrality (0.059) - this node is a cross-community bridge._
- **Are the 3 inferred relationships involving `AuthProvider (React context provider)` (e.g. with `POST /auth/login endpoint` and `POST /auth/logout endpoint`) actually correct?**
  _`AuthProvider (React context provider)` has 3 INFERRED edges - model-reasoned connections that need verification._
- **What connects `name`, `version`, `private` to the rest of the system?**
  _89 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `Frontend Auth & Routing` be split into smaller, more focused modules?**
  _Cohesion score 0.14 - nodes in this community are weakly interconnected._
- **Should `Backend Dependencies` be split into smaller, more focused modules?**
  _Cohesion score 0.1 - nodes in this community are weakly interconnected._
- **Should `Frontend Dependencies` be split into smaller, more focused modules?**
  _Cohesion score 0.10526315789473684 - nodes in this community are weakly interconnected._