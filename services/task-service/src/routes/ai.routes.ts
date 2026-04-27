import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import type { Language } from '@prisma/client'
import { getUser, requireRole } from '../middlewares/auth.middleware.js'
import { TaskRepository } from '../repositories/task.repository.js'
import { prisma } from '../db.js'
import { chatCompletion, parseJsonFromModelContent } from '../services/openai.client.js'

const genTaskItem = z.object({
    title: z.string().min(1).max(255),
    description: z.string().min(1),
    templateCode: z.string(),
    timeLimitMin: z.number().int().min(5).max(300).optional(),
    testCases: z
        .array(
            z.object({
                input: z.string(),
                expectedOutput: z.string(),
                points: z.number().int().min(1).max(100).optional(),
                isHidden: z.boolean().optional(),
            }),
        )
        .max(8)
        .optional(),
})

type GenTaskItem = z.infer<typeof genTaskItem>

function clip(s: string, max: number): string {
    if (s.length <= max) return s
    return `${s.slice(0, max)}\n…[обрезано]`
}

const RECONCILE_PASSES = 2

/**
 * Один вызов модели на одну задачу: выровнять testCases по description и templateCode.
 * Ответ только {"testCases":[...]} — проще, чем пакет из нескольких задач.
 */
async function reconcileOneTaskTestCases(
    language: string,
    t: GenTaskItem,
    passIndex: number,
): Promise<GenTaskItem> {
    const orig = t.testCases
    if (!orig?.length) return t

    const payload = {
        title: t.title,
        description: clip(t.description, 16_000),
        templateCode: clip(t.templateCode, 8_000),
        testCases: orig.map(tc => ({
            input: tc.input,
            expectedOutput: tc.expectedOutput,
        })),
    }

    const passIntro =
        passIndex === 0
            ? 'Первый проход: исправь expectedOutput там, где он не совпадает с эталоном по условию; input трогай только при явной ошибке.'
            : 'Второй независимый проход: заново для КАЖДОГО теста вычисли эталонный stdout по description (как у корректного print в Python 3 / console.log в JS). Замени expectedOutput, если есть хоть малейшее расхождение.'

    const system = `Ты ревьюер учебных тест-кейсов, язык ${language}. ${passIntro}
Платформа: в stdin подаётся ровно поле input теста, stdout сравнивается с expectedOutput (trim, построчно).

Обязательно:
1) Прочитай description и templateCode; зафиксируй формат вывода (кортеж, числа, строки, несколько строк).
2) Для каждого input вычисли ожидаемый stdout по ТЕМ ЖЕ правилам, что в условии (й, ъ, ь, латиница, регистр — только если это явно в условии).
3) Не меняй число и порядок тестов — в ответе ровно ${orig.length} элементов testCases в том же порядке.
4) input не меняй байт-в-байт, если он уже соответствует условию.

Верни строго JSON: {"testCases":[{"input":"...","expectedOutput":"..."}]}`

    try {
        const raw = await chatCompletion(system, JSON.stringify(payload), {
            jsonObject: true,
            maxTokens: 4096,
        })
        const parsed = parseJsonFromModelContent(raw) as { testCases?: { input: string; expectedOutput: string }[] }
        const fixed = parsed.testCases
        if (!Array.isArray(fixed) || fixed.length !== orig.length) return t
        return {
            ...t,
            testCases: orig.map((tc, j) => ({
                ...tc,
                input: typeof fixed[j]?.input === 'string' ? fixed[j].input : tc.input,
                expectedOutput:
                    typeof fixed[j]?.expectedOutput === 'string' ? fixed[j].expectedOutput : tc.expectedOutput,
            })),
        }
    } catch {
        return t
    }
}

/**
 * Два прохода: на каждую задачу с тестами — отдельный запрос (модель не «размазывает» внимание на пакет),
 * внутри прохода задачи обрабатываются параллельно.
 */
async function reconcileGeneratedTestCases(language: string, tasks: GenTaskItem[]): Promise<GenTaskItem[]> {
    if (!tasks.some(t => t.testCases?.length)) return tasks

    let out = tasks
    for (let pass = 0; pass < RECONCILE_PASSES; pass++) {
        out = await Promise.all(out.map(t => reconcileOneTaskTestCases(language, t, pass)))
    }
    return out
}

