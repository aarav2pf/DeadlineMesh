# DeadlineMesh

**DeadlineMesh** is a full-stack project and deadline management application built around task dependencies and schedule analysis. In addition to project/task CRUD, it calculates critical paths, highlights blocked work, evaluates schedule risk, and simulates the effect of delaying a task.

- **Live app:** https://deadlinemesh.onrender.com
- **Repository:** https://github.com/aarav2pf/DeadlineMesh
- **Backend health endpoint:** https://deadlinemesh-api.onrender.com/api/health

## Features

### Project and task management

- JWT-based signup and login.
- Create, edit, and delete projects and tasks.
- Project deadlines, task start dates, durations, status, and priority.
- Task dependencies with validation for self-dependencies, cross-project dependencies, and circular dependency chains.
- Blocked-task detection and dependency-aware task completion.
- Project-local task display numbers, independent of database IDs.
- CSV schedule export.

### Scheduling and analysis

- **Critical Path Method (CPM):** calculates earliest and latest start/finish times, slack, project duration, and critical tasks.
- **Task dependency graph:** visualizes prerequisite relationships and dependent tasks.
- **Timeline/Gantt view:** presents tasks against the calculated schedule.
- **Schedule risk analysis:** classifies task risk using dependency state, critical-path membership, and available slack.
- **What-if delay simulation:** estimates how adding duration to a task changes the overall project schedule without modifying the saved task durations.
- **Schedule health and deadline tracking:** helps surface progress and deadline concerns.

### UX and security

- Retro-inspired desktop interface.
- Keyboard-friendly navigation, visible focus styling, and Escape-to-close dialogs where supported.
- Client-side validation for signup and login forms, backed by server-side validation.
- Password hashing and signed JWT access tokens.
- Ownership checks so project and task operations are scoped to the authenticated user.
- IP-based rate limiting on login and signup endpoints.

## Technology stack

| Layer | Technologies |
|---|---|
| Frontend | React, TypeScript, Vite, React Router |
| Graph visualization | `@xyflow/react` |
| UI icons | `lucide-react` |
| Backend | Node.js, Express, TypeScript |
| Database | PostgreSQL (hosted on Supabase in production) |
| Authentication | JWT (`jsonwebtoken`) and `bcryptjs` password hashing |
| Validation | Client-side form validation and server-side input validation |
| Deployment | Render Static Site (frontend), Render Web Service (API), Supabase (database) |

## Architecture

```mermaid
flowchart LR
    U[Browser] -->|React UI| FE[React + Vite frontend]
    FE -->|JSON / Bearer JWT| API[Express API]
    API --> AUTH[Authentication middleware]
    API --> SCHED[CPM / Risk / What-if services]
    API --> DB[(PostgreSQL / Supabase)]
    AUTH --> DB
```

The frontend communicates with the API through a shared request helper. Protected API routes require a bearer token. Project and task access is checked against the authenticated user's ownership. Scheduling analysis is calculated from each project's tasks and dependency edges.

## Repository layout

```text
DeadlineMesh/
├── client/
│   ├── public/
│   │   └── deadlinemesh.svg
│   ├── src/
│   │   ├── context/       # Authentication context
│   │   ├── hooks/         # Reusable dialog accessibility behavior
│   │   ├── lib/           # API client and form validation
│   │   ├── pages/         # Login, signup, dashboard, project tasks, workspaces
│   │   ├── styles/        # Global application styles
│   │   └── types/         # Project and task TypeScript types
│   └── index.html
└── server/
    ├── src/
    │   ├── app.ts          # Express application configuration
    │   ├── index.ts        # Server startup
    │   ├── db/             # PostgreSQL connection pool
    │   ├── middleware/     # JWT authentication
    │   ├── routes/         # Auth, project, and task API routes
    │   └── services/       # CPM, schedule risk, and what-if simulation
    └── .env.example
```

## Local development

### Prerequisites

- Node.js and npm
- A PostgreSQL database (local PostgreSQL or a Supabase project)
- Git

### 1. Clone the repository

```bash
git clone https://github.com/aarav2pf/DeadlineMesh.git
cd DeadlineMesh
```

### 2. Configure the backend

```bash
cd server
npm install
```

