import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { SessionRepository } from '../repositories/session.repository.js'
import { ExamService } from '../services/exam.service.js'
import { TaskRepository } from '../repositories/task.repository.js'
import { runTests, runCode } from '../services/runner.client.js'
import { getUser } from '../middlewares/auth.middleware.js'

export async function sessionsRoutes(app: FastifyInstance) {
    // POST /sessions/:examId/start — начать экзамен
    app.post('/:examId/start', async (req, reply) => {
        try {
            const user = getUser(req)
            const { examId } = req.params as { examId: string }
            const session = await ExamService.startSession(examId, user.id)
            return reply.status(201).send({ ok: true, data: session })
        } catch (err: any) {
            return reply.status(err.statusCode ?? 500).send({ ok: false, error: err.message })
        }
    })

    // GET /sessions/:examId — статус сессии
    app.get('/:examId', async (req, reply) => {
        try {
            const user = getUser(req)
            const { examId } = req.params as { examId: string }
            const session = await SessionRepository.findByExamAndUser(examId, user.id)
            if (!session) return reply.status(404).send({ ok: false, error: 'Сессия не найдена' })
            return reply.send({ ok: true, data: session })
        } catch (err: any) {
            return reply.status(err.statusCode ?? 500).send({ ok: false, error: err.message })
        }
    })

    // POST /sessions/:examId/warn — зафиксировать нарушение
    app.post('/:examId/warn', async (req, reply) => {
        try {
            const user = getUser(req)
            const { examId } = req.params as { examId: string }

            const schema = z.object({
                eventType: z.enum(['tab_blur', 'window_minimize', 'paste_attempt', 'devtools_open']),
                details: z.record(z.unknown()).optional(),
            })

            const result = schema.safeParse(req.body)
            if (!result.success) {
                return reply.status(400).send({ ok: false, error: result.error.errors[0].message })
            }

            const session = await SessionRepository.findByExamAndUser(examId, user.id)
            if (!session) return reply.status(404).send({ ok: false, error: 'Сессия не найдена' })

            const warnResult = await ExamService.warn(
                session.id,
                user.id,
                result.data.eventType,
                result.data.details
            )

            return reply.send({ ok: true, data: warnResult })
        } catch (err: any) {
            return reply.status(err.statusCode ?? 500).send({ ok: false, error: err.message })
        }
    })

    // POST /sessions/:examId/submit — сдать работу
    app.post('/:examId/submit', async (req, reply) => {
        try {
            const user = getUser(req)
            const { examId } = req.params as { examId: string }
            const result = await ExamService.submit(examId, user.id)
            return reply.send({ ok: true, data: result })
        } catch (err: any) {
            return reply.status(err.statusCode ?? 500).send({ ok: false, error: err.message })
        }
    })

    // POST /sessions/:examId/run-tests — запустить тесты и сохранить результат
    app.post('/:examId/run-tests', async (req, reply) => {
        try {
            const user = getUser(req)
            const { examId } = req.params as { examId: string }

            const session = await SessionRepository.findByExamAndUser(examId, user.id)
            if (!session) return reply.status(404).send({ ok: false, error: 'Сессия не найдена' })
            if (session.status !== 'in_progress') {
                return reply.status(400).send({ ok: false, error: 'Сессия уже завершена' })
            }

            const task = await TaskRepository.findById(session.taskId!)
            if (!task) return reply.status(404).send({ ok: false, error: 'Задание не найдено' })

            const entryFile = task.language === 'python' ? 'main.py' : 'index.js'

            // Запускаем тесты через runner-service
            const results = await runTests(
                session.projectId,
                user.id,

                task.language,
                entryFile,
                task.testCases.map(tc => ({
                    input: tc.input,
                    expectedOutput: tc.expectedOutput,
                }))
            )

            // Считаем баллы
            const score = results
                .filter((r, i) => r.passed)
                .reduce((sum, _, i) => sum + (task.testCases[i]?.points ?? 1), 0)
            const maxScore = task.testCases.reduce((sum, tc) => sum + tc.points, 0)

            const passed = score === maxScore
            const status = passed ? 'passed' : score > 0 ? 'partial' : 'failed'

            // Сохраняем или обновляем submission
            const existingSubmission = await SessionRepository.findSubmission(session.id)
            if (!existingSubmission) {
                await SessionRepository.createSubmission({
                    sessionId: session.id,
                    userId: user.id,
                    taskId: task.id,
                    score,
                    maxScore,
                    status: status as any,
                    resultsJson: results,
                })
            } else {
                await SessionRepository.updateSubmission(session.id, {
                    score,
                    maxScore,
                    status: status as any,
                    resultsJson: results,
                })
            }

            // Студент видит только открытые тесты
            const visibleResults = results.map((r, i) => ({
                ...r,
                hidden: task.testCases[i]?.isHidden ?? false,
                input: task.testCases[i]?.isHidden ? '***' : r.input,
                expectedOutput: task.testCases[i]?.isHidden ? '***' : r.expectedOutput,
            }))

            return reply.send({
                ok: true,
                data: { score, maxScore, status, results: visibleResults },
            })
        } catch (err: any) {
            return reply.status(err.statusCode ?? 500).send({ ok: false, error: err.message })
        }
    })

    // GET /sessions/:examId/result — результат студента
    app.get('/:examId/result', async (req, reply) => {
        try {
            const user = getUser(req)
            const { examId } = req.params as { examId: string }

            const session = await SessionRepository.findByExamAndUser(examId, user.id)
            if (!session) return reply.status(404).send({ ok: false, error: 'Сессия не найдена' })
            if (session.status === 'in_progress') {
                return reply.status(403).send({ ok: false, error: 'Экзамен ещё не сдан' })
            }

            return reply.send({ ok: true, data: session.submission })
        } catch (err: any) {
            return reply.status(err.statusCode ?? 500).send({ ok: false, error: err.message })
        }
    })

    // POST /sessions/:examId/run-code — запустить код без тестов
    app.post('/:examId/run-code', async (req, reply) => {
        try {
            const user = getUser(req)
            const { examId } = req.params as { examId: string }

            const session = await SessionRepository.findByExamAndUser(examId, user.id)
            if (!session) return reply.status(404).send({ ok: false, error: 'Сессия не найдена' })
            if (session.status !== 'in_progress') {
                return reply.status(400).send({ ok: false, error: 'Сессия уже завершена' })
            }

            const task = await TaskRepository.findById(session.taskId!)
            if (!task) return reply.status(404).send({ ok: false, error: 'Задание не найдено' })

            const entryFile = task.language === 'python' ? 'main.py' : 'index.js'
            const result = await runCode(session.projectId, task.language, entryFile, user.id)

            return reply.send({ ok: true, data: result })
        } catch (err: any) {
            return reply.status(err.statusCode ?? 500).send({ ok: false, error: err.message })
        }
    })
}