# GRSU IDE — План разработки бэкенда

## Стек

| Слой | Технология |
|------|-----------|
| Язык | TypeScript (Node.js 20) |
| Фреймворк | Fastify (каждый сервис) |
| БД | PostgreSQL 16 |
| ORM | Prisma |
| Кеш / Очереди | Redis 7 + BullMQ |
| Контейнеры кода | Docker (Python 3.12-slim, Node 20-slim) |
| WebSocket | ws / Fastify WS plugin |
| Auth | JWT (access 15min + refresh 7d) |
| Монорепо | npm workspaces |
| Деплой | docker-compose |

---

## Структура монорепо

```
grsu-ide/
├── frontend/                  # существующий Vite+React проект
├── services/
│   ├── gateway/               # API Gateway — роутинг, JWT-проверка
│   ├── auth-service/          # регистрация, логин, пользователи, группы
│   ├── fs-service/            # файловая система студентов
│   ├── task-service/          # задания, экзамены, сессии, антишит
│   └── runner-service/        # запуск кода в Docker, терминал WS
├── shared/
│   └── types/                 # общие TS-интерфейсы и DTO
├── docker-compose.yml
├── docker-compose.dev.yml
├── .env.example
└── plan.md
```

### Структура каждого сервиса (единый шаблон)

```
service-name/
├── src/
│   ├── index.ts               # точка входа, регистрация плагинов
│   ├── config.ts              # env-переменные через zod
│   ├── routes/                # роуты Fastify
│   ├── services/              # бизнес-логика
│   ├── repositories/          # запросы к БД через Prisma
│   ├── middlewares/           # auth guard, rate limit и т.д.
│   └── types.ts               # локальные типы
├── prisma/
│   └── schema.prisma          # схема БД (своя у каждого сервиса)
├── Dockerfile
├── package.json
└── tsconfig.json
```

---

## Порты сервисов

| Сервис | Порт |
|--------|------|
| gateway | 4000 |
| auth-service | 3001 |
| fs-service | 3002 |
| task-service | 3003 |
| runner-service | 3004 |
| PostgreSQL | 5432 |
| Redis | 6379 |

---

## Схема БД

### auth-service

```sql
-- Группы (ИС-21, ПМИ-22 и т.д.)
Table groups {
  id          UUID PK
  name        VARCHAR(100) UNIQUE NOT NULL
  created_at  TIMESTAMP DEFAULT now()
}

-- Пользователи
Table users {
  id            UUID PK
  email         VARCHAR(255) UNIQUE NOT NULL
  full_name     VARCHAR(255) NOT NULL
  password_hash VARCHAR(255) NOT NULL
  role          ENUM('student','teacher','admin') DEFAULT 'student'
  group_id      UUID FK -> groups.id NULLABLE
  created_at    TIMESTAMP DEFAULT now()
}

-- Refresh-токены (храним хеш, не сам токен)
Table refresh_tokens {
  id          UUID PK
  user_id     UUID FK -> users.id ON DELETE CASCADE
  token_hash  VARCHAR(255) UNIQUE NOT NULL
  expires_at  TIMESTAMP NOT NULL
  created_at  TIMESTAMP DEFAULT now()
}
```

### fs-service

```sql
-- Проекты (каждый студент на каждый экзамен получает отдельный проект)
Table projects {
  id          UUID PK
  user_id     UUID NOT NULL          -- из JWT, не FK (разные сервисы)
  task_id     UUID NULLABLE          -- если это экзаменационный проект
  name        VARCHAR(255) NOT NULL
  language    ENUM('python','javascript') DEFAULT 'python'
  is_readonly BOOLEAN DEFAULT false  -- true после сдачи
  created_at  TIMESTAMP DEFAULT now()
}
```

Файлы хранятся на диске: `/storage/users/{user_id}/projects/{project_id}/`

### task-service