Create `server/.env` from `.env.example` and set the values:

```dotenv
PORT=5000
CLIENT_URL=http://localhost:5173
DATABASE_URL=postgresql://USER:PASSWORD@HOST:5432/DATABASE
JWT_SECRET=replace-with-a-long-random-secret
```

- `PORT` is the local API port; the host may provide it in production.
- `CLIENT_URL` is the frontend origin allowed by CORS.
- `DATABASE_URL` is the PostgreSQL connection string.
- `JWT_SECRET` is a private signing secret. Keep it out of Git and use a separate value for each environment.

The backend expects these PostgreSQL tables: `app_users`, `projects`, `tasks`, and `task_dependencies`. The repository currently does not include a versioned migration directory; provision the schema in your database before starting the API. The table relationships are:

- `app_users`: account ID, name, unique email, password hash, creation timestamp.
- `projects`: owner user ID, project name/description, optional deadline, creation/update timestamps.
- `tasks`: project ID, task name/description, duration, start date, status, priority, creation/update timestamps.
- `task_dependencies`: a task ID and the ID of the prerequisite task, with a unique pair and cascading foreign keys.

For a **new, empty database**, the following SQL is a starting schema compatible with the fields used by the API. Run it in your PostgreSQL/Supabase SQL editor before starting the server. Do not run it as a migration on an existing production database; review your current schema first.

```sql
CREATE TABLE IF NOT EXISTS app_users (
  id BIGSERIAL PRIMARY KEY,
  name VARCHAR(100) NOT NULL,
  email VARCHAR(254) NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS projects (
  id BIGSERIAL PRIMARY KEY,
  user_id BIGINT NOT NULL REFERENCES app_users(id) ON DELETE CASCADE,
  name VARCHAR(150) NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  deadline DATE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS tasks (
  id BIGSERIAL PRIMARY KEY,
  project_id BIGINT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  name VARCHAR(200) NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  duration INTEGER NOT NULL CHECK (duration BETWEEN 1 AND 365),
  start_date DATE NOT NULL,
  status VARCHAR(20) NOT NULL DEFAULT 'Pending'
    CHECK (status IN ('Pending', 'In Progress', 'Completed')),
  priority VARCHAR(10) NOT NULL DEFAULT 'Medium'
    CHECK (priority IN ('Low', 'Medium', 'High')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS task_dependencies (
  task_id BIGINT NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  depends_on_task_id BIGINT NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  PRIMARY KEY (task_id, depends_on_task_id),
  CHECK (task_id <> depends_on_task_id)
);

CREATE INDEX IF NOT EXISTS idx_projects_user_id ON projects(user_id);
CREATE INDEX IF NOT EXISTS idx_tasks_project_id ON tasks(project_id);
CREATE INDEX IF NOT EXISTS idx_task_dependencies_prerequisite
  ON task_dependencies(depends_on_task_id);
```

Do not run ad hoc schema changes against an existing production database. The application also validates dependency project membership and cycles in the API; those graph constraints require application-level checks in addition to database constraints.

Start the API:

```bash
npm run dev
```

The local API defaults to `http://localhost:5000`. Check `http://localhost:5000/api/health` for the health response and `/api/health/db` to verify the database connection.

### 3. Configure and start the frontend

Open a second terminal from the repository root:

```bash
cd client
npm install
```

The frontend defaults to `http://localhost:5000/api` during local development. To override it, create `client/.env`:

```dotenv
VITE_API_URL=http://localhost:5000/api
```

Start Vite:

```bash
npm run dev
```

Open the local URL shown by Vite, normally `http://localhost:5173`.

## Scheduling logic

### Critical Path Method

The CPM service treats tasks as a directed acyclic graph where an edge represents a prerequisite. It first validates task IDs and dependency references, then topologically orders the tasks.

1. **Forward pass:** computes earliest start (ES) and earliest finish (EF) times using prerequisite finish times.
2. **Project duration:** the maximum earliest-finish value across tasks.
3. **Backward pass:** computes latest finish (LF) and latest start (LS) times from the project duration and dependent tasks.
4. **Slack:** `slack = LS - ES`. Tasks with zero slack are identified as critical.

