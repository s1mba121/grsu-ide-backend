# GRSU IDE Backend - Полная техническая документация

## Содержание

1. [Обзор системы](#1-обзор-системы)
2. [Архитектура и поток запросов](#2-архитектура-и-поток-запросов)
3. [Быстрый старт](#3-быстрый-старт)
4. [Конфигурация окружения](#4-конфигурация-окружения)
5. [Сервисы и зоны ответственности](#5-сервисы-и-зоны-ответственности)
6. [Общие правила API](#6-общие-правила-api)
7. [Подробный API Reference](#7-подробный-api-reference)
8. [Realtime-интерфейсы (SSE и WebSocket)](#8-realtime-интерфейсы-sse-и-websocket)
9. [Справочник моделей данных](#9-справочник-моделей-данных)
10. [Матрица прав доступа](#10-матрица-прав-доступа)
11. [Античит-процесс](#11-античит-процесс)
12. [Модель безопасности запуска кода](#12-модель-безопасности-запуска-кода)
13. [Эксплуатационные заметки и политика документации](#13-эксплуатационные-заметки-и-политика-документации)

---

## 1. Обзор системы

GRSU IDE Backend - микросервисный backend для браузерных экзаменов по программированию.

Основные сценарии:

- Студент вступает в экзамен по токену, пишет код, запускает тесты, сдаёт работу.
- Преподаватель создаёт задания и экзамены, отслеживает сессии и нарушения.
- Администратор управляет пользователями, ролями и группами.

Весь внешний трафик должен идти через `gateway` (`:4000`).

---

## 2. Архитектура и поток запросов

```
Client
  |
  v
Gateway :4000 (проверка JWT + прокси + инъекция заголовков)
  |- /api/auth         -> auth-service   :3001
  |- /api/fs           -> fs-service     :3002
  |- /api/tasks        -> task-service   :3003
  |- /api/task-folders -> task-service   :3003
  |- /api/exams        -> task-service   :3003
  |- /api/sessions     -> task-service   :3003
  \- /api/runner       -> runner-service :3004
```

Технологический стек:

- Node.js 20+, TypeScript
- Fastify
- Prisma + PostgreSQL
- Redis + BullMQ
- Docker (изолированный запуск)
- WebSocket (`@fastify/websocket`)

Поведение gateway по auth:

- Проверяет JWT для всех непубличных путей.
- Поддерживает JWT из:
  - `Authorization: Bearer <token>`
  - query-параметра `?token=<token>` (нужно для SSE-сценариев)
- Передаёт в downstream доверенные заголовки:
  - `x-user-id`
  - `x-user-email`
  - `x-user-role`
  - `x-user-fullname`
  - `x-user-groupid`

Публичные пути в текущей реализации gateway:

- `POST /api/auth/register`
- `POST /api/auth/login`
- `POST /api/auth/refresh`
- `GET /api/auth/groups`
- `GET /api/exams/join/:token`
- `GET /health`

---

## 3. Быстрый старт

### Требования

- Docker и Docker Compose
- Node.js 20+
- npm 10+

### Инициализация

```bash
npm install
cp .env.example .env
docker compose -f docker-compose.dev.yml up --build
npm run prisma:generate:all
```

### Часто используемые команды

```bash
npm run dev:auth
npm run dev:gateway
npm run build
```

Порты по умолчанию:

- Gateway: `4000`
- Auth: `3001`
- FS: `3002`
- Task: `3003`
- Runner: `3004`

---

## 4. Конфигурация окружения

### Корневой `.env`

| Переменная | Описание |
| --- | --- |
| `POSTGRES_USER` | Пользователь PostgreSQL |
| `POSTGRES_PASSWORD` | Пароль PostgreSQL |
| `POSTGRES_DB` | Имя базы PostgreSQL |
| `JWT_ACCESS_SECRET` | Секрет access-токена |
| `JWT_REFRESH_SECRET` | Секрет refresh-токена |
| `JWT_ACCESS_EXPIRES` | TTL access-токена |
| `JWT_REFRESH_EXPIRES` | TTL refresh-токена |
| `BCRYPT_ROUNDS` | Раунды хэширования пароля |

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

## 5. Сервисы и зоны ответственности

### Gateway

- Проверка JWT и граница доверия.
- Проксирование запросов в downstream.
- Обработка SSE-проксирования для `/api/exams/:id/events`.

### Auth service

- Register/login/refresh/logout.
- Управление пользователями и группами.
- Rotation refresh-токенов и защита от повторного использования.

### FS service

- Метаданные проектов.
- Дерево и операции с файлами.
- Защита от traversal и контроль readonly.

### Task service

- Задания и тест-кейсы.
- Папки задач.
- Экзамены, участники, сессии, submissions, античит-логи.

### Runner service

- Разовый запуск кода.
- Пакетный запуск тест-кейсов.
- Интерактивный терминал по WebSocket.

---

## 6. Общие правила API

Базовый URL:

- `http://localhost:4000`

Стандартная обёртка ответа:

```json
{ "ok": true, "data": {} }
{ "ok": false, "error": "Читаемое сообщение ошибки" }
```

Аутентификация:

- Для защищённых маршрутов нужен access-token.
- Передавать:
  - `Authorization: Bearer <accessToken>`
  - или `?token=<accessToken>` для SSE endpoint.

Типовые HTTP-коды:

- `200` успешно
- `201` создано
- `400` ошибка валидации / бизнес-предусловий
- `401` не авторизован
- `403` запрещено
- `404` не найдено
- `409` конфликт
- `500` внутренняя ошибка

---

## 7. Подробный API Reference

### 7.1 Auth и Users (`/api/auth`)

#### `POST /api/auth/register` (публичный)

Описание:

- Регистрирует нового пользователя и возвращает пару токенов.
- Поддерживает опциональный `groupId`.

Body:

```json
{
  "email": "user@example.com",
  "fullName": "Иван Иванов",
  "password": "password123",
  "groupId": "c4fe2a53-5b32-4f6b-911f-8b4824a53f58"
}
```

Успешный ответ (`201`):

```json
{
  "ok": true,
  "data": {
    "accessToken": "eyJ...",
    "refreshToken": "eyJ..."
  }
}
```

Ошибки:

- `400`: некорректный email/пароль/fullName
- `409`: email уже существует

#### `POST /api/auth/login` (публичный)

Body:

```json
{
  "email": "user@example.com",
  "password": "password123"
}
```

Успешный ответ (`200`): та же структура токенов, что при register.  
Ошибки: `401` неверные учетные данные.

#### `POST /api/auth/refresh` (публичный)

Описание:

- Обменивает refresh-токен на новую пару.
- Старый refresh-токен инвалидируется (rotation).

Body:

```json
{
  "refreshToken": "eyJ..."
}
```

Успешный ответ (`200`):

```json
{
  "ok": true,
  "data": {
    "accessToken": "eyJ...",
    "refreshToken": "eyJ..."
  }
}
```

Ошибки:

- `400`: токен не передан
- `401`: токен невалидный/просроченный/повторно использованный

#### `POST /api/auth/logout`

Body:

```json
{
  "refreshToken": "eyJ..."
}
```

Успешный ответ (`200`):

```json
{ "ok": true, "data": null }
```

#### `GET /api/auth/me`

Успешный ответ (`200`):

```json
{
  "ok": true,
  "data": {
    "id": "uuid",
    "email": "user@example.com",
    "fullName": "Иван Иванов",
    "role": "student",
    "groupId": null,
    "createdAt": "2026-04-06T19:47:00.000Z"
  }
}
```

Ошибки:

- `401`: отсутствует/невалидный токен

#### `GET /api/auth/users` (`admin`)

Успешный ответ (`200`):

```json
{ "ok": true, "data": [{ "id": "uuid", "email": "u@x.com", "role": "student" }] }
```

#### `GET /api/auth/users/:id` (`teacher`, `admin`)

Успешный ответ (`200`):

```json
{ "ok": true, "data": { "id": "uuid", "email": "u@x.com", "role": "student" } }
```

Ошибки: `404`.

#### `PATCH /api/auth/users/:id/role` (`admin`)

Body:

```json
{ "role": "teacher" }
```

Допустимые значения:

- `student`
- `teacher`
- `admin`

Успешный ответ (`200`): обновлённый пользователь.

#### `POST /api/auth/groups` (`admin`)

Body:

```json
{ "name": "ИТ-21" }
```

Успешный ответ (`201`): объект группы.  
Ошибки: `409`.

#### `GET /api/auth/groups`

На уровне gateway считается публичным маршрутом.

Успешный ответ (`200`): список групп.

#### `GET /api/auth/groups/:id` (`teacher`, `admin`)

Возвращает группу с участниками.  
Ошибки: `404`.

#### `POST /api/auth/groups/:id/members` (`teacher`, `admin`)

Body:

```json
{ "userId": "uuid" }
```

Успешный ответ (`200`): пользователь после привязки к группе.

#### `DELETE /api/auth/groups/:id/members/:userId` (`teacher`, `admin`)

Успешный ответ (`200`): `{ ok: true, data: null }`.

---

### 7.2 File System (`/api/fs`)

#### `POST /api/fs/projects`

Описание:

- Создаёт метаданные проекта.
- Инициализирует стартовые файлы в storage (`main.py` или `index.js` по языку).

Body:

```json
{
  "name": "my-project",
  "language": "python",
  "taskId": "uuid-опционально",
  "templateCode": "# стартовый код опционально"
}
```

Успешный ответ (`201`):

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

Возвращает список проектов текущего пользователя.

#### `GET /api/fs/projects/:id`

Доступ:

- student: только свой проект
- teacher/admin: любой проект

Ошибки: `403`, `404`.

#### `GET /api/fs/:projectId/tree`

Возвращает рекурсивное дерево, где директории идут перед файлами.

Пример (`200`):

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

Query-параметры:

- `path` (обязателен, относительный путь от корня проекта)

Успешный ответ (`200`):

```json
{
  "ok": true,
  "data": {
    "path": "src/main.py",
    "content": "print('hello')\n"
  }
}
```

Ошибки: `400`, `403`, `404`.

#### `PUT /api/fs/:projectId/file`

Body:

```json
{
  "path": "src/main.py",
  "content": "print('hello')\n"
}
```

Примечания:

- При необходимости создаёт промежуточные директории.
- Для readonly-проекта возвращает отказ.

#### `POST /api/fs/:projectId/file`

Body:

```json
{
  "path": "src/utils.py",
  "type": "file"
}
```

Для директории использовать `"type": "dir"`.

Ошибки:

- `409` уже существует
- `403` readonly

#### `DELETE /api/fs/:projectId/file?path=src/utils.py`

Удаляет файл или директорию рекурсивно.

#### `PATCH /api/fs/:projectId/rename`

Body:

```json
{
  "oldPath": "main.py",
  "newPath": "src/main.py"
}
```

Все write-маршруты FS выполняют проверки доступа и traversal.

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

Ограничения:

- `timeLimitMin` от 5 до 300.

#### `GET /api/tasks` (`teacher`, `admin`)

Возвращает список задач текущего преподавателя.

#### `GET /api/tasks/:id`

Для студента:

- скрытые тест-кейсы исключаются из ответа.

#### `PATCH /api/tasks/:id` (`teacher`, `admin`)

Обновлять может только автор задачи или admin.

Обновляемые поля:

- `title`
- `description`
- `templateCode`
- `timeLimitMin`

#### `DELETE /api/tasks/:id` (`teacher`, `admin`)

Только автор/admin.

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

Поддерживает частичное обновление.

#### `DELETE /api/tasks/:id/test-cases/:tcId` (`teacher`, `admin`)

Удаляет тест-кейс.

---

### 7.4 Task Folders (`/api/task-folders`)

#### `GET /api/task-folders` (`teacher`, `admin`)

Возвращает папки, созданные преподавателем.

#### `POST /api/task-folders` (`teacher`, `admin`)

Body:

```json
{ "name": "Algorithms" }
```

#### `DELETE /api/task-folders/:id` (`teacher`, `admin`)

Только владелец папки или admin.

Поведение:

- задачи сохраняются, `folderId` становится `null`.

#### `PATCH /api/task-folders/assign` (`teacher`, `admin`)

Body:

```json
{
  "taskId": "uuid",
  "folderId": "uuid-or-null"
}
```

Назначает/снимает папку у задачи.

---

### 7.5 Exams (`/api/exams`)

#### `POST /api/exams` (`teacher`, `admin`)

Body:

```json
{
  "groupId": "uuid",
  "taskId": "uuid-опционально",
  "folderId": "uuid-опционально",
  "title": "Python Midterm",
  "openMode": "manual",
  "startsAt": "2026-05-01T09:00:00Z",
  "endsAt": "2026-05-01T11:00:00Z"
}
```

Валидация:

- `groupId` обязателен.
- Должен быть задан хотя бы один из `taskId` или `folderId`.

Ответ включает сгенерированный invite token.

#### `GET /api/exams` (`teacher`, `admin`)

Список экзаменов преподавателя/админа.

#### `GET /api/exams/my` (student)

Список экзаменов студента по его группе.

#### `GET /api/exams/my/:id` (student)

Студент может читать экзамен только своей группы.

#### `GET /api/exams/:id` (`teacher`, `admin`)

Детали экзамена.

#### `PATCH /api/exams/:id/open` (`teacher`, `admin`)

Переводит экзамен в `active`.

#### `PATCH /api/exams/:id/close` (`teacher`, `admin`)

Переводит экзамен в `closed`.

#### `GET /api/exams/:id/results` (`teacher`, `admin`)

Возвращает все сессии экзамена вместе с submission и античит-контекстом.

#### `GET /api/exams/:id/sessions/:sessionId/anticheat` (`teacher`, `admin`)

Возвращает лог античит-событий конкретной сессии.

#### `GET /api/exams/join/:token` (публичный)

Возвращает информацию по инвайту:

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

Регистрирует студента как участника экзамена.

Ответ:

```json
{ "ok": true, "data": { "examId": "uuid", "joined": true } }
```

Ошибки:

- `403` экзамен закрыт
- `404` экзамен не найден

#### `GET /api/exams/:id/events?token=<accessToken>` (`teacher`, `admin`)

SSE-поток для мониторинга экзамена в реальном времени.

Типы событий:

- `snapshot`
- `update`
- `ping`

---

### 7.6 Sessions (`/api/sessions`)

#### `POST /api/sessions/:examId/start`

Описание:

- Запускает сессию экзамена.
- Если сессия уже есть, возвращает существующую.
- При первом старте создаёт проект студента.

Успешный ответ (`201`):

```json
{ "ok": true, "data": { "id": "uuid", "projectId": "uuid", "status": "in_progress" } }
```

Ошибки:

- `403` экзамен не активен / студент не участник

#### `GET /api/sessions/:examId`

Возвращает состояние сессии текущего пользователя.

#### `POST /api/sessions/:examId/warn`

Body:

```json
{
  "eventType": "tab_blur",
  "details": { "durationMs": 7300 }
}
```

Допустимые `eventType`:

- `tab_blur`
- `window_minimize`
- `paste_attempt`
- `devtools_open`

Пример ответа:

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

При 3 предупреждениях:

- статус сессии -> `disqualified`
- проект -> readonly

#### `POST /api/sessions/:examId/run-tests`

Запускает все тест-кейсы через runner-service.

Ответ (`200`):

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

Примечания:

- hidden-тесты маскируются для студента.
- при первом запуске создаётся submission.

#### `POST /api/sessions/:examId/run-code`

Разовый запуск кода без выставления баллов по тестам.

Поля ответа:

- `stdout`
- `stderr`
- `exitCode`
- `durationMs`
- `timedOut`

#### `POST /api/sessions/:examId/submit`

Сдаёт сессию и блокирует проект на запись.

Ответ:

```json
{ "ok": true, "data": { "submitted": true, "sessionId": "uuid" } }
```

#### `GET /api/sessions/:examId/result`

Возвращает submission для завершённой сессии.

Ошибки:

- `403` если сессия ещё в процессе

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

Ответ:

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

#### `POST /api/runner/test` (внутренний)

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

Ответ:

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

## 8. Realtime-интерфейсы (SSE и WebSocket)

### 8.1 Живые обновления экзамена (SSE)

Endpoint:

- `GET /api/exams/:id/events?token=<accessToken>`

Заголовки:

- `Accept: text/event-stream`

Сервер отправляет JSON в SSE `data`:

- `snapshot` начальное состояние
- `update` при изменении сессий
- `ping` примерно каждые 15 секунд для keep-alive

### 8.2 Интерактивный терминал (WebSocket)

URL:

- Через gateway: `ws://localhost:4000/api/runner/terminal/:projectId`
- Напрямую в runner: `ws://localhost:3004/terminal/:projectId`

Сообщения client -> server:

```json
{ "type": "input", "data": "ls\n" }
```

```json
{ "type": "resize", "cols": 120, "rows": 30 }
```

Сообщения server -> client:

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

## 9. Справочник моделей данных

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

### Task и TestCase

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

## 10. Матрица прав доступа

| Маршрут | student | teacher | admin |
| --- | :---: | :---: | :---: |
| `POST /api/auth/register` | ✓ | ✓ | ✓ |
| `GET /api/auth/users` | - | - | ✓ |
| `PATCH /api/auth/users/:id/role` | - | - | ✓ |
| `GET /api/fs/projects/:id` | свой | любой | любой |
| `PUT /api/fs/:projectId/file` | свой + writable | любой | любой |
| `POST /api/tasks` | - | ✓ | ✓ |
| `PATCH /api/tasks/:id` | - | автор | ✓ |
| `POST /api/exams` | - | ✓ | ✓ |
| `GET /api/exams/:id/results` | - | ✓ | ✓ |
| `POST /api/sessions/:examId/start` | ✓ | - | - |
| `POST /api/sessions/:examId/warn` | ✓ | - | - |
| `POST /api/sessions/:examId/submit` | ✓ | - | - |
| `POST /api/runner/run` | ✓ | ✓ | ✓ |

---

## 11. Античит-процесс

Отслеживаемые события:

- `tab_blur`
- `window_minimize`
- `paste_attempt`
- `devtools_open`

Процесс:

1. Фронтенд отправляет событие в `/api/sessions/:examId/warn`.
2. У сессии увеличивается `warningsCount`.
3. В `anticheat_logs` записывается событие.
4. При `warningsCount >= 3` сессия получает `disqualified`.
5. Проект переводится в readonly.
6. Преподаватель смотрит лог через `/api/exams/:id/sessions/:sessionId/anticheat`.

---

## 12. Модель безопасности запуска кода

Контуры изоляции запуска:

- Отдельный Docker-контейнер на каждый запуск.
- `--network=none`.
- Ограничения CPU/RAM/PID.
- Read-only filesystem и tmpfs для временных данных.
- Непривилегированный пользователь (`nobody`).
- Таймаут по `CODE_TIMEOUT_MS`.
- Лимит вывода (512 KB).

Файловая безопасность:

- Нормализация путей.
- Проверка, что путь остаётся внутри корня проекта (`resolved.startsWith(root)`).

Конкурентность:

- Контролируется BullMQ + Redis.
- Ограничивается `MAX_CONCURRENT_RUNS`.

---

## 13. Эксплуатационные заметки и политика документации

### Рекомендации по эксплуатации

- Использовать gateway как единую внешнюю точку входа.
- После изменений схем Prisma выполнять:
  - `npm run prisma:generate:all`
- Для realtime auth-сценариев использовать короткоживущие access токены и refresh flow.

### Политика обновления документации

При изменении endpoint или payload:

1. Сначала обновить route-реализацию.
2. Обновить английскую документацию.
3. Обновить русскую документацию с идентичной структурой и объёмом.
4. Проверить, что примеры соответствуют реальным validation-правилам.

Источники истины по API:

- `services/*/src/routes/*.ts`
- логика публичных маршрутов gateway в `services/gateway/src/index.ts`