```sql
-- Задания, создаёт преподаватель
Table tasks {
  id               UUID PK
  title            VARCHAR(255) NOT NULL
  description      TEXT NOT NULL        -- markdown
  language         ENUM('python','javascript')
  template_code    TEXT NOT NULL        -- стартовый код для студента
  time_limit_min   INTEGER DEFAULT 60   -- лимит времени в минутах
  created_by       UUID NOT NULL        -- user_id преподавателя
  created_at       TIMESTAMP DEFAULT now()
}

-- Тест-кейсы к заданию
Table test_cases {
  id              UUID PK
  task_id         UUID FK -> tasks.id ON DELETE CASCADE
  input           TEXT NOT NULL        -- stdin
  expected_output TEXT NOT NULL        -- ожидаемый stdout
  is_hidden       BOOLEAN DEFAULT true -- скрыт от студента до сдачи
  points          INTEGER DEFAULT 1
  order_index     INTEGER DEFAULT 0
}

-- Экзамены — преподаватель создаёт, студенты вступают по ссылке
Table exams {
  id            UUID PK
  task_id       UUID FK -> tasks.id
  title         VARCHAR(255) NOT NULL
  invite_token  VARCHAR(64) UNIQUE NOT NULL  -- токен для ссылки /exam/join/:token
  open_mode     ENUM('manual','scheduled') DEFAULT 'manual'
  starts_at     TIMESTAMP NULLABLE    -- для scheduled
  ends_at       TIMESTAMP NULLABLE    -- для scheduled / ручное закрытие
  status        ENUM('draft','active','closed') DEFAULT 'draft'
  created_by    UUID NOT NULL
  created_at    TIMESTAMP DEFAULT now()
}

-- Студенты, принявшие инвайт
Table exam_participants {
  id        UUID PK
  exam_id   UUID FK -> exams.id ON DELETE CASCADE
  user_id   UUID NOT NULL
  joined_at TIMESTAMP DEFAULT now()
  UNIQUE(exam_id, user_id)
}

-- Сессии — активная работа студента на экзамене
Table exam_sessions {
  id               UUID PK
  exam_id          UUID FK -> exams.id
  user_id          UUID NOT NULL
  project_id       UUID NOT NULL       -- ID проекта в fs-service
  started_at       TIMESTAMP DEFAULT now()
  finished_at      TIMESTAMP NULLABLE
  status           ENUM('in_progress','submitted','disqualified') DEFAULT 'in_progress'
  warnings_count   INTEGER DEFAULT 0
  UNIQUE(exam_id, user_id)
}

-- Лог антишита
Table anticheat_logs {
  id           UUID PK
  session_id   UUID FK -> exam_sessions.id ON DELETE CASCADE
  user_id      UUID NOT NULL
  event_type   ENUM('tab_blur','window_minimize','paste_attempt','devtools_open')
  occurred_at  TIMESTAMP DEFAULT now()
  details      JSONB NULLABLE         -- доп. метаданные (длительность и т.д.)
}

-- Результаты сдачи
Table submissions {
  id            UUID PK
  session_id    UUID FK -> exam_sessions.id
  user_id       UUID NOT NULL
  task_id       UUID NOT NULL
  score         INTEGER DEFAULT 0      -- сумма очков за пройденные тест-кейсы
  max_score     INTEGER DEFAULT 0      -- максимум возможных очков
  status        ENUM('passed','partial','failed','error')
  results_json  JSONB NOT NULL         -- детали по каждому тест-кейсу
  submitted_at  TIMESTAMP DEFAULT now()
}
```

---

## API — эндпоинты

Все запросы идут через Gateway на `localhost:4000`. Gateway проверяет JWT и проксирует дальше, добавляя заголовки `X-User-Id`, `X-User-Role`.

### auth-service `/api/auth`

```
POST   /api/auth/register              — регистрация { email, full_name, password }
POST   /api/auth/login                 — логин → { accessToken, refreshToken }
POST   /api/auth/refresh               — обновить токен { refreshToken }
POST   /api/auth/logout                — инвалидировать refresh { refreshToken }
GET    /api/auth/me                    — профиль текущего пользователя
GET    /api/auth/users                 — список всех (admin)
GET    /api/auth/users/:id             — один пользователь (admin/teacher)
PATCH  /api/auth/users/:id/role        — сменить роль (admin)

POST   /api/auth/groups                — создать группу (admin)
GET    /api/auth/groups                — список групп
POST   /api/auth/groups/:id/members    — добавить студентов в группу
DELETE /api/auth/groups/:id/members/:userId — убрать из группы
```

### fs-service `/api/fs`

```
POST   /api/fs/projects                        — создать проект { name, language, taskId? }
GET    /api/fs/projects                        — список проектов текущего пользователя
GET    /api/fs/projects/:id                    — мета-данные проекта

GET    /api/fs/:projectId/tree                 — дерево файлов
GET    /api/fs/:projectId/file?path=...        — содержимое файла
PUT    /api/fs/:projectId/file                 — сохранить { path, content }
POST   /api/fs/:projectId/file                 — создать файл/папку { path, type: 'file'|'dir' }
DELETE /api/fs/:projectId/file?path=...        — удалить
PATCH  /api/fs/:projectId/rename               — переименовать { oldPath, newPath }
```

### task-service `/api/tasks`, `/api/exams`, `/api/sessions`