export async function aiRoutes(app: FastifyInstance) {
    // POST /ai/format-description
    app.post('/format-description', { preHandler: requireRole(['teacher', 'admin']) }, async (req, reply) => {
        try {
            const schema = z.object({ markdown: z.string().min(1).max(120_000) })
            const parsed = schema.safeParse(req.body)
            if (!parsed.success) {
                return reply.status(400).send({ ok: false, error: parsed.error.errors[0]?.message ?? 'Неверные данные' })
            }
            const system =
                'Ты редактор учебных материалов. Улучши Markdown-описание задания по программированию: структура заголовков, ясность, без выдумывания фактов. Верни ТОЛЬКО готовый Markdown, без пояснений и без обёртки ```.'
            const out = await chatCompletion(system, parsed.data.markdown)
            return reply.send({ ok: true, data: { markdown: out.trim() } })
        } catch (err: unknown) {
            const e = err as { statusCode?: number; message?: string }
            return reply.status(e.statusCode ?? 500).send({ ok: false, error: e.message ?? 'Ошибка ИИ' })
        }
    })

    // POST /ai/edit-template  mode: scaffold | comments | check
    app.post('/edit-template', { preHandler: requireRole(['teacher', 'admin']) }, async (req, reply) => {
        try {
            const schema = z.object({
                mode: z.enum(['scaffold', 'comments', 'check']),
                language: z.enum(['python', 'javascript']),
                description: z.string().min(1).max(80_000),
                templateCode: z.string().max(80_000),
            })
            const parsed = schema.safeParse(req.body)
            if (!parsed.success) {
                return reply.status(400).send({ ok: false, error: parsed.error.errors[0]?.message ?? 'Неверные данные' })
            }
            const { mode, language, description, templateCode } = parsed.data
            const codeHereComment = language === 'python' ? '# ваш код здесь' : '// ваш код здесь'
            const mainBlockHint =
                language === 'python'
                    ? 'После функции с решением ОБЯЗАТЕЛЬНО блок if __name__ == "__main__": (или __main__ с одинарными кавычками) — только связка stdin→вызов функции(й)→print в stdout, без готового ответа задачи и без захардкоженных тестовых значений: например s = input() и print(...). Без input("...") с русскими подсказками.'
                    : 'После функции с решением ОБЯЗАТЕЛЬНО минимальный код чтения stdin и вывода в stdout (например readline или fs.readFileSync(0,"utf-8")), вызов объявленной функции и вывод результата в том же формате, что в условии — без готовой логики задачи в этой обвязке.'
            const scaffoldRules =
                'Режим «шаблон»: выдай ТОЛЬКО стартовый код для студента, НЕ готовое решение. ' +
                `В теле главной функции (туда, где студент дописывает решение) ОБЯЗАТЕЛЬНО отдельная строка комментария с точным текстом: ${codeHereComment} — перед pass, ... или пустой заглушкой. ` +
                mainBlockHint +
                ' Запрещено внутри функции решения: полная рабочая логика, циклы/ветвления с сутью задачи, блоки «Пример использования». Запрещено в main: демо с готовыми ответами вместо чтения stdin и вызова функции. ' +
                'Прочие комментарии — по желанию и кратко; обязательна строка «ваш код здесь» как выше.'
            const modeHint =
                mode === 'scaffold'
                    ? scaffoldRules
                    : mode === 'comments'
                      ? 'Добавь краткие комментарии в код, не меняя логику. Если код уже содержит готовое решение — только комментарии, не переписывай в заглушку.'
                      : 'Исправь синтаксис; не дописывай полное решение, если его не было — оставь намеренно неполный шаблон.'
            const system = `Язык: ${language}. ${modeHint} Верни СТРОГО JSON: {"templateCode":"..."} без markdown, валидный JSON (переносы в строке — как обычно в JSON).`
            const user = `Описание задания:\n${description}\n\nТекущий шаблон:\n${templateCode}`
            const raw = await chatCompletion(system, user, { jsonObject: true })
            const json = parseJsonFromModelContent(raw) as { templateCode?: string }
            if (!json.templateCode || typeof json.templateCode !== 'string') {
                return reply.status(502).send({ ok: false, error: 'Модель вернула неверный JSON' })
            }
            return reply.send({ ok: true, data: { templateCode: json.templateCode } })
        } catch (err: unknown) {
            const e = err as { statusCode?: number; message?: string }
            return reply.status(e.statusCode ?? 500).send({ ok: false, error: e.message ?? 'Ошибка ИИ' })
        }
    })

    // POST /ai/suggest-testcase
    app.post('/suggest-testcase', { preHandler: requireRole(['teacher', 'admin']) }, async (req, reply) => {
        try {
            const schema = z.object({
                kind: z.enum(['stdin', 'stdout']),
                taskTitle: z.string().min(1).max(255),
                description: z.string().min(1).max(80_000),
                language: z.enum(['python', 'javascript']),
                partialInput: z.string().optional(),
                partialOutput: z.string().optional(),
            })
            const parsed = schema.safeParse(req.body)
            if (!parsed.success) {
                return reply.status(400).send({ ok: false, error: parsed.error.errors[0]?.message ?? 'Неверные данные' })
            }
            const p = parsed.data
            const target = p.kind === 'stdin' ? 'входные данные stdin' : 'ожидаемый вывод stdout'
            const system = `Задача по ${p.language}. Проверка — stdin/stdout программы студента. Предложи ${target} для одного тест-кейса; значение должно быть согласовано с условием (тот же формат вывода, что при print/console.log эталона). Верни СТРОГО JSON: {"value":"..."} без markdown.`
            const user = `Название: ${p.taskTitle}\n\nУсловие:\n${p.description}\n\nЧерновик stdin: ${p.partialInput ?? ''}\nЧерновик stdout: ${p.partialOutput ?? ''}`
            const raw = await chatCompletion(system, user, { jsonObject: true })
            const json = parseJsonFromModelContent(raw) as { value?: string }
            if (!json.value || typeof json.value !== 'string') {
                return reply.status(502).send({ ok: false, error: 'Модель вернула неверный JSON' })
            }
            return reply.send({ ok: true, data: { value: json.value } })
        } catch (err: unknown) {
            const e = err as { statusCode?: number; message?: string }
            return reply.status(e.statusCode ?? 500).send({ ok: false, error: e.message ?? 'Ошибка ИИ' })
        }
    })

    // POST /ai/generate-tasks — пакетное создание заданий в БД
    app.post('/generate-tasks', { preHandler: requireRole(['teacher', 'admin']) }, async (req, reply) => {
        try {
            const user = getUser(req)
            const schema = z.object({
                count: z.number().int().min(1).max(20),
                topics: z.array(z.string().max(200)).min(1).max(20),
                mixTopicsAcrossTasks: z.boolean(),
                language: z.enum(['python', 'javascript']),
                difficulty: z.enum(['easy', 'medium', 'hard']),
                timeLimitMin: z.number().int().min(5).max(180),
                withTests: z.boolean(),
                withHints: z.boolean(),
                extraPrompt: z.string().max(4000).optional(),
                folderId: z.string().uuid().nullable().optional(),
            })
            const parsed = schema.safeParse(req.body)
            if (!parsed.success) {
                return reply.status(400).send({ ok: false, error: parsed.error.errors[0]?.message ?? 'Неверные данные' })
            }
            const b = parsed.data
            if (b.folderId) {
                const folder = await prisma.taskFolder.findUnique({ where: { id: b.folderId } })
                if (!folder || folder.createdBy !== user.id) {
                    return reply.status(403).send({ ok: false, error: 'Папка не найдена или нет доступа' })
                }
            }

            const topicsClean = b.topics.map(t => t.trim()).filter(Boolean)
            if (!topicsClean.length) {
                return reply.status(400).send({ ok: false, error: 'Укажите хотя бы одну непустую тему' })
            }

            const codeHereLine = b.language === 'python' ? '# ваш код здесь' : '// ваш код здесь'
            const mainGluePy =
                'ОБЯЗАТЕЛЬНО после объявления функции(й) с pass блок if __name__ == "__main__": с чтением stdin (например s = input() или нужный формат по условию) и print(…) — вызов той же функции, куда студент пишет решение, и вывод в stdout **в точности** в формате из description (как у print в Python 3: кортежи, числа, строки). Если есть testCases — формат stdout должен совпадать с expectedOutput. Без input("Введите…") на русском, без захардкоженных ответов в print.'
            const mainGlueJs =
                'ОБЯЗАТЕЛЬНО после объявления функции минимальная обвязка: чтение stdin и вывод в stdout (console.log или process.stdout.write) в том же формате, что в description; при наличии testCases — совпадающий с expectedOutput. Без готовой логики задачи в обвязке.'

            const system = `Ты составитель учебных задач по программированию (${b.language}). 
Верни СТРОГО один JSON-объект без markdown и без текста вокруг:
{"tasks":[...]}
Каждый элемент tasks: title (string), description (string, Markdown на русском), templateCode (string), 
timeLimitMin (number, опционально; по умолчанию ${b.timeLimitMin}),
testCases (не более 5; input, expectedOutput, points, isHidden) — ${b.withTests ? 'см. правила ниже; каждый тест согласован с description и с templateCode.' : 'поле testCases: [] или опусти.'}

ПЛАТФОРМА ПРОВЕРКИ: запускается файл main.py (Python) или index.js (JavaScript) с подачей **stdin** и сравнением **stdout** с expectedOutput (trim). Студент обязан печатать результат — одной функции без запуска недостаточно.

КРИТИЧЕСКИ про templateCode (стартер для студента, НЕ решение):
- В теле главной функции решения ОБЯЗАТЕЛЬНО строка комментария с точным текстом: ${codeHereLine} — на своей строке перед pass, ... или пустой заглушкой.
- Только заглушки внутри функции решения: pass или ..., без готового алгоритма.
- ${b.language === 'python' ? mainGluePy : mainGlueJs}
- НЕЛЬЗЯ: циклы/ветвления с сутью задачи внутри функции; готовая рабочая реализация; блоки «Пример использования»; в __main__ — демо с захардкоженным ответом вместо stdin→print(вызов функции).

КРИТИЧЕСКИ про description и согласованность с тестами:
- Явно напиши контракт ввода-вывода: что именно приходит в stdin (одна строка, несколько строк, числа и т.д.) и **точный формат вывода** (например кортеж как при print в Python 3, числа через пробел, JSON — одна строка и т.д.).
- Для задач на буквы/символы: явно перечисли правила (латиница, й, ъ, ь, регистр, пробелы) — одни и те же правила для описания и для эталонного вывода в тестах.

${b.withTests ? `КРИТИЧЕСКИ про testCases (если массив не пустой):
- Каждый input — ровно содержимое stdin для одного запуска (как подставит проверяющая система).
- Каждый expectedOutput — ровно ожидаемый stdout после trim; для Python это обычно результат print(...) (включая пробел после запятой в кортежах и т.п.).
- Пересчитай expectedOutput **по тем же правилам**, что ты изложил в description; не подбирай числа «на глаз». Если правила не позволяют однозначно посчитать — уточни description и только потом выставь expectedOutput.
- Не противоречь сам себе между description, templateCode (формат print) и testCases.` : ''}

Общие требования:
- Ровно ${b.count} заданий.
- Язык: ${b.language}.
- Сложность: ${b.difficulty}.
- Темы: ${JSON.stringify(topicsClean)}.
- ${b.mixTopicsAcrossTasks ? 'Темы можно комбинировать между заданиями.' : 'Каждое задание в основном из одной темы.'}
- ${b.withHints ? 'В description можно краткие подсказки.' : 'Без отдельного блока подсказок.'}
- Заголовки title до 80 символов.
- Ответ — строго валидный JSON (переносы внутри строк — с экранированием по правилам JSON).`

            const userPayload = JSON.stringify({
                count: b.count,
                topics: topicsClean,
                mixTopicsAcrossTasks: b.mixTopicsAcrossTasks,
                language: b.language,
                difficulty: b.difficulty,
                timeLimitMin: b.timeLimitMin,
                withTests: b.withTests,
                withHints: b.withHints,
                extraPrompt: b.extraPrompt ?? '',
            })

            const raw = await chatCompletion(system, `Параметры:\n${userPayload}`, {
                jsonObject: true,
                maxTokens: 8192,
            })
            const json = parseJsonFromModelContent(raw) as { tasks?: unknown[] }
            if (!Array.isArray(json.tasks) || json.tasks.length === 0) {
                return reply.status(502).send({ ok: false, error: 'Модель вернула пустой или неверный список tasks' })
            }

            const items: GenTaskItem[] = []
            for (const t of json.tasks.slice(0, b.count)) {
                const r = genTaskItem.safeParse(t)
                if (r.success) items.push(r.data)
            }
            if (items.length === 0) {
                return reply.status(502).send({ ok: false, error: 'Не удалось разобрать ни одного задания из ответа модели' })
            }

            const itemsFinal =
                b.withTests && items.some(d => d.testCases?.length)
                    ? await reconcileGeneratedTestCases(b.language, items)
                    : items

            const created = []
            for (const d of itemsFinal) {
                const tlim = d.timeLimitMin ?? b.timeLimitMin
                const task = await TaskRepository.create({
                    title: d.title,
                    description: d.description,
                    language: b.language as Language,
                    templateCode: d.templateCode,
                    timeLimitMin: tlim,
                    createdBy: user.id,
                    folderId: b.folderId ?? undefined,
                })
                if (b.withTests && d.testCases?.length) {
                    let idx = 0
                    for (const tc of d.testCases.slice(0, 5)) {
                        await TaskRepository.addTestCase(task.id, {
                            input: tc.input,
                            expectedOutput: tc.expectedOutput,
                            isHidden: tc.isHidden ?? true,
                            points: tc.points ?? 1,
                            orderIndex: idx++,
                        })
                    }
                }
                const full = await TaskRepository.findById(task.id)
                if (full) created.push(full)
            }

            return reply.status(201).send({ ok: true, data: { tasks: created } })
        } catch (err: unknown) {
            const e = err as { statusCode?: number; message?: string }
            return reply.status(e.statusCode ?? 500).send({ ok: false, error: e.message ?? 'Ошибка ИИ' })
        }
    })
}
