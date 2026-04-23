# GRSU IDE Backend — Documentation

## Table of Contents

1. [Architecture Overview](#1-architecture-overview)
2. [Quick Start](#2-quick-start)
3. [Environment Variables](#3-environment-variables)
4. [Services](#4-services)
5. [API Reference](#5-api-reference)
6. [Data Models](#6-data-models)
7. [Roles & Access Control](#7-roles--access-control)
8. [Anti-Cheat System](#8-anti-cheat-system)
9. [Code Execution Security](#9-code-execution-security)
10. [Shared Types](#10-shared-types)

---

## 1. Architecture Overview

GRSU IDE Backend is a microservices monorepo for an educational IDE platform. The client communicates only with the **Gateway** (port `4000`), which proxies requests to internal services.

```
Client
  │
  ▼
Gateway :4000  ──── JWT verification
  │
  ├──► Auth Service    :3001  (PostgreSQL)
  ├──► FS Service      :3002  (PostgreSQL + Disk Storage)
  ├──► Task Service    :3003  (PostgreSQL)
  └──► Runner Service  :3004  (Redis + Docker)
```

**Stack:** Node.js, TypeScript, Fastify, Prisma ORM, PostgreSQL, Redis, Docker, BullMQ.

**Monorepo structure (npm workspaces):**

```
grsu-ide-backend/
├── services/
│   ├── auth-service/
│   ├── fs-service/
│   ├── task-service/
│   ├── runner-service/
│   └── gateway/
└── shared/
    └── types/          # @grsu/types — shared TypeScript types
```

---

## 2. Quick Start

### Requirements

- Docker & Docker Compose
- Node.js 20+
- npm 10+

### Running in dev mode

```bash
# 1. Clone the repository and install dependencies
npm install

# 2. Copy and fill in environment variables
cp .env.example .env

# 3. Start all services via Docker Compose
docker compose -f docker-compose.dev.yml up --build

# 4. Apply migrations (in a separate terminal, after postgres starts)
npm run prisma:generate:all
```

### Running individual services locally

```bash
npm run dev:auth     # auth-service on :3001
npm run dev:gateway  # gateway on :4000
```

### Building all services

```bash
npm run build
```

---

## 3. Environment Variables

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

### Per-service

#### Auth Service

| Variable              | Description                    |
| --------------------- | ------------------------------ |
| `PORT`                | Service port (default `3001`)  |
| `DATABASE_URL`        | PostgreSQL DSN                 |
| `JWT_ACCESS_SECRET`   | Secret for signing access JWT  |
| `JWT_REFRESH_SECRET`  | Secret for signing refresh JWT |
| `JWT_ACCESS_EXPIRES`  | Access token lifetime          |
| `JWT_REFRESH_EXPIRES` | Refresh token lifetime         |
| `BCRYPT_ROUNDS`       | bcrypt rounds                  |

#### FS Service

| Variable       | Description                   |
| -------------- | ----------------------------- |
| `PORT`         | Service port (default `3002`) |
| `DATABASE_URL` | PostgreSQL DSN                |
| `STORAGE_PATH` | Root path for file storage    |

#### Task Service

| Variable             | Description                   |
| -------------------- | ----------------------------- |
| `PORT`               | Service port (default `3003`) |
| `DATABASE_URL`       | PostgreSQL DSN                |
| `FS_SERVICE_URL`     | URL of fs-service             |
| `RUNNER_SERVICE_URL` | URL of runner-service         |

#### Runner Service

| Variable              | Description                                    |
| --------------------- | ---------------------------------------------- |
| `PORT`                | Service port (default `3004`)                  |
| `REDIS_URL`           | Redis DSN                                      |
| `FS_SERVICE_URL`      | URL of fs-service                              |
| `STORAGE_PATH`        | Storage path (must match fs-service)           |
| `CODE_TIMEOUT_MS`     | Code execution timeout in ms (default `15000`) |
| `MAX_CONCURRENT_RUNS` | Max parallel containers (default `5`)          |

#### Gateway

| Variable             | Description                   |
| -------------------- | ----------------------------- |
| `PORT`               | Service port (default `4000`) |
| `JWT_ACCESS_SECRET`  | Secret for JWT verification   |
| `AUTH_SERVICE_URL`   | URL of auth-service           |
| `FS_SERVICE_URL`     | URL of fs-service             |
| `TASK_SERVICE_URL`   | URL of task-service           |
| `RUNNER_SERVICE_URL` | URL of runner-service         |

---

## 4. Services

### 4.1 Gateway (port 4000)

Single entry point. Responsible for:

- **JWT verification** for all requests except public routes.
- **Injecting headers** `x-user-id`, `x-user-email`, `x-user-role` into downstream requests.
- **Proxying** requests by prefix rules.

**Public routes** (no JWT required):

- `POST /api/auth/register`
- `POST /api/auth/login`
- `POST /api/auth/refresh`
- `GET /api/exams/join/:token`
- `GET /health`

**Routing table:**

| Prefix          | Forwarded to        | Rewrite     |
| --------------- | ------------------- | ----------- |
| `/api/auth`     | auth-service:3001   | `/auth`     |
| `/api/fs`       | fs-service:3002     | `/fs`       |
| `/api/tasks`    | task-service:3003   | `/tasks`    |
| `/api/exams`    | task-service:3003   | `/exams`    |
| `/api/sessions` | task-service:3003   | `/sessions` |
| `/api/runner`   | runner-service:3004 | `/runner`   |

---

### 4.2 Auth Service (port 3001)

Manages authentication, users, and groups.

**Details:**

- Passwords are hashed via `bcryptjs`.
- Refresh tokens are stored in the DB. On refresh, the token is immediately deleted (token rotation). Reusing a refresh token invalidates all tokens for that user.
- Access tokens are signed with `JWT_ACCESS_SECRET`, refresh tokens with `JWT_REFRESH_SECRET`.

**Database tables:**

- `groups` — study groups
- `users` — users (roles: `student`, `teacher`, `admin`)
- `refresh_tokens` — refresh token storage

---

### 4.3 FS Service (port 3002)

Manages projects and files on disk.

**Disk storage structure:**

```
STORAGE_PATH/
└── users/
    └── {userId}/
        └── projects/
            └── {projectId}/
                ├── main.py       # or index.js
                └── ...
```

**Details:**

- Path traversal protection: paths are checked via `resolved.startsWith(root)`.
- `isReadonly` flag on a project: after submission, the student cannot modify files.
- On project creation, a boilerplate file (`main.py` or `index.js`) is automatically created with template code.
- The file tree is returned recursively; directories come before files.

**Database tables:**

- `projects` — project metadata

---

### 4.4 Task Service (port 3003)

Manages tasks, exams, and student sessions.

**Details:**

- Hidden test cases (`isHidden: true`) are not visible to students — their `input` and `expectedOutput` are replaced with `***`.
- Exams are created with a unique `inviteToken` (nanoid, 32 chars).
- When a session starts, the student's project is automatically created via fs-service.
- After submission (`submit`), the project is frozen via fs-service (`isReadonly: true`).
- 3 anti-cheat warnings → automatic disqualification + project freeze.

**Database tables:**

- `tasks` — tasks
- `test_cases` — test cases for tasks
- `exams` — exams
- `exam_participants` — exam participants
- `exam_sessions` — student sessions
- `anticheat_logs` — violation log
- `submissions` — submission results

---

### 4.5 Runner Service (port 3004)

Secure execution of user code in isolated Docker containers.

**Details:**

- Each run is a separate Docker container (`--rm`).
- Project files are mounted read-only (`ro`).
- Queue based on BullMQ + Redis: `concurrency = MAX_CONCURRENT_RUNS`.
- Interactive terminal support via WebSocket (`@fastify/websocket`).
- Output is normalized before comparison (`trim()` + `trimEnd()` per line).

**Docker restrictions for user code:**

| Restriction | Value                                 |
| ----------- | ------------------------------------- |
| Network     | `--network=none`                      |
| RAM         | `--memory=128m`                       |
| Swap        | `--memory-swap=128m`                  |
| CPU         | `--cpus=0.5`                          |
| Processes   | `--pids-limit=50`                     |
| Filesystem  | `--read-only` (only `/tmp` via tmpfs) |
| User        | `--user=nobody`                       |
| Timeout     | `CODE_TIMEOUT_MS` (default 15 sec)    |
| Max output  | 512 KB                                |

**Docker images:**

| Language   | Image              |
| ---------- | ------------------ |
| Python     | `python:3.12-slim` |
| JavaScript | `node:20-slim`     |

---

## 5. API Reference

> All responses follow this format:
>
> ```json
> { "ok": true, "data": <payload> }      // success
> { "ok": false, "error": "<message>" }  // error
> ```
>
> Base URL: `http://localhost:4000`
>
> For protected routes, pass the header:
>
> ```
> Authorization: Bearer <accessToken>
> ```

---

### 5.1 Authentication (`/api/auth`)

#### `POST /api/auth/register`

Register a new user. Public.

**Body:**

```json
{
  "email": "user@example.com",
  "fullName": "John Doe",
  "password": "minlength8"
}
```

**Response `201`:**

```json
{
  "ok": true,
  "data": {
    "accessToken": "eyJ...",
    "refreshToken": "eyJ..."
  }
}
```

**Errors:** `400` — validation, `409` — email already exists.

---

#### `POST /api/auth/login`

Log in. Public.

**Body:**

```json
{
  "email": "user@example.com",
  "password": "password123"
}
```

**Response `200`:**

```json
{
  "ok": true,
  "data": {
    "accessToken": "eyJ...",
    "refreshToken": "eyJ..."
  }
}
```

**Errors:** `401` — invalid credentials.

---

#### `POST /api/auth/refresh`

Refresh token pair. Public. Old refresh token is invalidated.

**Body:**

```json
{
  "refreshToken": "eyJ..."
}
```

**Response `200`:** New pair `{ accessToken, refreshToken }`.

**Errors:** `401` — invalid/expired/already-used token.

---

#### `POST /api/auth/logout`

Log out. Invalidates the refresh token. Requires JWT.

**Body:**

```json
{
  "refreshToken": "eyJ..."
}
```

**Response `200`:** `{ "ok": true, "data": null }`

---

#### `GET /api/auth/me`

Current user data. Requires JWT.

**Response `200`:**

```json
{
  "ok": true,
  "data": {
    "id": "uuid",
    "email": "user@example.com",
    "fullName": "John Doe",
    "role": "student",
    "groupId": null,
    "createdAt": "2026-04-06T19:47:00.000Z"
  }
}
```

---

### 5.2 Users (`/api/auth`)

#### `GET /api/auth/users`

List all users. Requires `admin` role.

**Response `200`:** `{ "ok": true, "data": [ ...User[] ] }`

---

#### `GET /api/auth/users/:id`

User data by ID. Requires `admin` or `teacher` role.

**Response `200`:** `{ "ok": true, "data": User }`

---

#### `PATCH /api/auth/users/:id/role`

Change user role. Requires `admin` role.

**Body:**

```json
{
  "role": "teacher"
}
```

Allowed roles: `student`, `teacher`, `admin`.

**Response `200`:** `{ "ok": true, "data": User }`

---

### 5.3 Groups (`/api/auth`)

#### `POST /api/auth/groups`

Create a group. Requires `admin` role.

**Body:**

```json
{
  "name": "IT-21"
}
```

**Response `201`:** `{ "ok": true, "data": Group }`

**Errors:** `409` — group with this name already exists.

---

#### `GET /api/auth/groups`

List groups. Requires `admin` or `teacher` role.

**Response `200`:** `{ "ok": true, "data": Group[] }`

---

#### `GET /api/auth/groups/:id`

Group details with members. Requires `admin` or `teacher` role.

**Response `200`:** `{ "ok": true, "data": Group & { users: User[] } }`

---

#### `POST /api/auth/groups/:id/members`

Add a student to a group. Requires `admin` or `teacher` role.

**Body:**

```json
{
  "userId": "uuid"
}
```

**Response `200`:** `{ "ok": true, "data": User }`

---

#### `DELETE /api/auth/groups/:id/members/:userId`

Remove a student from a group. Requires `admin` or `teacher` role.

**Response `200`:** `{ "ok": true, "data": null }`

---

### 5.4 File System (`/api/fs`)

All endpoints require JWT. A student can only access their own projects.

#### `POST /api/fs/projects`

Create a project. Automatically creates a boilerplate file on disk.

**Body:**

```json
{
  "name": "my-project",
  "language": "python",
  "taskId": "uuid (optional)",
  "templateCode": "# starter code (optional)"
}
```

**Response `201`:**

```json
{
  "ok": true,
  "data": {
    "id": "uuid",
    "userId": "uuid",
    "taskId": null,
    "name": "my-project",
    "language": "python",
    "isReadonly": false,
    "createdAt": "..."
  }
}
```

---

#### `GET /api/fs/projects`

List current user's projects.

**Response `200`:** `{ "ok": true, "data": Project[] }`

---

#### `GET /api/fs/projects/:id`

Project metadata. Students see only their own; teacher/admin see any.

**Response `200`:** `{ "ok": true, "data": Project }`

---

#### `GET /api/fs/:projectId/tree`

Project file tree. Directories come first, then files (sorted by name).

**Response `200`:**

```json
{
  "ok": true,
  "data": [
    {
      "name": "src",
      "path": "src",
      "type": "dir",
      "children": [{ "name": "main.py", "path": "src/main.py", "type": "file" }]
    },
    { "name": "main.py", "path": "main.py", "type": "file" }
  ]
}
```

---

#### `GET /api/fs/:projectId/file?path=src/main.py`

Get file contents.

**Query params:** `path` — relative path from the project root (required).

**Response `200`:**

```json
{
  "ok": true,
  "data": {
    "path": "src/main.py",
    "content": "print('hello')\n"
  }
}
```

---

#### `PUT /api/fs/:projectId/file`

Save file contents. Creates directories automatically. Forbidden for readonly projects.

**Body:**

```json
{
  "path": "src/main.py",
  "content": "print('hello')\n"
}
```

**Response `200`:** `{ "ok": true, "data": null }`

---

#### `POST /api/fs/:projectId/file`

Create an empty file or directory. Forbidden for readonly projects.

**Body:**

```json
{
  "path": "src/utils.py",
  "type": "file"
}
```

Or `"type": "dir"` for a directory.

**Response `201`:** `{ "ok": true, "data": null }`

**Errors:** `409` — file/directory already exists.

---

#### `DELETE /api/fs/:projectId/file?path=src/utils.py`

Delete a file or directory (recursively). Forbidden for readonly projects.

**Response `200`:** `{ "ok": true, "data": null }`

---

#### `PATCH /api/fs/:projectId/rename`

Rename or move a file/directory. Forbidden for readonly projects.

**Body:**

```json
{
  "oldPath": "main.py",
  "newPath": "src/main.py"
}
```

**Response `200`:** `{ "ok": true, "data": null }`

---

### 5.5 Tasks (`/api/tasks`)

#### `POST /api/tasks`

Create a task. Requires `teacher` or `admin` role.

**Body:**

```json
{
  "title": "Task 1: Sorting",
  "description": "Task description...",
  "language": "python",
  "templateCode": "# Write your solution",
  "timeLimitMin": 60
}
```

**Response `201`:** `{ "ok": true, "data": Task }`

---

#### `GET /api/tasks`

List the teacher's tasks. Requires `teacher` or `admin` role.

**Response `200`:** `{ "ok": true, "data": Task[] }`

---

#### `GET /api/tasks/:id`

Task details. Students do not see hidden test cases.

**Response `200`:** `{ "ok": true, "data": Task & { testCases: TestCase[] } }`

---

#### `PATCH /api/tasks/:id`

Update a task. Author only or `admin`.

**Body (all fields optional):**

```json
{
  "title": "New title",
  "description": "...",
  "templateCode": "...",
  "timeLimitMin": 90
}
```

**Response `200`:** `{ "ok": true, "data": Task }`

---

#### `DELETE /api/tasks/:id`

Delete a task. Author only or `admin`.

**Response `200`:** `{ "ok": true, "data": null }`

---

#### `POST /api/tasks/:id/test-cases`

Add a test case to a task. Requires `teacher` or `admin` role.

**Body:**

```json
{
  "input": "5\n3",
  "expectedOutput": "8",
  "isHidden": true,
  "points": 2,
  "orderIndex": 0
}
```

**Response `201`:** `{ "ok": true, "data": TestCase }`

---

#### `PATCH /api/tasks/:id/test-cases/:tcId`

Update a test case. Requires `teacher` or `admin` role.

**Body (all fields optional):**

```json
{
  "input": "new input",
  "expectedOutput": "new output",
  "isHidden": false,
  "points": 5
}
```

**Response `200`:** `{ "ok": true, "data": TestCase }`

---

#### `DELETE /api/tasks/:id/test-cases/:tcId`

Delete a test case. Requires `teacher` or `admin` role.

**Response `200`:** `{ "ok": true, "data": null }`

---

### 5.6 Exams (`/api/exams`)

#### `POST /api/exams`

Create an exam. Requires `teacher` or `admin` role. An `inviteToken` is generated automatically.

**Body:**

```json
{
  "taskId": "uuid",
  "title": "Python Exam",
  "openMode": "manual",
  "startsAt": "2026-05-01T09:00:00Z",
  "endsAt": "2026-05-01T11:00:00Z"
}
```

`openMode`: `"manual"` (opened manually) or `"scheduled"` (by schedule).

**Response `201`:** `{ "ok": true, "data": Exam }`

---

#### `GET /api/exams`

List the teacher's exams. Requires `teacher` or `admin` role.

**Response `200`:** `{ "ok": true, "data": Exam[] }`

---

#### `GET /api/exams/:id`

Exam details. Requires `teacher` or `admin` role.

**Response `200`:** `{ "ok": true, "data": Exam }`

---

#### `PATCH /api/exams/:id/open`

Open an exam (transition to `active`). Requires `teacher` or `admin` role.

**Response `200`:** `{ "ok": true, "data": Exam }`

---

#### `PATCH /api/exams/:id/close`

Close an exam. Requires `teacher` or `admin` role.

**Response `200`:** `{ "ok": true, "data": Exam }`

---

#### `GET /api/exams/:id/results`

Summary results table for all students. Requires `teacher` or `admin` role.

**Response `200`:** `{ "ok": true, "data": ExamSession[] }`

---

#### `GET /api/exams/:id/sessions/:sessionId/anticheat`

Anti-cheat event log for a specific session. Requires `teacher` or `admin` role.

**Response `200`:** `{ "ok": true, "data": AntiCheatLog[] }`

---

#### `GET /api/exams/join/:token` (public)

Exam info by invite link.

**Response `200`:**

```json
{
  "ok": true,
  "data": {
    "id": "uuid",
    "title": "Python Exam",
    "status": "active",
    "task": { "id": "uuid", "title": "...", "language": "python" },
    "openMode": "manual",
    "startsAt": null,
    "endsAt": null
  }
}
```

---

#### `POST /api/exams/join/:token`

Join an exam by invite link. Requires JWT (student).

**Response `200`:** `{ "ok": true, "data": { "examId": "uuid", "joined": true } }`

**Errors:** `403` — exam is closed.

---

### 5.7 Sessions (`/api/sessions`)

#### `POST /api/sessions/:examId/start`

Start an exam. Requires JWT. If a session already exists, it is returned (reconnection support). On first start, the student's project is automatically created in fs-service.

**Response `201`:** `{ "ok": true, "data": ExamSession & { projectId: string } }`

**Errors:** `403` — exam is not active, student not registered.

---

#### `GET /api/sessions/:examId`

Current user's session status.

**Response `200`:** `{ "ok": true, "data": ExamSession }`

---

#### `POST /api/sessions/:examId/warn`

Record an anti-cheat event. Requires JWT. 3 events → disqualification.

**Body:**

```json
{
  "eventType": "tab_blur",
  "details": { "url": "https://google.com" }
}
```

Allowed `eventType` values: `tab_blur`, `window_minimize`, `paste_attempt`, `devtools_open`.

**Response `200`:**

```json
{
  "ok": true,
  "data": {
    "warning": true,
    "count": 1,
    "remaining": 2,
    "disqualified": false
  }
}
```

On disqualification: `"disqualified": true`, project is frozen.

---

#### `POST /api/sessions/:examId/run-tests`

Run all task test cases against the student's code. Saves the first result as a `Submission`.

**Response `200`:**

```json
{
  "ok": true,
  "data": {
    "score": 3,
    "maxScore": 5,
    "status": "partial",
    "results": [
      {
        "index": 0,
        "passed": true,
        "input": "5\n3",
        "expectedOutput": "8",
        "actualOutput": "8",
        "durationMs": 342,
        "hidden": false
      },
      {
        "index": 1,
        "passed": false,
        "input": "***",
        "expectedOutput": "***",
        "actualOutput": "0",
        "durationMs": 289,
        "hidden": true
      }
    ]
  }
}
```

`status`: `passed`, `partial`, `failed`.

---

#### `POST /api/sessions/:examId/submit`

Submit work. Freezes the project (`isReadonly: true`). Session status → `submitted`.

**Response `200`:** `{ "ok": true, "data": { "submitted": true, "sessionId": "uuid" } }`

---

#### `GET /api/sessions/:examId/result`

Get submission result. Only for completed sessions.

**Response `200`:** `{ "ok": true, "data": Submission }`

**Errors:** `403` — exam not yet submitted.

---

### 5.8 Code Runner (`/api/runner`)

#### `POST /api/runner/run`

One-off file execution. Requires JWT.

**Body:**

```json
{
  "projectId": "uuid",
  "entryFile": "main.py",
  "language": "python",
  "stdin": "5\n3"
}
```

**Response `200`:**

```json
{
  "ok": true,
  "data": {
    "stdout": "8",
    "stderr": "",
    "exitCode": 0,
    "durationMs": 356,
    "timedOut": false
  }
}
```

**Errors:** `401` — no JWT, `404` — project not found.

---

#### `POST /api/runner/test` (internal)

Run test cases. Called from task-service. No JWT required (inter-service call).

**Body:**

```json
{
  "projectId": "uuid",
  "userId": "uuid",
  "language": "python",
  "entryFile": "main.py",
  "testCases": [{ "input": "5\n3", "expectedOutput": "8" }]
}
```

**Response `200`:** `{ "ok": true, "data": TestResult[] }`

---

### 5.9 Terminal (WebSocket)

**URL:** `ws://localhost:4000/terminal/:projectId`

**Headers:** `x-user-id` and `x-user-role` (injected automatically by the gateway).

After connecting, the server opens an interactive `sh` terminal inside a Docker container with the project files mounted.

#### Incoming messages (client → server)

```json
{ "type": "input", "data": "ls\n" }
```

```json
{ "type": "resize", "cols": 80, "rows": 24 }
```

#### Outgoing messages (server → client)

```json
{ "type": "output", "data": "main.py\n" }
```

```json
{ "type": "exit", "code": 0 }
```

```json
{ "type": "error", "message": "Project not found" }
```

On connection, the server sends a welcome message:

```
✓ Terminal connected (python)
$
```

---

## 6. Data Models

### User

```typescript
{
  id: string; // UUID
  email: string;
  fullName: string;
  role: "student" | "teacher" | "admin";
  groupId: string | null;
  createdAt: string; // ISO 8601
}
```

### Group

```typescript
{
  id: string
  name: string         // unique, max 100 chars
  createdAt: string
  users?: User[]
}
```

### Project

```typescript
{
  id: string;
  userId: string;
  taskId: string | null;
  name: string;
  language: "python" | "javascript";
  isReadonly: boolean;
  createdAt: string;
}
```

### Task

```typescript
{
  id: string
  title: string
  description: string
  language: 'python' | 'javascript'
  templateCode: string
  timeLimitMin: number   // 5–300, default 60
  createdBy: string      // teacher's userId
  createdAt: string
  testCases: TestCase[]
}
```

### TestCase

```typescript
{
  id: string;
  taskId: string;
  input: string;
  expectedOutput: string;
  isHidden: boolean; // hidden ones are not visible to students
  points: number; // points for this test case
  orderIndex: number;
}
```

### Exam

```typescript
{
  id: string;
  taskId: string;
  title: string;
  inviteToken: string; // nanoid(32), unique
  openMode: "manual" | "scheduled";
  startsAt: string | null;
  endsAt: string | null;
  status: "draft" | "active" | "closed";
  createdBy: string;
  createdAt: string;
}
```

### ExamSession

```typescript
{
  id: string
  examId: string
  userId: string
  projectId: string
  startedAt: string
  finishedAt: string | null
  status: 'in_progress' | 'submitted' | 'disqualified'
  warningsCount: number
  submission?: Submission
}
```

### Submission

```typescript
{
  id: string
  sessionId: string
  userId: string
  taskId: string
  score: number
  maxScore: number
  status: 'passed' | 'partial' | 'failed' | 'error'
  resultsJson: TestResult[]
  submittedAt: string
}
```

### AntiCheatLog

```typescript
{
  id: string;
  sessionId: string;
  userId: string;
  eventType: "tab_blur" | "window_minimize" | "paste_attempt" | "devtools_open";
  occurredAt: string;
  details: object | null;
}
```

### FileNode

```typescript
{
  name: string
  path: string           // relative path from project root
  type: 'file' | 'dir'
  children?: FileNode[]  // directories only
}
```

---

## 7. Roles & Access Control

| Route                                     |      student       | teacher | admin |
| ----------------------------------------- | :----------------: | :-----: | :---: |
| `POST /auth/register`                     |         ✓          |    ✓    |   ✓   |
| `GET /auth/me`                            |         ✓          |    ✓    |   ✓   |
| `GET /auth/users`                         |         —          |    —    |   ✓   |
| `GET /auth/users/:id`                     |         —          |    ✓    |   ✓   |
| `PATCH /auth/users/:id/role`              |         —          |    —    |   ✓   |
| `POST /auth/groups`                       |         —          |    —    |   ✓   |
| `GET /auth/groups`                        |         —          |    ✓    |   ✓   |
| `POST /auth/groups/:id/members`           |         —          |    ✓    |   ✓   |
| `DELETE /auth/groups/:id/members/:userId` |         —          |    ✓    |   ✓   |
| `POST /fs/projects`                       |         ✓          |    ✓    |   ✓   |
| `GET /fs/:id/tree`                        |        own         |   any   |  any  |
| `PUT /fs/:id/file`                        | own (non-readonly) |    ✓    |   ✓   |
| `POST /tasks`                             |         —          |    ✓    |   ✓   |
| `GET /tasks/:id`                          |   ✓ (no hidden)    |    ✓    |   ✓   |
| `PATCH /tasks/:id`                        |         —          | author  |   ✓   |
| `POST /tasks/:id/test-cases`              |         —          |    ✓    |   ✓   |
| `POST /exams`                             |         —          |    ✓    |   ✓   |
| `PATCH /exams/:id/open`                   |         —          |    ✓    |   ✓   |
| `GET /exams/:id/results`                  |         —          |    ✓    |   ✓   |
| `POST /sessions/:examId/start`            |         ✓          |    —    |   —   |
| `POST /sessions/:examId/warn`             |         ✓          |    —    |   —   |
| `POST /sessions/:examId/submit`           |         ✓          |    —    |   —   |
| `POST /runner/run`                        |         ✓          |    ✓    |   ✓   |

### Inter-service authentication

After JWT verification, the gateway injects these headers:

```
x-user-id:    <userId>
x-user-email: <email>
x-user-role:  <role>
```

Downstream services (fs, task, runner) read the user from these headers and have no direct access to the JWT.

---

## 8. Anti-Cheat System

The system records suspicious student actions during an exam.

**Tracked events:**

| `eventType`       | Description                     |
| ----------------- | ------------------------------- |
| `tab_blur`        | Student switched to another tab |
| `window_minimize` | Browser window was minimized    |
| `paste_attempt`   | Attempted to paste text         |
| `devtools_open`   | DevTools were opened            |

**Warning logic:**

- Each event → `warningsCount++` + entry in `anticheat_logs`.
- When `warningsCount >= 3` → session status changes to `disqualified`, project is frozen.
- The teacher can view the log via `GET /api/exams/:id/sessions/:sessionId/anticheat`.

---

## 9. Code Execution Security

Each user code execution is isolated as follows:

1. **File copying** into a temporary directory `/tmp/grsu-run-<uuid>` before execution.
2. **Docker container** with maximum restrictions (see table in section [4.5](#45-runner-service-port-3004)).
3. **Timeout** — the process is killed via `SIGKILL` after `CODE_TIMEOUT_MS` elapses.
4. **Output limit** — if output exceeds 512 KB, the process is killed.
5. **Cleanup** — the temporary directory is deleted in a `finally` block in all cases.
6. **Path traversal** — fs-service verifies that the resolved path starts with the project root.

---

## 10. Shared Types

The `@grsu/types` package (in `shared/types/`) is used by all services.

```typescript
// user.ts
type UserRole = "student" | "teacher" | "admin";
interface User {
  id;
  email;
  fullName;
  role;
  groupId;
  createdAt;
}
interface AuthTokens {
  accessToken;
  refreshToken;
}

// jwt.ts
interface JwtPayload {
  sub;
  email;
  role;
  iat;
  exp;
}
interface GatewayHeaders {
  "x-user-id": string;
  "x-user-role": UserRole;
  "x-user-email": string;
}

// response.ts
interface ApiSuccess<T> {
  ok: true;
  data: T;
}
interface ApiError {
  ok: false;
  error: string;
  code?: string;
}
type ApiResponse<T> = ApiSuccess<T> | ApiError;

// events.ts
type AntiCheatEventType =
  | "tab_blur"
  | "window_minimize"
  | "paste_attempt"
  | "devtools_open";
interface AntiCheatEvent {
  sessionId;
  userId;
  eventType;
  occurredAt;
  details?;
}
interface ExamStatusChangedEvent {
  examId;
  status;
  changedAt;
}
```