```
-- Задания (teacher)
POST   /api/tasks                      — создать задание
GET    /api/tasks                      — список заданий преподавателя
GET    /api/tasks/:id                  — детали задания
PATCH  /api/tasks/:id                  — обновить задание
DELETE /api/tasks/:id                  — удалить

POST   /api/tasks/:id/test-cases       — добавить тест-кейс
PATCH  /api/tasks/:id/test-cases/:tcId — обновить тест-кейс
DELETE /api/tasks/:id/test-cases/:tcId — удалить тест-кейс

-- Экзамены (teacher)
POST   /api/exams                      — создать экзамен { taskId, title, openMode, startsAt?, endsAt? }
GET    /api/exams                      — список экзаменов преподавателя
GET    /api/exams/:id                  — детали + участники + сессии
PATCH  /api/exams/:id/open             — открыть вручную
PATCH  /api/exams/:id/close            — закрыть вручную
GET    /api/exams/:id/results          — сводная таблица результатов (teacher)
GET    /api/exams/:id/sessions/:sessionId/files — файлы студента (teacher, read-only view)
GET    /api/exams/:id/sessions/:sessionId/anticheat — лог нарушений (teacher)

-- Инвайт (публичный, без авторизации)
GET    /api/exams/join/:token          — инфо об экзамене по токену
POST   /api/exams/join/:token          — вступить в экзамен (авторизован, студент)

-- Сессии (student)
POST   /api/sessions/:examId/start     — начать экзамен → создаёт сессию + проект
GET    /api/sessions/:examId           — статус сессии (время, предупреждения, статус)
POST   /api/sessions/:examId/submit    — сдать работу
POST   /api/sessions/:examId/warn      — зафиксировать нарушение { eventType, details? }

-- Результаты
POST   /api/sessions/:examId/run-tests — запустить тесты и сохранить submission
GET    /api/sessions/:examId/result    — результат студента (после сдачи)
```

### runner-service `/api/runner`

```
POST   /api/runner/run                 — запустить код { projectId, entryFile, language, stdin? }
                                         → { stdout, stderr, exitCode, durationMs }
POST   /api/runner/test                — прогнать тест-кейсы (внутренний вызов от task-service)
                                         { projectId, language, entryFile, testCases[] }
                                         → { results[] }

WS     /ws/terminal/:projectId         — интерактивный терминал (xterm.js ↔ bash в контейнере)
```

---

## Безопасность запуска кода

Каждый `docker run` запускается со следующими флагами:

```bash
docker run \
  --rm \
  --network=none \           # нет доступа к сети
  --memory=128m \            # лимит памяти
  --cpus=0.5 \               # лимит CPU
  --pids-limit=50 \          # нельзя форкать процессы без конца
  --read-only \              # read-only fs
  --tmpfs /tmp:size=10m \    # только /tmp доступен для записи
  -v /tmp/run_{uuid}:/app:ro \ # файлы студента только на чтение
  --user 1000:1000 \         # непривилегированный пользователь
  --timeout 15 \             # таймаут контейнера
  python:3.12-slim python /app/main.py
```

Временная директория удаляется после завершения контейнера.

---

## Антишит — события и логика

| Событие | Триггер на фронте |
|---------|------------------|
| `tab_blur` | `document.addEventListener('visibilitychange')` — вкладка скрыта > 5 сек |
| `window_minimize` | `window.addEventListener('blur')` — окно потеряло фокус > 5 сек |
| `paste_attempt` | `editor.onKeyDown` в Monaco — перехват Ctrl+V / Cmd+V |
| `devtools_open` | Изменение `window.outerWidth - window.innerWidth > 160` |

Логика предупреждений на бэке (task-service):
- `warnings_count < 3` → инкремент + возврат `{ warning: true, count: N, remaining: 3-N }`
- `warnings_count >= 3` → `status = 'disqualified'`, сессия блокируется + возврат `{ disqualified: true }`

---

## Этапы разработки

### Этап 1 — Фундамент и auth-service
- [ ] Настройка монорепо (npm workspaces, tsconfig base, eslint)
- [ ] `shared/types` — общие интерфейсы (User, JwtPayload, ServiceResponse)
- [ ] `auth-service` — регистрация, логин, refresh, logout, группы
- [ ] `gateway` — проксирование, JWT-проверка, передача X-User-Id/Role

### Этап 2 — fs-service
- [ ] Файловые операции на диске (tree, read, write, create, delete, rename)
- [ ] Проекты в PostgreSQL
- [ ] Интеграция с фронтом — замена useState-заглушек на API-вызовы

### Этап 3 — task-service
- [ ] CRUD заданий и тест-кейсов
- [ ] Экзамены, генерация инвайт-токена
- [ ] Вступление по ссылке, управление участниками
- [ ] Сессии — старт, сдача, статус
- [ ] Антишит — логирование, предупреждения, дисквалификация
- [ ] Кабинет преподавателя — результаты, просмотр файлов студента

### Этап 4 — runner-service
- [ ] Разовый запуск кода в Docker (`/run`)
- [ ] Прогон тест-кейсов (`/test`)
- [ ] WebSocket-терминал (`/ws/terminal/:projectId`)
- [ ] BullMQ очередь — защита от перегрузки

### Этап 5 — Интеграция и деплой
- [ ] `docker-compose.yml` — все сервисы + PostgreSQL + Redis
- [ ] Nginx конфиг — reverse proxy, SSL
- [ ] Переменные окружения, секреты
- [ ] Финальная интеграция фронта со всеми сервисами
- [ ] Smoke-тесты

---

## Порядок написания кода (в рамках каждого этапа)

1. `prisma/schema.prisma` — схема БД
2. `src/config.ts` — env-переменные с валидацией через zod
3. `src/repositories/` — запросы к БД
4. `src/services/` — бизнес-логика
5. `src/routes/` — HTTP роуты
6. `src/index.ts` — сборка сервера
7. `Dockerfile`
