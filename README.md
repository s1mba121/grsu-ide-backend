# GRSU IDE Backend

A microservices backend for a university browser-based IDE platform designed for programming exams. Students write code directly in the browser, teachers create tasks with test cases, launch exams, and monitor results in real time.

---

## Table of Contents

- [Full Documentation](#-full-documentation)
- [Architecture](#architecture)
- [Tech Stack](#tech-stack)
- [Project Structure](#project-structure)
- [Quick Start](#quick-start)
- [Environment Variables](#environment-variables)
- [Services](#services)
- [Role System](#role-system)
- [Anti-Cheat System](#anti-cheat-system)
- [Code Execution Security](#code-execution-security)

---

## Full Documentation

Detailed documentation is available in:

- 🇬🇧 [English version](docs/documentation_en.md)
- 🇷🇺 [Русская версия](docs/documentation_ru.md)

> The README contains only a quick overview and setup instructions.

## Architecture

The client communicates **only** with the Gateway (port `4000`). The Gateway verifies JWTs and proxies requests to internal services, injecting `x-user-id`, `x-user-email`, and `x-user-role` headers.

```
Client
  │
  ▼
Gateway :4000  ──── JWT verification
  │
  ├──► Auth Service    :3001  (PostgreSQL)
  ├──► FS Service      :3002  (PostgreSQL + Disk)
  ├──► Task Service    :3003  (PostgreSQL)
  └──► Runner Service  :3004  (Redis + Docker)
```

**Gateway routing table:**

| Prefix          | Upstream            | Rewrite     |
| --------------- | ------------------- | ----------- |
| `/api/auth`     | auth-service:3001   | `/auth`     |
| `/api/fs`       | fs-service:3002     | `/fs`       |
| `/api/tasks`    | task-service:3003   | `/tasks`    |
| `/api/exams`    | task-service:3003   | `/exams`    |
| `/api/sessions` | task-service:3003   | `/sessions` |
| `/api/runner`   | runner-service:3004 | `/runner`   |

**Public routes** (no JWT required): `POST /api/auth/register`, `POST /api/auth/login`, `POST /api/auth/refresh`, `GET /api/exams/join/:token`, `GET /health`.

---

## Tech Stack

- **Runtime:** Node.js 20+, TypeScript
- **Web framework:** Fastify
- **ORM:** Prisma
- **Database:** PostgreSQL 16
- **Cache / Queue:** Redis 7 + BullMQ
- **Code execution:** Docker (isolated containers)
- **WebSocket:** @fastify/websocket (interactive terminal)
- **Monorepo:** npm workspaces

---

## Project Structure

```
grsu-ide-backend/
├── services/
│   ├── auth-service/       # Authentication, users, groups
│   ├── fs-service/         # Project file system
│   ├── task-service/       # Tasks, exams, sessions
│   ├── runner-service/     # Docker code runner + WebSocket terminal
│   └── gateway/            # Single entry point, JWT proxy
├── shared/
│   └── types/              # @grsu/types — shared TypeScript types
├── docker-compose.dev.yml
├── .env.example
└── tsconfig.base.json
```

---

## Quick Start

### Requirements

- Docker & Docker Compose
- Node.js 20+
- npm 10+

### Running in development mode

```bash
# 1. Clone the repository and install dependencies
npm install

# 2. Configure environment variables
cp .env.example .env
# Edit .env — replace all change_me values

# 3. Start all services via Docker Compose
docker compose -f docker-compose.dev.yml up --build

# 4. Apply database migrations (in a separate terminal, after postgres is up)
npm run prisma:generate:all
```

After a successful start:

- Gateway: `http://localhost:4000`
- Auth Service: `http://localhost:3001`
- FS Service: `http://localhost:3002`
- Task Service: `http://localhost:3003`
- Runner Service: `http://localhost:3004`

### Running individual services locally

```bash
npm run dev:auth      # auth-service on :3001
npm run dev:gateway   # gateway on :4000
```

### Building all services

```bash
npm run build
```

### Generating Prisma clients

```bash
npm run prisma:generate:all
```

---

## Environment Variables

### Root (`.env`)

| Variable              | Description            | Example             |
| --------------------- | ---------------------- | ------------------- |
| `POSTGRES_USER`       | PostgreSQL user        | `grsu`              |
| `POSTGRES_PASSWORD`   | PostgreSQL password    | `change_me`         |
| `POSTGRES_DB`         | Database name          | `grsu_ide`          |
| `JWT_ACCESS_SECRET`   | Access token secret    | `change_me_access`  |
| `JWT_REFRESH_SECRET`  | Refresh token secret   | `change_me_refresh` |
| `JWT_ACCESS_EXPIRES`  | Access token lifetime  | `15m`               |
| `JWT_REFRESH_EXPIRES` | Refresh token lifetime | `7d`                |
| `BCRYPT_ROUNDS`       | bcrypt hashing rounds  | `12`                |

### Gateway

| Variable             | Description                 |
| -------------------- | --------------------------- |
| `PORT`               | Port (default `4000`)       |
| `JWT_ACCESS_SECRET`  | Secret for JWT verification |
| `AUTH_SERVICE_URL`   | URL of auth-service         |
| `FS_SERVICE_URL`     | URL of fs-service           |
| `TASK_SERVICE_URL`   | URL of task-service         |
| `RUNNER_SERVICE_URL` | URL of runner-service       |

### Auth Service

| Variable              | Description                     |
| --------------------- | ------------------------------- |
| `PORT`                | Port (default `3001`)           |
| `DATABASE_URL`        | PostgreSQL DSN                  |
| `JWT_ACCESS_SECRET`   | Secret for signing access JWTs  |
| `JWT_REFRESH_SECRET`  | Secret for signing refresh JWTs |
| `JWT_ACCESS_EXPIRES`  | Access token lifetime           |
| `JWT_REFRESH_EXPIRES` | Refresh token lifetime          |
| `BCRYPT_ROUNDS`       | bcrypt rounds                   |

### FS Service

| Variable       | Description                             |
| -------------- | --------------------------------------- |
| `PORT`         | Port (default `3002`)                   |
| `DATABASE_URL` | PostgreSQL DSN                          |
| `STORAGE_PATH` | Root path of the file storage directory |

### Task Service

| Variable             | Description                    |
| -------------------- | ------------------------------ |
| `PORT`               | Port (default `3003`)          |
| `DATABASE_URL`       | PostgreSQL DSN                 |
| `FS_SERVICE_URL`     | URL of fs-service              |
| `RUNNER_SERVICE_URL` | URL of runner-service          |
| `AUTH_SERVICE_URL`   | URL of auth-service            |
| `SERVICE_KEY`        | Key for inter-service requests |

### Runner Service

| Variable              | Description                                           |
| --------------------- | ----------------------------------------------------- |
| `PORT`                | Port (default `3004`)                                 |
| `REDIS_URL`           | Redis DSN                                             |
| `FS_SERVICE_URL`      | URL of fs-service                                     |
| `STORAGE_PATH`        | Storage path (must match fs-service)                  |
| `HOST_STORAGE_PATH`   | Absolute path to the same storage on the host machine |
| `CODE_TIMEOUT_MS`     | Code execution timeout in ms (default `15000`)        |
| `MAX_CONCURRENT_RUNS` | Maximum parallel containers (default `5`)             |

---

## Services

### Auth Service (port 3001)

Manages authentication, users, and academic groups.

- Passwords are hashed via `bcryptjs`.
- Access tokens live for `JWT_ACCESS_EXPIRES` (typically 15 min); refresh tokens live for `JWT_REFRESH_EXPIRES` (typically 7 days).
- **Token rotation** is implemented: on refresh, the old token is immediately invalidated. Reusing a refresh token invalidates **all** tokens for that user.

**DB tables:** `groups`, `users`, `refresh_tokens`.

### FS Service (port 3002)

Manages projects and files on disk.

**Storage layout:**

```
STORAGE_PATH/
└── users/
    └── {userId}/
        └── projects/
            └── {projectId}/
                └── main.py   # or index.js
```

- Path traversal protection: every path is validated via `resolved.startsWith(root)`.
- `isReadonly` flag on a project: once submitted, the student cannot modify files.
- A boilerplate file is automatically created when a project is initialized.
- The file tree is returned recursively with directories sorted before files.

**DB tables:** `projects`.

### Task Service (port 3003)

Manages tasks, exams, and student sessions.

- Hidden test cases (`isHidden: true`) are not visible to students — their `input` and `expectedOutput` are replaced with `***`.
- Exams are created with a unique `inviteToken` (nanoid, 32 characters).
- When a session starts, a student project is automatically created via fs-service.
- After `submit`, the project is frozen — fs-service sets `isReadonly: true`.
- 3 anti-cheat warnings → automatic disqualification + project freeze.

**DB tables:** `tasks`, `test_cases`, `exams`, `exam_participants`, `exam_sessions`, `anticheat_logs`, `submissions`.

### Runner Service (port 3004)

Safely executes user code in isolated Docker containers.

- Each run spawns a separate Docker container with the `--rm` flag.
- Project files are mounted read-only (`ro`).
- Execution queue powered by **BullMQ + Redis** (`concurrency = MAX_CONCURRENT_RUNS`).
- Interactive terminal via **WebSocket** (`@fastify/websocket`).

**Docker constraints for user code:**

| Parameter    | Value                                 |
| ------------ | ------------------------------------- |
| Network      | `--network=none`                      |
| RAM          | `--memory=128m`                       |
| Swap         | `--memory-swap=128m`                  |
| CPU          | `--cpus=0.5`                          |
| Processes    | `--pids-limit=50`                     |
| Filesystem   | `--read-only` (only `/tmp` via tmpfs) |
| User         | `--user=nobody`                       |
| Timeout      | `CODE_TIMEOUT_MS` (default 15 sec)    |
| Output limit | 512 KB                                |

**Supported languages:**

| Language   | Docker image       |
| ---------- | ------------------ |
| Python     | `python:3.12-slim` |
| JavaScript | `node:20-slim`     |

### Gateway (port 4000)

Single entry point. Verifies JWTs, injects `x-user-id`, `x-user-email`, `x-user-role` headers, and proxies requests to the appropriate service. Supports token delivery via both the `Authorization: Bearer <token>` header and a `?token=` query parameter (for WebSocket connections).

---

## Role System

| Route                           |      student       |   teacher   | admin |
| ------------------------------- | :----------------: | :---------: | :---: |
| `POST /auth/register`           |         ✓          |      ✓      |   ✓   |
| `GET /auth/me`                  |         ✓          |      ✓      |   ✓   |
| `GET /auth/users`               |         —          |      —      |   ✓   |
| `GET /auth/users/:id`           |         —          |      ✓      |   ✓   |
| `PATCH /auth/users/:id/role`    |         —          |      —      |   ✓   |
| `POST /auth/groups`             |         —          |      —      |   ✓   |
| `GET /auth/groups`              |         —          |      ✓      |   ✓   |
| `POST /auth/groups/:id/members` |         —          |      ✓      |   ✓   |
| `POST /fs/projects`             |         ✓          |      ✓      |   ✓   |
| `GET /fs/:id/tree`              |      own only      |     any     |  any  |
| `PUT /fs/:id/file`              | own (not readonly) |      ✓      |   ✓   |
| `POST /tasks`                   |         —          |      ✓      |   ✓   |
| `GET /tasks/:id`                |   ✓ (no hidden)    |      ✓      |   ✓   |
| `PATCH /tasks/:id`              |         —          | author only |   ✓   |
| `POST /exams`                   |         —          |      ✓      |   ✓   |
| `PATCH /exams/:id/open`         |         —          |      ✓      |   ✓   |
| `GET /exams/:id/results`        |         —          |      ✓      |   ✓   |
| `POST /sessions/:examId/start`  |         ✓          |      —      |   —   |
| `POST /sessions/:examId/submit` |         ✓          |      —      |   —   |
| `POST /runner/run`              |         ✓          |      ✓      |   ✓   |

**Inter-service authentication:** After JWT verification the Gateway injects `x-user-id`, `x-user-email`, `x-user-role` headers. Downstream services read identity from these headers and never have direct access to JWTs.

---

## Anti-Cheat System

The system records suspicious student activity during an exam.

| `eventType`       | Trigger                                                       |
| ----------------- | ------------------------------------------------------------- |
| `tab_blur`        | Student switches to another browser tab (after a 5 sec delay) |
| `window_minimize` | Browser window is minimized                                   |
| `paste_attempt`   | Text pasted into the editor (Ctrl+V / Cmd+V)                  |
| `devtools_open`   | Browser DevTools opened                                       |

**Logic:**

1. Each event increments `warningsCount` and writes a record to `anticheat_logs`.
2. When `warningsCount >= 3` → session status changes to `disqualified` and the project is frozen automatically.
3. Teachers can review the full violation log via `GET /api/exams/:id/sessions/:sessionId/anticheat`.

---

## Code Execution Security

Every code execution request goes through the following isolation chain:

1. **Read-only mount** — project files are mounted into the container with the `ro` flag.
2. **Docker container** — spawned with maximum resource constraints (network, memory, CPU, PID, filesystem).
3. **`nobody` user** — code runs without any privileges.
4. **Timeout** — the process is killed via `SIGKILL` after `CODE_TIMEOUT_MS`.
5. **Output limit** — process is forcefully terminated if output exceeds 512 KB.
6. **Path traversal protection** — fs-service validates that all resolved paths start with the project root (`resolved.startsWith(root)`).
7. **Concurrency queue** — BullMQ limits simultaneous containers to `MAX_CONCURRENT_RUNS`.

---
