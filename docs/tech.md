# GRSU IDE — Техническое задание для фронтенда

## Что за система

GRSU IDE — это браузерная IDE для проведения программирования-экзаменов
в университете. Преподаватель создаёт задание с тест-кейсами, открывает
экзамен, студенты заходят по инвайт-ссылке, пишут код прямо в браузере
и сдают работу. Система следит за нарушениями (антишит) и автоматически
проверяет код против тест-кейсов.

## Базовый URL

Все API запросы идут на http://localhost:4000
(в проде — через nginx, адрес тот же но с https)

## Аутентификация

POST /api/auth/register — { email, fullName, password }
POST /api/auth/login — { email, password } → { accessToken, refreshToken }
POST /api/auth/refresh — { refreshToken } → новые токены
POST /api/auth/logout — { refreshToken }
GET /api/auth/me — профиль текущего юзера

Access token живёт 15 минут. Нужно реализовать автоматический refresh:
перехватчик в axios/fetch, который при 401 делает /refresh и повторяет запрос.
Токены хранить в localStorage или httpOnly cookie (второй вариант безопаснее).

JWT payload содержит: { sub: userId, email, role: 'student'|'teacher'|'admin' }

## Роли и разделение интерфейса

student — видит только свои проекты, экзамены которые принял, IDE
teacher — создаёт задания, экзамены, смотрит результаты студентов
admin — всё что teacher + управление пользователями и группами

## Страницы и функциональность

### Общие (все роли)

- /login — форма входа
- /register — форма регистрации
- / — редирект в зависимости от роли

### Студент

- /dashboard — список доступных экзаменов + личные проекты
- /exam/join/:token — страница принятия инвайта (GET /api/exams/join/:token)
  показывает: название, задание, лимит времени, кнопку "Вступить"
- /exam/:examId — основной экран экзамена (самая важная страница)
- /exam/:examId/result — результаты после сдачи

### Преподаватель

- /teacher/tasks — список заданий
- /teacher/tasks/new — создать задание
- /teacher/tasks/:id/edit — редактировать задание + тест-кейсы
- /teacher/exams — список экзаменов
- /teacher/exams/new — создать экзамен
- /teacher/exams/:id — управление экзаменом (открыть/закрыть, участники)
- /teacher/exams/:id/results — сводная таблица результатов
- /teacher/exams/:id/sessions/:sessionId — просмотр файлов студента (read-only)

### Админ

- /admin/users — список пользователей, смена ролей
- /admin/groups — управление группами (создать, добавить/убрать студентов)

## Главная страница экзамена /exam/:examId — подробное ТЗ

Это самая сложная страница. Раскладка:

+------------------+----------------------------------+
| File Tree | Monaco Editor |
| | |
| main.py | // код студента |
| utils.py | |
| | |
+------------------+----------------------------------+
| [Run ▶] [Test] | Output / Terminal |
| Таймер: 45:23 | > stdout здесь |
| ⚠ 1/3 | |
+------------------+----------------------------------+

Детали:

1. File Tree (левая панель)
   - GET /api/fs/:projectId/tree — дерево файлов
   - Клик по файлу — загрузить содержимое GET /api/fs/:projectId/file?path=...
   - Автосохранение при изменении (debounce 1-2 сек): PUT /api/fs/:projectId/file
   - Создание файла/папки (кнопки +файл / +папка): POST /api/fs/:projectId/file
   - Удаление (правый клик или кнопка): DELETE /api/fs/:projectId/file?path=...
   - Переименование: PATCH /api/fs/:projectId/rename

2. Monaco Editor (центр)
   - Язык подсвечивается автоматически по расширению файла (python/javascript)
   - При paste (Ctrl+V / Cmd+V) — отправить предупреждение антишита:
     POST /api/sessions/:examId/warn { eventType: 'paste_attempt' }

3. Кнопка Run ▶
   - POST /api/runner/run { projectId, entryFile: 'main.py', language: 'python' }
   - Показать stdout/stderr/exitCode в Output панели
   - Поддержать stdin: текстовое поле перед запуском