Circular dependencies, self-dependencies, and dependencies that point to a missing task are rejected for analysis. The service returns one critical path; when a project has multiple equally critical paths, individual tasks may still be marked critical based on zero slack.

### What-if delay simulation

A simulation validates the selected task and requested added duration, calculates the baseline schedule, recalculates with a copied task list, and reports the original and simulated project duration plus the resulting delay. The saved task data is not updated by the simulation.

### Schedule risk

The risk service combines CPM output with the current task statuses and prerequisites. It considers whether unfinished tasks are blocked, whether they lie on the critical path, and whether they have little or no slack. The resulting risk labels are rule-based indicators, not statistical forecasts.

## API overview

All API endpoints are prefixed with `/api`. Except for health endpoints and signup/login, routes require an `Authorization: Bearer <token>` header.

| Method | Endpoint | Purpose |
|---|---|---|
| `GET` | `/health` | API health check |
| `GET` | `/health/db` | PostgreSQL connectivity check |
| `POST` | `/auth/signup` | Create an account and return a token |
| `POST` | `/auth/login` | Authenticate and return a token |
| `GET` | `/auth/me` | Get the current authenticated user |
| `GET` | `/projects` | List the authenticated user's projects |
| `POST` | `/projects` | Create a project |
| `PATCH` | `/projects/:id` | Update a project |
| `DELETE` | `/projects/:id` | Delete a project |
| `GET` | `/projects/:projectId/critical-path` | Calculate CPM schedule analysis |
| `GET` | `/projects/:projectId/schedule-risk` | Calculate schedule risk |
| `POST` | `/projects/:projectId/what-if/delay` | Simulate an added task delay |
| `GET` | `/tasks/project/:projectId` | List tasks for a project |
| `POST` | `/tasks/project/:projectId` | Create a task in a project |
| `PATCH` | `/tasks/:taskId` | Update a task, including dependencies/status |
| `DELETE` | `/tasks/:taskId` | Delete a task |

Errors return JSON with a `message` field where handled by the API. HTTP status codes distinguish invalid input, missing/unauthorized resources, rate limiting, and server errors.

## Tests and quality checks

Run the available checks from each package directory.

Frontend:

```bash
cd client
npm run build
npm run lint
```

Backend:

```bash
cd server
npm run build
npm test
```

The backend test script runs the scheduling service test suite, which covers dependent and parallel task durations, multiple critical paths, empty projects, invalid/circular dependencies, simulation immutability, invalid simulation inputs, and schedule-risk behavior. If the JWT middleware test file is present in your checkout, it can also be run explicitly with:

```bash
npx tsx --test src/services/schedule.test.ts src/middleware/auth.test.ts
```

## Deployment

### Frontend — Render Static Site

- **Root directory:** `client`
- **Build command:** `npm install && npm run build`
- **Publish directory:** `dist`
- **Environment variable:** `VITE_API_URL=https://deadlinemesh-api.onrender.com/api`
- **SPA fallback:** configure a Render rewrite from `/*` to `/index.html` with action **Rewrite**. This allows direct navigation and refresh on routes such as `/dashboard`.

### Backend — Render Web Service

- **Root directory:** `server`
- **Build command:** `npm install && npm run build`
- **Start command:** `npm start`
- **Environment variables:** `DATABASE_URL`, `JWT_SECRET`, and `CLIENT_URL` set to the deployed frontend origin. `PORT` is supplied by Render where applicable.

### Database — Supabase

Use the PostgreSQL connection string provided by Supabase as `DATABASE_URL`. Keep database credentials and the JWT secret in the hosting provider's environment-variable settings, never in committed source files.

The login limiter currently uses the default in-memory store. This is suitable for a single API instance; if deploying multiple instances, use a shared rate-limit store so all instances enforce a consistent limit.

## Security notes

- Never commit `.env` files or credentials.
- Use a strong, private `JWT_SECRET` in production.
- Client-side validation improves feedback but is not a security boundary; the API must validate inputs too.
- Production deployments should use HTTPS and restrict CORS to the deployed frontend origin.

## Author

**Aarav Sadhu**

- GitHub: https://github.com/aarav2pf
- LinkedIn: https://www.linkedin.com/in/aarav-sadhu-a33837275/
