# GRSU IDE Backend — Документация

## Содержание

1. [Обзор архитектуры](#1-обзор-архитектуры)
2. [Быстрый старт](#2-быстрый-старт)
3. [Переменные окружения](#3-переменные-окружения)
4. [Сервисы](#4-сервисы)
   - [Gateway](#41-gateway-порт-4000)
   - [Auth Service](#42-auth-service-порт-3001)
   - [FS Service](#43-fs-service-порт-3002)
   - [Task Service](#44-task-service-порт-3003)
   - [Runner Service](#45-runner-service-порт-3004)
5. [API Reference](#5-api-reference)
   - [Аутентификация](#51-аутентификация-apiauth)
   - [Пользователи](#52-пользователи-apiauth)
   - [Группы](#53-группы-apiauth)
   - [Файловая система](#54-файловая-система-apifs)
   - [Задания](#55-задания-apitasks)
   - [Экзамены](#56-экзамены-apiexams)
   - [Сессии](#57-сессии-apisessions)
   - [Запуск кода](#58-запуск-кода-apirunner)
   - [Терминал (WebSocket)](#59-терминал-websocket)
6. [Модели данных](#6-модели-данных)
7. [Система ролей и доступа](#7-система-ролей-и-доступа)
8. [Античит-система](#8-античит-система)
9. [Безопасность запуска кода](#9-безопасность-запуска-кода)
10. [Shared Types](#10-shared-types)

---

## 1. Обзор архитектуры

GRSU IDE Backend — это микросервисный монорепозиторий для образовательной IDE-платформы. Клиент общается только с **Gateway** (порт `4000`), который проксирует запросы к внутренним сервисам.

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

**Стек:** Node.js, TypeScript, Fastify, Prisma ORM, PostgreSQL, Redis, Docker, BullMQ.

**Монорепо структура (npm workspaces):**

```
grsu-ide-backend/
├── services/
│   ├── auth-service/
│   ├── fs-service/
│   ├── task-service/
│   ├── runner-service/
│   └── gateway/
└── shared/
    └── types/          # @grsu/types — общие типы TypeScript
```

---

## 2. Быстрый старт

### Требования

- Docker & Docker Compose
- Node.js 20+
- npm 10+

### Запуск в dev-режиме

```bash
# 1. Клонировать репозиторий и установить зависимости
npm install

# 2. Скопировать и заполнить переменные окружения
cp .env.example .env

# 3. Запустить все сервисы через Docker Compose
docker compose -f docker-compose.dev.yml up --build

# 4. Применить миграции (в отдельном терминале, после старта postgres)
npm run prisma:generate:all
```

### Запуск отдельных сервисов локально

```bash
npm run dev:auth     # auth-service на :3001
npm run dev:gateway  # gateway на :4000
```

### Сборка всех сервисов

```bash
npm run build
```

---

## 3. Переменные окружения

### Корневые (`.env`)

| Переменная            | Описание                   | Пример              |
| --------------------- | -------------------------- | ------------------- |
| `POSTGRES_USER`       | Пользователь PostgreSQL    | `grsu`              |
| `POSTGRES_PASSWORD`   | Пароль PostgreSQL          | `change_me`         |
| `POSTGRES_DB`         | Имя базы данных            | `grsu_ide`          |
| `JWT_ACCESS_SECRET`   | Секрет access-токена       | `change_me_access`  |
| `JWT_REFRESH_SECRET`  | Секрет refresh-токена      | `change_me_refresh` |
| `JWT_ACCESS_EXPIRES`  | Время жизни access-токена  | `15m`               |
| `JWT_REFRESH_EXPIRES` | Время жизни refresh-токена | `7d`                |
| `BCRYPT_ROUNDS`       | Раундов хэширования bcrypt | `12`                |

### Per-service

#### Auth Service

| Переменная            | Описание                           |
| --------------------- | ---------------------------------- |
| `PORT`                | Порт сервиса (по умолчанию `3001`) |
| `DATABASE_URL`        | PostgreSQL DSN                     |
| `JWT_ACCESS_SECRET`   | Секрет для подписи access JWT      |
| `JWT_REFRESH_SECRET`  | Секрет для подписи refresh JWT     |
| `JWT_ACCESS_EXPIRES`  | Время жизни access-токена          |
| `JWT_REFRESH_EXPIRES` | Время жизни refresh-токена         |
| `BCRYPT_ROUNDS`       | Раунды bcrypt                      |

#### FS Service

| Переменная     | Описание                               |
| -------------- | -------------------------------------- |
| `PORT`         | Порт сервиса (по умолчанию `3002`)     |
| `DATABASE_URL` | PostgreSQL DSN                         |
| `STORAGE_PATH` | Путь к корневой папке хранилища файлов |

#### Task Service

| Переменная           | Описание                           |
| -------------------- | ---------------------------------- |
| `PORT`               | Порт сервиса (по умолчанию `3003`) |
| `DATABASE_URL`       | PostgreSQL DSN                     |
| `FS_SERVICE_URL`     | URL fs-service                     |
| `RUNNER_SERVICE_URL` | URL runner-service                 |

#### Runner Service

| Переменная            | Описание                                             |
| --------------------- | ---------------------------------------------------- |
| `PORT`                | Порт сервиса (по умолчанию `3004`)                   |
| `REDIS_URL`           | Redis DSN                                            |
| `FS_SERVICE_URL`      | URL fs-service                                       |
| `STORAGE_PATH`        | Путь к хранилищу (должен совпадать с fs-service)     |
| `CODE_TIMEOUT_MS`     | Таймаут выполнения кода в мс (по умолчанию `15000`)  |
| `MAX_CONCURRENT_RUNS` | Максимум параллельных контейнеров (по умолчанию `5`) |

#### Gateway

| Переменная           | Описание                           |
| -------------------- | ---------------------------------- |
| `PORT`               | Порт сервиса (по умолчанию `4000`) |
| `JWT_ACCESS_SECRET`  | Секрет для верификации JWT         |
| `AUTH_SERVICE_URL`   | URL auth-service                   |
| `FS_SERVICE_URL`     | URL fs-service                     |
| `TASK_SERVICE_URL`   | URL task-service                   |
| `RUNNER_SERVICE_URL` | URL runner-service                 |

---

## 4. Сервисы

### 4.1 Gateway (порт 4000)

Единая точка входа. Отвечает за:

- **Верификацию JWT** для всех запросов, кроме публичных маршрутов.
- **Добавление заголовков** `x-user-id`, `x-user-email`, `x-user-role` к запросам к downstream-сервисам.
- **Проксирование** запросов по prefix-правилам.

**Публичные маршруты** (не требуют JWT):

- `POST /api/auth/register`
- `POST /api/auth/login`
- `POST /api/auth/refresh`
- `GET /api/exams/join/:token`
- `GET /health`

**Таблица маршрутизации:**

| Prefix          | Перенаправляется в  | Rewrite     |
| --------------- | ------------------- | ----------- |
| `/api/auth`     | auth-service:3001   | `/auth`     |
| `/api/fs`       | fs-service:3002     | `/fs`       |
| `/api/tasks`    | task-service:3003   | `/tasks`    |
| `/api/exams`    | task-service:3003   | `/exams`    |
| `/api/sessions` | task-service:3003   | `/sessions` |
| `/api/runner`   | runner-service:3004 | `/runner`   |

---

### 4.2 Auth Service (порт 3001)

Управляет аутентификацией, пользователями и группами.

**Особенности:**

- Пароли хэшируются через `bcryptjs`.
- Refresh-токены хранятся в БД. При обновлении токен немедленно удаляется (token rotation). Повторное использование одного refresh-токена инвалидирует все токены пользователя.
- Access-токен подписывается `JWT_ACCESS_SECRET`, refresh-токен — `JWT_REFRESH_SECRET`.

**База данных — таблицы:**

- `groups` — учебные группы
- `users` — пользователи (роли: `student`, `teacher`, `admin`)
- `refresh_tokens` — хранилище refresh-токенов

---

### 4.3 FS Service (порт 3002)

Управляет проектами и файлами на диске.

**Структура хранилища на диске:**

```
STORAGE_PATH/
└── users/
    └── {userId}/
        └── projects/
            └── {projectId}/
                ├── main.py       # или index.js
                └── ...
```

**Особенности:**

- Защита от path traversal: пути проверяются через `resolved.startsWith(root)`.
- Флаг `isReadonly` на проекте: после сдачи студент не может изменять файлы.
- При создании проекта автоматически создаётся файл-заготовка (`main.py` или `index.js`) с шаблонным кодом.
- Дерево файлов возвращается рекурсивно, папки идут перед файлами.

**База данных — таблицы:**

- `projects` — мета-данные проектов

---

### 4.4 Task Service (порт 3003)

Управляет заданиями, экзаменами и сессиями студентов.

**Особенности:**

- Скрытые тест-кейсы (`isHidden: true`) не видны студентам — их `input` и `expectedOutput` заменяются на `***`.
- Экзамены создаются с уникальным `inviteToken` (nanoid, 32 символа).
- При старте сессии автоматически создаётся проект студента через fs-service.
- После сдачи (`submit`) проект замораживается через fs-service (`isReadonly: true`).
- 3 античит-предупреждения → автоматическая дисквалификация + заморозка проекта.

**База данных — таблицы:**

- `tasks` — задания
- `test_cases` — тест-кейсы к заданиям
- `exams` — экзамены
- `exam_participants` — участники экзаменов
- `exam_sessions` — сессии студентов
- `anticheat_logs` — журнал нарушений
- `submissions` — результаты сдачи

---

### 4.5 Runner Service (порт 3004)

Безопасный запуск пользовательского кода в изолированных Docker-контейнерах.

**Особенности:**

- Каждый запуск — отдельный Docker-контейнер (`--rm`).
- Файлы проекта монтируются только на чтение (`ro`).
- Очередь на основе BullMQ + Redis: `concurrency = MAX_CONCURRENT_RUNS`.
- Поддержка интерактивного терминала через WebSocket (`@fastify/websocket`).
- Вывод нормализуется перед сравнением (`trim()` + `trimEnd()` для каждой строки).

**Docker-ограничения для пользовательского кода:**

| Ограничение      | Значение                                  |
| ---------------- | ----------------------------------------- |
| Сеть             | `--network=none`                          |
| RAM              | `--memory=128m`                           |
| Swap             | `--memory-swap=128m`                      |
| CPU              | `--cpus=0.5`                              |
| Процессы         | `--pids-limit=50`                         |
| Файловая система | `--read-only` (только `/tmp` через tmpfs) |
| Пользователь     | `--user=nobody`                           |
| Таймаут          | `CODE_TIMEOUT_MS` (по умолчанию 15 сек)   |
| Максимум вывода  | 512 КБ                                    |

**Docker-образы:**

| Язык       | Образ              |
| ---------- | ------------------ |
| Python     | `python:3.12-slim` |
| JavaScript | `node:20-slim`     |

---

## 5. API Reference

> Все ответы имеют формат:
>
> ```json
> { "ok": true, "data": <payload> }      // успех
> { "ok": false, "error": "<сообщение>" } // ошибка
> ```
>
> Базовый URL: `http://localhost:4000`
>
> Для защищённых маршрутов передавать заголовок:
>
> ```
> Authorization: Bearer <accessToken>
> ```

---

### 5.1 Аутентификация (`/api/auth`)

#### `POST /api/auth/register`

Регистрация нового пользователя. Публичный.

**Body:**

```json
{
  "email": "user@example.com",
  "fullName": "Иван Иванов",
  "password": "minlength8"
}
```

**Ответ `201`:**

```json
{
  "ok": true,
  "data": {
    "accessToken": "eyJ...",
    "refreshToken": "eyJ..."
  }
}
```

**Ошибки:** `400` — валидация, `409` — email уже существует.

---

#### `POST /api/auth/login`

Вход в систему. Публичный.

**Body:**

```json
{
  "email": "user@example.com",
  "password": "password123"
}
```

**Ответ `200`:**

```json
{
  "ok": true,
  "data": {
    "accessToken": "eyJ...",
    "refreshToken": "eyJ..."
  }
}
```

**Ошибки:** `401` — неверные данные.

---

#### `POST /api/auth/refresh`

Обновление пары токенов. Публичный. Старый refresh-токен инвалидируется.

**Body:**

```json
{
  "refreshToken": "eyJ..."
}
```

**Ответ `200`:** Новая пара `{ accessToken, refreshToken }`.

**Ошибки:** `401` — невалидный/истёкший/уже использованный токен.

---

#### `POST /api/auth/logout`

Выход. Инвалидирует refresh-токен. Требует JWT.

**Body:**

```json
{
  "refreshToken": "eyJ..."
}
```

**Ответ `200`:** `{ "ok": true, "data": null }`

---

#### `GET /api/auth/me`

Данные текущего пользователя. Требует JWT.

**Ответ `200`:**

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

---

### 5.2 Пользователи (`/api/auth`)

#### `GET /api/auth/users`

Список всех пользователей. Требует роль `admin`.

**Ответ `200`:** `{ "ok": true, "data": [ ...User[] ] }`

---

#### `GET /api/auth/users/:id`

Данные пользователя по ID. Требует роль `admin` или `teacher`.

**Ответ `200`:** `{ "ok": true, "data": User }`

---

#### `PATCH /api/auth/users/:id/role`

Изменить роль пользователя. Требует роль `admin`.

**Body:**

```json
{
  "role": "teacher"
}
```

Допустимые роли: `student`, `teacher`, `admin`.

**Ответ `200`:** `{ "ok": true, "data": User }`

---

### 5.3 Группы (`/api/auth`)

#### `POST /api/auth/groups`

Создать группу. Требует роль `admin`.

**Body:**

```json
{
  "name": "ИТ-21"
}
```

**Ответ `201`:** `{ "ok": true, "data": Group }`

**Ошибки:** `409` — группа с таким именем уже существует.

---

#### `GET /api/auth/groups`

Список групп. Требует роль `admin` или `teacher`.

**Ответ `200`:** `{ "ok": true, "data": Group[] }`

---

#### `GET /api/auth/groups/:id`

Детали группы с членами. Требует роль `admin` или `teacher`.

**Ответ `200`:** `{ "ok": true, "data": Group & { users: User[] } }`

---

#### `POST /api/auth/groups/:id/members`

Добавить студента в группу. Требует роль `admin` или `teacher`.

**Body:**

```json
{
  "userId": "uuid"
}
```

**Ответ `200`:** `{ "ok": true, "data": User }`

---

#### `DELETE /api/auth/groups/:id/members/:userId`

Удалить студента из группы. Требует роль `admin` или `teacher`.

**Ответ `200`:** `{ "ok": true, "data": null }`

---

### 5.4 Файловая система (`/api/fs`)

Все эндпоинты требуют JWT. Студент имеет доступ только к своим проектам.

#### `POST /api/fs/projects`

Создать проект. Автоматически создаёт файл-заготовку на диске.

**Body:**

```json
{
  "name": "my-project",
  "language": "python",
  "taskId": "uuid (опционально)",
  "templateCode": "# стартовый код (опционально)"
}
```

**Ответ `201`:**

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

Список проектов текущего пользователя.

**Ответ `200`:** `{ "ok": true, "data": Project[] }`

---

#### `GET /api/fs/projects/:id`

Мета-данные проекта. Студент видит только свой; teacher/admin — любой.

**Ответ `200`:** `{ "ok": true, "data": Project }`

---

#### `GET /api/fs/:projectId/tree`

Дерево файлов проекта. Папки идут первыми, затем файлы (сортировка по имени).

**Ответ `200`:**

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

Получить содержимое файла.

**Query params:** `path` — относительный путь от корня проекта (обязателен).

**Ответ `200`:**

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

Сохранить содержимое файла. Создаёт директории автоматически. Запрещён для readonly-проектов.

**Body:**

```json
{
  "path": "src/main.py",
  "content": "print('hello')\n"
}
```

**Ответ `200`:** `{ "ok": true, "data": null }`

---

#### `POST /api/fs/:projectId/file`

Создать пустой файл или директорию. Запрещён для readonly-проектов.

**Body:**

```json
{
  "path": "src/utils.py",
  "type": "file"
}
```

Или `"type": "dir"` для директории.

**Ответ `201`:** `{ "ok": true, "data": null }`

**Ошибки:** `409` — файл/папка уже существует.

---

#### `DELETE /api/fs/:projectId/file?path=src/utils.py`

Удалить файл или директорию (рекурсивно). Запрещён для readonly-проектов.

**Ответ `200`:** `{ "ok": true, "data": null }`

---

#### `PATCH /api/fs/:projectId/rename`

Переименовать или переместить файл/директорию. Запрещён для readonly-проектов.

**Body:**

```json
{
  "oldPath": "main.py",
  "newPath": "src/main.py"
}
```

**Ответ `200`:** `{ "ok": true, "data": null }`

---

### 5.5 Задания (`/api/tasks`)

#### `POST /api/tasks`

Создать задание. Требует роль `teacher` или `admin`.

**Body:**

```json
{
  "title": "Задание 1: Сортировка",
  "description": "Описание задания...",
  "language": "python",
  "templateCode": "# Напишите решение",
  "timeLimitMin": 60
}
```

**Ответ `201`:** `{ "ok": true, "data": Task }`

---

#### `GET /api/tasks`

Список заданий преподавателя. Требует роль `teacher` или `admin`.

**Ответ `200`:** `{ "ok": true, "data": Task[] }`

---

#### `GET /api/tasks/:id`

Детали задания. Студенты не видят скрытые тест-кейсы.

**Ответ `200`:** `{ "ok": true, "data": Task & { testCases: TestCase[] } }`

---

#### `PATCH /api/tasks/:id`

Обновить задание. Только автор или `admin`.

**Body (все поля опциональны):**

```json
{
  "title": "Новое название",
  "description": "...",
  "templateCode": "...",
  "timeLimitMin": 90
}
```

**Ответ `200`:** `{ "ok": true, "data": Task }`

---

#### `DELETE /api/tasks/:id`

Удалить задание. Только автор или `admin`.

**Ответ `200`:** `{ "ok": true, "data": null }`

---

#### `POST /api/tasks/:id/test-cases`

Добавить тест-кейс к заданию. Требует роль `teacher` или `admin`.

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

**Ответ `201`:** `{ "ok": true, "data": TestCase }`

---

#### `PATCH /api/tasks/:id/test-cases/:tcId`

Обновить тест-кейс. Требует роль `teacher` или `admin`.

**Body (все поля опциональны):**

```json
{
  "input": "новый ввод",
  "expectedOutput": "новый вывод",
  "isHidden": false,
  "points": 5
}
```

**Ответ `200`:** `{ "ok": true, "data": TestCase }`

---

#### `DELETE /api/tasks/:id/test-cases/:tcId`

Удалить тест-кейс. Требует роль `teacher` или `admin`.

**Ответ `200`:** `{ "ok": true, "data": null }`

---

### 5.6 Экзамены (`/api/exams`)

#### `POST /api/exams`

Создать экзамен. Требует роль `teacher` или `admin`. Автоматически генерируется `inviteToken`.

**Body:**

```json
{
  "taskId": "uuid",
  "title": "Экзамен по Python",
  "openMode": "manual",
  "startsAt": "2026-05-01T09:00:00Z",
  "endsAt": "2026-05-01T11:00:00Z"
}
```

`openMode`: `"manual"` (открывается вручную) или `"scheduled"` (по расписанию).

**Ответ `201`:** `{ "ok": true, "data": Exam }`

---

#### `GET /api/exams`

Список экзаменов преподавателя. Требует роль `teacher` или `admin`.

**Ответ `200`:** `{ "ok": true, "data": Exam[] }`

---

#### `GET /api/exams/:id`

Детали экзамена. Требует роль `teacher` или `admin`.

**Ответ `200`:** `{ "ok": true, "data": Exam }`

---

#### `PATCH /api/exams/:id/open`

Открыть экзамен (перевести в `active`). Требует роль `teacher` или `admin`.

**Ответ `200`:** `{ "ok": true, "data": Exam }`

---

#### `PATCH /api/exams/:id/close`

Закрыть экзамен. Требует роль `teacher` или `admin`.

**Ответ `200`:** `{ "ok": true, "data": Exam }`

---

#### `GET /api/exams/:id/results`

Сводная таблица результатов всех студентов. Требует роль `teacher` или `admin`.

**Ответ `200`:** `{ "ok": true, "data": ExamSession[] }`

---

#### `GET /api/exams/:id/sessions/:sessionId/anticheat`

Журнал античит-событий конкретной сессии. Требует роль `teacher` или `admin`.

**Ответ `200`:** `{ "ok": true, "data": AntiCheatLog[] }`

---

#### `GET /api/exams/join/:token` (публичный)

Информация об экзамене по инвайт-ссылке.

**Ответ `200`:**

```json
{
  "ok": true,
  "data": {
    "id": "uuid",
    "title": "Экзамен по Python",
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

Записаться на экзамен по инвайт-ссылке. Требует JWT (студент).

**Ответ `200`:** `{ "ok": true, "data": { "examId": "uuid", "joined": true } }`

**Ошибки:** `403` — экзамен закрыт.

---

### 5.7 Сессии (`/api/sessions`)

#### `POST /api/sessions/:examId/start`

Начать экзамен. Требует JWT. Если сессия уже существует — возвращает её (поддержка переподключения). При первом запуске автоматически создаётся проект студента в fs-service.

**Ответ `201`:** `{ "ok": true, "data": ExamSession & { projectId: string } }`

**Ошибки:** `403` — экзамен не активен, студент не записан.

---

#### `GET /api/sessions/:examId`

Статус сессии текущего пользователя.

**Ответ `200`:** `{ "ok": true, "data": ExamSession }`

---

#### `POST /api/sessions/:examId/warn`

Зафиксировать античит-событие. Требует JWT. 3 события → дисквалификация.

**Body:**

```json
{
  "eventType": "tab_blur",
  "details": { "url": "https://google.com" }
}
```

Допустимые `eventType`: `tab_blur`, `window_minimize`, `paste_attempt`, `devtools_open`.

**Ответ `200`:**

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

При дисквалификации: `"disqualified": true`, проект замораживается.

---

#### `POST /api/sessions/:examId/run-tests`

Запустить все тест-кейсы задания против кода студента. Сохраняет первый результат как `Submission`.

**Ответ `200`:**

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

Сдать работу. Замораживает проект (`isReadonly: true`). Статус сессии → `submitted`.

**Ответ `200`:** `{ "ok": true, "data": { "submitted": true, "sessionId": "uuid" } }`

---

#### `GET /api/sessions/:examId/result`

Получить результат сдачи. Только для завершённых сессий.

**Ответ `200`:** `{ "ok": true, "data": Submission }`

**Ошибки:** `403` — экзамен ещё не сдан.

---

### 5.8 Запуск кода (`/api/runner`)

#### `POST /api/runner/run`

Разовый запуск файла. Требует JWT.

**Body:**

```json
{
  "projectId": "uuid",
  "entryFile": "main.py",
  "language": "python",
  "stdin": "5\n3"
}
```

**Ответ `200`:**

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

**Ошибки:** `401` — нет JWT, `404` — проект не найден.

---

#### `POST /api/runner/test` (внутренний)

Прогон тест-кейсов. Вызывается из task-service. JWT не требуется (межсервисный вызов).

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

**Ответ `200`:** `{ "ok": true, "data": TestResult[] }`

---

### 5.9 Терминал (WebSocket)

**URL:** `ws://localhost:4000/terminal/:projectId`

**Заголовки:** `x-user-id` и `x-user-role` (добавляются gateway автоматически).

После подключения сервер открывает интерактивный `sh`-терминал внутри Docker-контейнера с примонтированными файлами проекта.

#### Входящие сообщения (клиент → сервер)

```json
{ "type": "input", "data": "ls\n" }
```

```json
{ "type": "resize", "cols": 80, "rows": 24 }
```

#### Исходящие сообщения (сервер → клиент)

```json
{ "type": "output", "data": "main.py\n" }
```

```json
{ "type": "exit", "code": 0 }
```

```json
{ "type": "error", "message": "Проект не найден" }
```

При подключении сервер отправляет приветственное сообщение:

```
✓ Терминал подключён (python)
$
```

---

## 6. Модели данных

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
  name: string         // уникальное, max 100 символов
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
  timeLimitMin: number   // 5–300, по умолчанию 60
  createdBy: string      // userId учителя
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
  isHidden: boolean; // скрытые не видны студентам
  points: number; // баллы за тест-кейс
  orderIndex: number;
}
```

### Exam

```typescript
{
  id: string;
  taskId: string;
  title: string;
  inviteToken: string; // nanoid(32), уникальный
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
  path: string           // относительный путь от корня проекта
  type: 'file' | 'dir'
  children?: FileNode[]  // только у директорий
}
```

---

## 7. Система ролей и доступа

| Маршрут                                   |      student       | teacher | admin |
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
| `GET /fs/:id/tree`                        |        свой        |  любой  | любой |
| `PUT /fs/:id/file`                        | свой (не readonly) |    ✓    |   ✓   |
| `POST /tasks`                             |         —          |    ✓    |   ✓   |
| `GET /tasks/:id`                          |   ✓ (без hidden)   |    ✓    |   ✓   |
| `PATCH /tasks/:id`                        |         —          |  автор  |   ✓   |
| `POST /tasks/:id/test-cases`              |         —          |    ✓    |   ✓   |
| `POST /exams`                             |         —          |    ✓    |   ✓   |
| `PATCH /exams/:id/open`                   |         —          |    ✓    |   ✓   |
| `GET /exams/:id/results`                  |         —          |    ✓    |   ✓   |
| `POST /sessions/:examId/start`            |         ✓          |    —    |   —   |
| `POST /sessions/:examId/warn`             |         ✓          |    —    |   —   |
| `POST /sessions/:examId/submit`           |         ✓          |    —    |   —   |
| `POST /runner/run`                        |         ✓          |    ✓    |   ✓   |

### Межсервисная аутентификация

Gateway после верификации JWT добавляет заголовки:

```
x-user-id:    <userId>
x-user-email: <email>
x-user-role:  <role>
```

Downstream-сервисы (fs, task, runner) читают пользователя из этих заголовков, не имея прямого доступа к JWT.

---

## 8. Античит-система

Система фиксирует подозрительные действия студента во время экзамена.

**Отслеживаемые события:**

| `eventType`       | Описание                               |
| ----------------- | -------------------------------------- |
| `tab_blur`        | Студент переключился на другую вкладку |
| `window_minimize` | Окно браузера свёрнуто                 |
| `paste_attempt`   | Попытка вставки текста                 |
| `devtools_open`   | Открыты DevTools                       |

**Логика предупреждений:**

- Каждое событие → `warningsCount++` + запись в `anticheat_logs`.
- При `warningsCount >= 3` → статус сессии меняется на `disqualified`, проект замораживается.
- Преподаватель видит журнал через `GET /api/exams/:id/sessions/:sessionId/anticheat`.

---

## 9. Безопасность запуска кода

Каждый запуск пользовательского кода изолирован следующим образом:

1. **Копирование файлов** во временную директорию `/tmp/grsu-run-<uuid>` перед запуском.
2. **Docker-контейнер** с максимальными ограничениями (см. таблицу в разделе [4.5](#45-runner-service-порт-3004)).
3. **Таймаут** — процесс убивается через `SIGKILL` по истечении `CODE_TIMEOUT_MS`.
4. **Лимит вывода** — при превышении 512 КБ процесс убивается.
5. **Очистка** — временная директория удаляется в блоке `finally` в любом случае.
6. **Path traversal** — fs-service проверяет, что разрешённый путь начинается с корня проекта.

---

## 10. Shared Types

Пакет `@grsu/types` (в `shared/types/`) используется всеми сервисами.

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