4. Кнопка Test
   - POST /api/sessions/:examId/run-tests
   - Показать результаты: таблица с колонками: №, статус ✓/✗, ввод*, ожидаемый*, факт\*, время
   - Скрытые тест-кейсы (hidden: true) показывают \*\*\* вместо input/output

5. Таймер
   - GET /api/sessions/:examId — получить { startedAt } + лимит из задания
   - Считать обратный отсчёт на клиенте
   - При достижении 0 — автоматически вызвать submit

6. Кнопка Сдать
   - POST /api/sessions/:examId/submit
   - Попросить подтверждение ("Вы уверены? Это нельзя отменить")
   - После сдачи — редирект на /exam/:examId/result

7. Терминал (опциональная вкладка в нижней панели)
   - WebSocket подключение: ws://localhost:4000/api/runner (проксирует на ws runner)
   - Точный адрес: ws://localhost:3004/terminal/:projectId
   - Использовать xterm.js
   - Протокол сообщений:
     Сервер → клиент: { type: 'output', data: string } | { type: 'exit', code: number }
     Клиент → сервер: { type: 'input', data: string } | { type: 'resize', cols, rows }

8. Антишит — события которые нужно слушать и отправлять:
   document.addEventListener('visibilitychange', () => {
   if (document.hidden) {
   // запустить таймер, если > 5 сек — отправить warn
   POST /api/sessions/:examId/warn { eventType: 'tab_blur', details: { duration } }
   }
   })

   window.addEventListener('blur', () => {
   // аналогично с задержкой 5 сек → eventType: 'window_minimize'
   })

   // devtools: window.outerWidth - window.innerWidth > 160
   // eventType: 'devtools_open'

   При ответе { disqualified: true } — заблокировать редактор, показать
   модальное окно "Вы дисквалифицированы" и перенаправить на /dashboard

## Страница результатов экзамена (преподаватель)

GET /api/exams/:id/results — массив сессий с полями:

- user_id, status, warnings_count, started_at, finished_at
- submission: { score, maxScore, status, resultsJson }
- antiCheatLogs: [ { eventType, occurredAt, details } ]

Показать: таблица студентов с баллами, статусом, количеством нарушений.
При клике на студента — подробный просмотр его файлов (read-only Monaco)
и лог нарушений с временными метками.

## Форматы ответов API

Все ответы имеют структуру:
{ ok: true, data: ... } — успех
{ ok: false, error: "..." } — ошибка

HTTP статусы стандартные: 200, 201, 400, 401, 403, 404, 409, 500.

## Управление заданиями (teacher)

POST /api/tasks — создать задание:
{ title, description (markdown), language: 'python'|'javascript',
templateCode, timeLimitMin }

POST /api/tasks/:id/test-cases — добавить тест:
{ input, expectedOutput, isHidden: true, points: 1, orderIndex: 0 }

Редактор описания задания — поддержать Markdown (react-markdown или аналог).
templateCode — это стартовый код который студент увидит в Monaco при старте экзамена.

## Создание экзамена (teacher)

POST /api/exams:
{ taskId, title, openMode: 'manual'|'scheduled', startsAt?, endsAt? }

Ответ содержит inviteToken — сгенерируй инвайт-ссылку:
http://your-domain/exam/join/:inviteToken

Показать QR-код или кнопку "Скопировать ссылку" для распространения студентам.

Управление статусом:
PATCH /api/exams/:id/open — открыть (статус: draft → active)
PATCH /api/exams/:id/close — закрыть (active → closed)

## Управление пользователями (admin)

GET /api/auth/users — список всех юзеров
PATCH /api/auth/users/:id/role — { role: 'student'|'teacher'|'admin' }
POST /api/auth/groups — { name: 'ИС-21' }
GET /api/auth/groups — список групп
POST /api/auth/groups/:id/members — { userId }
DELETE /api/auth/groups/:id/members/:userId
