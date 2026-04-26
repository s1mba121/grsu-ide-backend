# GRSU IDE Backend - Full Technical Documentation

## Table of Contents

1. [System Overview](#1-system-overview)
2. [Architecture and Request Flow](#2-architecture-and-request-flow)
3. [Quick Start](#3-quick-start)
4. [Environment Configuration](#4-environment-configuration)
5. [Services and Responsibilities](#5-services-and-responsibilities)
6. [API Conventions](#6-api-conventions)
7. [Detailed API Reference](#7-detailed-api-reference)
8. [Realtime Interfaces (SSE and WebSocket)](#8-realtime-interfaces-sse-and-websocket)
9. [Data Model Reference](#9-data-model-reference)
10. [Access Control Matrix](#10-access-control-matrix)
11. [Anti-Cheat Workflow](#11-anti-cheat-workflow)
12. [Code Execution Security Model](#12-code-execution-security-model)
13. [Operational Notes and Documentation Policy](#13-operational-notes-and-documentation-policy)

---

## 1. System Overview

GRSU IDE Backend is a microservice backend for browser-based programming exams.

Main use cases:

- Student joins an exam via invite token, writes code, runs tests, submits solution.
- Teacher creates tasks and exams, monitors sessions and anti-cheat events.
- Admin manages users, roles, and groups.

All external traffic is expected to enter through `gateway` (`:4000`).

---

## 2. Architecture and Request Flow

```
Client
  |
  v
Gateway :4000 (JWT verify + proxy + header injection)
  |- /api/auth         -> auth-service   :3001
  |- /api/fs           -> fs-service     :3002
  |- /api/tasks        -> task-service   :3003
  |- /api/task-folders -> task-service   :3003
  |- /api/exams        -> task-service   :3003
  |- /api/sessions     -> task-service   :3003
  \- /api/runner       -> runner-service :3004
```

Technical stack:

- Node.js 20+, TypeScript
- Fastify
- Prisma + PostgreSQL
- Redis + BullMQ
- Docker (sandbox execution)
- WebSocket (`@fastify/websocket`)

Gateway auth behavior:

- Verifies JWT for non-public paths.
- Supports JWT via:
  - `Authorization: Bearer <token>`
  - query parameter `?token=<token>` (used by SSE scenarios)
- Injects trusted headers:
  - `x-user-id`
  - `x-user-email`
  - `x-user-role`
  - `x-user-fullname`
  - `x-user-groupid`

Public paths in current gateway implementation:

- `POST /api/auth/register`
- `POST /api/auth/login`
- `POST /api/auth/refresh`
- `GET /api/auth/groups`
- `GET /api/exams/join/:token`
- `GET /health`

---

## 3. Quick Start

### Requirements

- Docker and Docker Compose
- Node.js 20+
- npm 10+

### Bootstrapping

```bash
npm install
cp .env.example .env
docker compose -f docker-compose.dev.yml up --build
npm run prisma:generate:all
```

### Common commands

```bash
npm run dev:auth
npm run dev:gateway
npm run build
```

Default ports:

- Gateway: `4000`
- Auth: `3001`
- FS: `3002`
- Task: `3003`
- Runner: `3004`

---

## 4. Environment Configuration

### Root `.env`

| Variable | Description |
| --- | --- |
| `POSTGRES_USER` | PostgreSQL user |
| `POSTGRES_PASSWORD` | PostgreSQL password |
| `POSTGRES_DB` | PostgreSQL database |
| `JWT_ACCESS_SECRET` | Access token secret |
| `JWT_REFRESH_SECRET` | Refresh token secret |
| `JWT_ACCESS_EXPIRES` | Access token TTL |
| `JWT_REFRESH_EXPIRES` | Refresh token TTL |
| `BCRYPT_ROUNDS` | Password hashing rounds |

### Gateway (`services/gateway`)

- `PORT`
- `JWT_ACCESS_SECRET`
- `AUTH_SERVICE_URL`
- `FS_SERVICE_URL`
- `TASK_SERVICE_URL`
- `RUNNER_SERVICE_URL`
- `NODE_ENV`

### Auth service (`services/auth-service`)

- `PORT`
- `DATABASE_URL`
- `JWT_ACCESS_SECRET`
- `JWT_REFRESH_SECRET`
- `JWT_ACCESS_EXPIRES`
- `JWT_REFRESH_EXPIRES`
- `BCRYPT_ROUNDS`
- `SERVICE_KEY`
- `NODE_ENV`

### FS service (`services/fs-service`)

- `PORT`
- `DATABASE_URL`
- `STORAGE_PATH`
- `NODE_ENV`

### Task service (`services/task-service`)

- `PORT`
- `DATABASE_URL`
- `FS_SERVICE_URL`
- `RUNNER_SERVICE_URL`
- `AUTH_SERVICE_URL`
- `SERVICE_KEY`
- `NODE_ENV`

### Runner service (`services/runner-service`)

- `PORT`
- `REDIS_URL`
- `FS_SERVICE_URL`
- `STORAGE_PATH`
- `HOST_STORAGE_PATH`
- `CODE_TIMEOUT_MS`
- `MAX_CONCURRENT_RUNS`
- `NODE_ENV`

---

## 5. Services and Responsibilities

### Gateway

- JWT verification and trust boundary.
- Request proxying to downstream services.
- SSE proxy handling for `/api/exams/:id/events`.

### Auth service

- Register/login/refresh/logout.
- User and group management.
- Refresh token rotation and replay protection.

### FS service

- Project metadata.
- File tree and file operations.
- Filesystem traversal protection and readonly enforcement.

### Task service

- Tasks and test cases.
- Task folders.
- Exams, participants, sessions, submissions, anti-cheat logs.

### Runner service

- On-demand code execution.
- Batch testcase execution.
- Interactive terminal over WebSocket.

---

## 6. API Conventions

Base URL:

- `http://localhost:4000`

Standard response envelope:

```json
{ "ok": true, "data": {} }
{ "ok": false, "error": "Human readable error" }
```

Authentication:

- Protected routes require access token.
- Send either:
  - `Authorization: Bearer <accessToken>`
  - or `?token=<accessToken>` for SSE endpoint.

Common HTTP statuses:

- `200` success
- `201` created
- `400` validation / business precondition
- `401` unauthorized
- `403` forbidden
- `404` not found
- `409` conflict
- `500` internal error

---

## 7. Detailed API Reference

### 7.1 Auth and Users (`/api/auth`)

#### `POST /api/auth/register` (public)

Description:

- Registers a new user and returns token pair.
- Supports optional initial `groupId`.

Body:

```json
{
  "email": "user@example.com",
  "fullName": "John Doe",
  "password": "password123",
  "groupId": "c4fe2a53-5b32-4f6b-911f-8b4824a53f58"
}
```

Success response (`201`):

```json
{
  "ok": true,
  "data": {
    "accessToken": "eyJ...",
    "refreshToken": "eyJ..."
  }
}
```

Errors:

- `400`: invalid email/password/fullName
- `409`: email already exists

#### `POST /api/auth/login` (public)

Body:

```json
{
  "email": "user@example.com",
  "password": "password123"
}
```

Success (`200`): same token payload as register.  
Errors: `401` invalid credentials.

#### `POST /api/auth/refresh` (public)

Description:

- Exchanges refresh token for a new pair.
- Old refresh token is invalidated (rotation).

Body:

```json
{
  "refreshToken": "eyJ..."
}
```

Success (`200`):

```json
{
  "ok": true,
  "data": {
    "accessToken": "eyJ...",
    "refreshToken": "eyJ..."
  }
}
```

Errors:

- `400`: missing token
- `401`: invalid/expired/replayed token

#### `POST /api/auth/logout`

Body:

```json
{
  "refreshToken": "eyJ..."
}
```

Success (`200`):

```json
{ "ok": true, "data": null }
```

#### `GET /api/auth/me`

Success (`200`):

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

Errors:

- `401`: missing/invalid token

#### `GET /api/auth/users` (`admin`)

Success (`200`):

```json
{ "ok": true, "data": [{ "id": "uuid", "email": "u@x.com", "role": "student" }] }
```

#### `GET /api/auth/users/:id` (`teacher`, `admin`)

Success (`200`):

```json
{ "ok": true, "data": { "id": "uuid", "email": "u@x.com", "role": "student" } }
```

Errors: `404`.

#### `PATCH /api/auth/users/:id/role` (`admin`)

Body:

```json
{ "role": "teacher" }
```

Allowed values:

- `student`
- `teacher`
- `admin`

Success (`200`): updated user.

#### `POST /api/auth/groups` (`admin`)

Body:

```json
{ "name": "IT-21" }
```

Success (`201`): group object.  
Errors: `409`.

#### `GET /api/auth/groups`

Gateway treats this route as public.

Success (`200`): group list.

#### `GET /api/auth/groups/:id` (`teacher`, `admin`)

Returns group with members.  
Errors: `404`.

#### `POST /api/auth/groups/:id/members` (`teacher`, `admin`)

Body:

```json
{ "userId": "uuid" }
```

Success (`200`): user assigned to group.

#### `DELETE /api/auth/groups/:id/members/:userId` (`teacher`, `admin`)

Success (`200`): `{ ok: true, data: null }`.

---

### 7.2 File System (`/api/fs`)

#### `POST /api/fs/projects`

Description:

- Creates project metadata.
- Initializes project files in storage (`main.py` or `index.js` by language).

Body:

```json
{
  "name": "my-project",
  "language": "python",
  "taskId": "uuid-optional",
  "templateCode": "# starter code optional"
}
```

Success (`201`):

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

#### `GET /api/fs/projects`

Returns current user project list.

#### `GET /api/fs/projects/:id`

Access:

- student: own project only
- teacher/admin: any project

Errors: `403`, `404`.

#### `GET /api/fs/:projectId/tree`

Returns recursive tree where directories are listed before files.

Example (`200`):

```json
{
  "ok": true,
  "data": [
    { "name": "src", "path": "src", "type": "dir", "children": [] },
    { "name": "main.py", "path": "main.py", "type": "file" }
  ]
}
```

#### `GET /api/fs/:projectId/file?path=src/main.py`

Query params:

- `path` (required, relative to project root)

Success (`200`):

```json
{
  "ok": true,
  "data": {
    "path": "src/main.py",
    "content": "print('hello')\n"
  }
}
```

Errors: `400`, `403`, `404`.

#### `PUT /api/fs/:projectId/file`

Body:

```json
{
  "path": "src/main.py",
  "content": "print('hello')\n"
}
```

Notes:

- Creates directories if needed.
- Denied for readonly project.

#### `POST /api/fs/:projectId/file`

Body:

```json
{
  "path": "src/utils.py",
  "type": "file"
}
```

Use `"type": "dir"` to create directory.

Errors:

- `409` already exists
- `403` readonly

#### `DELETE /api/fs/:projectId/file?path=src/utils.py`

Deletes file or directory recursively.

#### `PATCH /api/fs/:projectId/rename`

Body:

```json
{
  "oldPath": "main.py",
  "newPath": "src/main.py"
}
```

All FS write routes enforce traversal and access checks.

---

### 7.3 Tasks (`/api/tasks`)

#### `POST /api/tasks` (`teacher`, `admin`)

Body:

```json
{
  "title": "Task 1",
  "description": "Solve...",
  "language": "python",
  "templateCode": "# write code",
  "timeLimitMin": 60
}
```

Constraints:

- `timeLimitMin` from 5 to 300.

#### `GET /api/tasks` (`teacher`, `admin`)

Returns teacher's own task list.

#### `GET /api/tasks/:id`

Student behavior:

- hidden test cases are removed from response.

#### `PATCH /api/tasks/:id` (`teacher`, `admin`)

Only task author or admin can update.

Updatable fields:

- `title`
- `description`
- `templateCode`
- `timeLimitMin`

#### `DELETE /api/tasks/:id` (`teacher`, `admin`)

Only author/admin.

#### `POST /api/tasks/:id/test-cases` (`teacher`, `admin`)

Body:

```json
{
  "input": "5\n3",
  "expectedOutput": "8",
  "isHidden": true,
  "points": 2,
  "orderIndex": 0
}
```

#### `PATCH /api/tasks/:id/test-cases/:tcId` (`teacher`, `admin`)

Partial update allowed.

#### `DELETE /api/tasks/:id/test-cases/:tcId` (`teacher`, `admin`)

Removes test case.

---

### 7.4 Task Folders (`/api/task-folders`)

#### `GET /api/task-folders` (`teacher`, `admin`)

Returns teacher-created folders.

#### `POST /api/task-folders` (`teacher`, `admin`)

Body:

```json
{ "name": "Algorithms" }
```

#### `DELETE /api/task-folders/:id` (`teacher`, `admin`)

Only folder owner or admin.

Behavior:

- tasks remain, `folderId` becomes `null`.

#### `PATCH /api/task-folders/assign` (`teacher`, `admin`)

Body:

```json
{
  "taskId": "uuid",
  "folderId": "uuid-or-null"
}
```

Assigns task to folder or removes assignment.

---

### 7.5 Exams (`/api/exams`)

#### `POST /api/exams` (`teacher`, `admin`)

Body:

```json
{
  "groupId": "uuid",
  "taskId": "uuid-optional",
  "folderId": "uuid-optional",
  "title": "Python Midterm",
  "openMode": "manual",
  "startsAt": "2026-05-01T09:00:00Z",
  "endsAt": "2026-05-01T11:00:00Z"
}
```

Validation:

- `groupId` is required.
- At least one of `taskId` or `folderId` must be set.

Response includes generated invite token.

#### `GET /api/exams` (`teacher`, `admin`)

Teacher/admin exam list.

#### `GET /api/exams/my` (student)

Student exam list by own group.

#### `GET /api/exams/my/:id` (student)

Student can read exam only if exam group equals student's group.

#### `GET /api/exams/:id` (`teacher`, `admin`)

Exam details.

#### `PATCH /api/exams/:id/open` (`teacher`, `admin`)

Moves exam to `active`.

#### `PATCH /api/exams/:id/close` (`teacher`, `admin`)

Moves exam to `closed`.

#### `GET /api/exams/:id/results` (`teacher`, `admin`)

Returns all exam sessions with submission and anti-cheat context.

#### `GET /api/exams/:id/sessions/:sessionId/anticheat` (`teacher`, `admin`)

Returns anti-cheat event log for a specific session.

#### `GET /api/exams/join/:token` (public)

Returns invite info:

```json
{
  "ok": true,
  "data": {
    "id": "uuid",
    "title": "Python Midterm",
    "status": "active",
    "task": { "id": "uuid", "title": "...", "language": "python" },
    "openMode": "manual",
    "startsAt": null,
    "endsAt": null
  }
}
```

#### `POST /api/exams/join/:token` (student)

Registers student as participant.

Response:

```json
{ "ok": true, "data": { "examId": "uuid", "joined": true } }
```

Errors:

- `403` exam closed
- `404` exam not found

#### `GET /api/exams/:id/events?token=<accessToken>` (`teacher`, `admin`)

SSE stream for live monitoring.

Event types:

- `snapshot`
- `update`
- `ping`

---

### 7.6 Sessions (`/api/sessions`)

#### `POST /api/sessions/:examId/start`

Description:

- Starts exam session.
- If session already exists, returns existing session.
- Creates student project on first run.

Success (`201`):

```json
{ "ok": true, "data": { "id": "uuid", "projectId": "uuid", "status": "in_progress" } }
```

Errors:

- `403` exam is not active / student is not participant

#### `GET /api/sessions/:examId`

Returns current user's session state.

#### `POST /api/sessions/:examId/warn`

Body:

```json
{
  "eventType": "tab_blur",
  "details": { "durationMs": 7300 }
}
```

Allowed event types:

- `tab_blur`
- `window_minimize`
- `paste_attempt`
- `devtools_open`

Response example:

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

At 3 warnings:

- session status -> `disqualified`
- project -> readonly

#### `POST /api/sessions/:examId/run-tests`

Runs all test cases through runner-service.

Response (`200`):

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

Notes:

- Hidden tests are masked for students.
- First run creates submission record.

#### `POST /api/sessions/:examId/run-code`

Runs code once without testcase scoring.

Response fields:

- `stdout`
- `stderr`
- `exitCode`
- `durationMs`
- `timedOut`

#### `POST /api/sessions/:examId/submit`

Submits session and locks project.

Response:

```json
{ "ok": true, "data": { "submitted": true, "sessionId": "uuid" } }
```

#### `GET /api/sessions/:examId/result`

Returns submission for completed session.

Errors:

- `403` if session still in progress

---

### 7.7 Runner (`/api/runner`)

#### `POST /api/runner/run`

Body:

```json
{
  "projectId": "uuid",
  "entryFile": "main.py",
  "language": "python",
  "stdin": "5\n3"
}
```

Response:

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

#### `POST /api/runner/test` (internal)

Body:

```json
{
  "projectId": "uuid",
  "userId": "uuid",
  "language": "python",
  "entryFile": "main.py",
  "testCases": [{ "input": "5\n3", "expectedOutput": "8" }]
}
```

Response:

```json
{
  "ok": true,
  "data": [
    {
      "index": 0,
      "passed": true,
      "input": "5\n3",
      "expectedOutput": "8",
      "actualOutput": "8",
      "durationMs": 340,
      "timedOut": false
    }
  ]
}
```

---

## 8. Realtime Interfaces (SSE and WebSocket)

### 8.1 Exam live updates (SSE)

Endpoint:

- `GET /api/exams/:id/events?token=<accessToken>`

Headers:

- `Accept: text/event-stream`

Server sends JSON payload in SSE `data`:

- `snapshot` initial state
- `update` when sessions changed
- `ping` every ~15 seconds for keep-alive

### 8.2 Interactive terminal (WebSocket)

URLs:

- Through gateway: `ws://localhost:4000/api/runner/terminal/:projectId`
- Direct runner: `ws://localhost:3004/terminal/:projectId`

Client -> server messages:

```json
{ "type": "input", "data": "ls\n" }
```

```json
{ "type": "resize", "cols": 120, "rows": 30 }
```

Server -> client messages:

```json
{ "type": "output", "data": "main.py\n" }
```

```json
{ "type": "exit", "code": 0 }
```

```json
{ "type": "error", "message": "Project not found" }
```

---

## 9. Data Model Reference

### User

```typescript
{
  id: string;
  email: string;
  fullName: string;
  role: "student" | "teacher" | "admin";
  groupId: string | null;
  createdAt: string;
}
```

### Group

```typescript
{
  id: string;
  name: string;
  createdAt: string;
  users?: User[];
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

### Task and TestCase

```typescript
{
  id: string;
  title: string;
  description: string;
  language: "python" | "javascript";
  templateCode: string;
  timeLimitMin: number;
  createdBy: string;
  createdAt: string;
  testCases: Array<{
    id: string;
    input: string;
    expectedOutput: string;
    isHidden: boolean;
    points: number;
    orderIndex: number;
  }>;
}
```

### TaskFolder

```typescript
{
  id: string;
  name: string;
  createdBy: string;
  createdAt: string;
}
```

### Exam

```typescript
{
  id: string;
  groupId: string;
  taskId: string | null;
  folderId: string | null;
  title: string;
  inviteToken: string;
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
  id: string;
  examId: string;
  userId: string;
  projectId: string;
  startedAt: string;
  finishedAt: string | null;
  status: "in_progress" | "submitted" | "disqualified";
  warningsCount: number;
  submission?: Submission;
}
```

### Submission

```typescript
{
  id: string;
  sessionId: string;
  userId: string;
  taskId: string;
  score: number;
  maxScore: number;
  status: "passed" | "partial" | "failed" | "error";
  resultsJson: any[];
  submittedAt: string;
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

---

## 10. Access Control Matrix

| Route | student | teacher | admin |
| --- | :---: | :---: | :---: |
| `POST /api/auth/register` | ✓ | ✓ | ✓ |
| `GET /api/auth/users` | - | - | ✓ |
| `PATCH /api/auth/users/:id/role` | - | - | ✓ |
| `GET /api/fs/projects/:id` | own | any | any |
| `PUT /api/fs/:projectId/file` | own + writable | any | any |
| `POST /api/tasks` | - | ✓ | ✓ |
| `PATCH /api/tasks/:id` | - | author | ✓ |
| `POST /api/exams` | - | ✓ | ✓ |
| `GET /api/exams/:id/results` | - | ✓ | ✓ |
| `POST /api/sessions/:examId/start` | ✓ | - | - |
| `POST /api/sessions/:examId/warn` | ✓ | - | - |
| `POST /api/sessions/:examId/submit` | ✓ | - | - |
| `POST /api/runner/run` | ✓ | ✓ | ✓ |

---

## 11. Anti-Cheat Workflow

Tracked events:

- `tab_blur`
- `window_minimize`
- `paste_attempt`
- `devtools_open`

Flow:

1. Frontend reports event via `/api/sessions/:examId/warn`.
2. Session `warningsCount` is incremented.
3. Log entry is written to `anticheat_logs`.
4. On `warningsCount >= 3`, session becomes `disqualified`.
5. Project is set readonly to prevent further edits.
6. Teacher can inspect logs with `/api/exams/:id/sessions/:sessionId/anticheat`.

---

## 12. Code Execution Security Model

Execution isolation controls:

- Docker container per run.
- `--network=none`.
- CPU/RAM/PID limits.
- Read-only filesystem and tmpfs for temporary data.
- Non-privileged user (`nobody`).
- Timeout via `CODE_TIMEOUT_MS`.
- Output limit (512 KB).

Filesystem safeguards:

- Paths are normalized.
- Access validated against project root (`resolved.startsWith(root)`).

Concurrency:

- Controlled by BullMQ + Redis.
- Limited by `MAX_CONCURRENT_RUNS`.

---

## 13. Operational Notes and Documentation Policy

### Operational recommendations

- Keep gateway as the single external entry point.
- Run DB client generation after schema changes:
  - `npm run prisma:generate:all`
- For auth-sensitive realtime calls, prefer short-lived access tokens and refresh flow.

### Documentation update policy

When endpoints or payloads change:

1. Update route implementations first.
2. Update this English documentation.
3. Update Russian documentation with identical structure and scope.
4. Verify that examples reflect real request validation rules.

Source of truth for API behavior:

- `services/*/src/routes/*.ts`
- gateway public path logic in `services/gateway/src/index.ts`
