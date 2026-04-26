import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { ExamRepository } from '../repositories/exam.repository.js'
import { SessionRepository } from '../repositories/session.repository.js'
import { ExamService } from '../services/exam.service.js'
import { getUser, requireRole } from '../middlewares/auth.middleware.js'
import { config } from '../config.js'

type LivePayload = {
    sessionId: string
    status: string
    warningsCount: number
    startedAt: Date
    finishedAt: Date | null
    codePath: string
    code: string
    codeReadError: string | null
    files: string[]
    tests: unknown[]
    submission: {
        score: number
        maxScore: number
        status: string
        submittedAt: Date
    } | null
}

async function resolveSession(examId: string, sessionKey: string) {
    const byUserId = await SessionRepository.findByExamAndUser(examId, sessionKey)
    if (byUserId) return byUserId
    return SessionRepository.findByExamAndSessionId(examId, sessionKey)
}

type FsTreeNode = {
    type: 'file' | 'dir'
    path: string
    children?: FsTreeNode[]
}

function flattenFilePaths(nodes: FsTreeNode[]): string[] {
    const out: string[] = []
    const walk = (list: FsTreeNode[]) => {
        list.forEach((node) => {
            if (node.type === 'file') {
                out.push(node.path)
                return
            }
            if (Array.isArray(node.children) && node.children.length > 0) {
                walk(node.children)
            }
        })
    }
    walk(nodes)
    return out.sort()
}

async function buildLivePayload(examId: string, studentUserId: string, teacherUser: { id: string; role: string }): Promise<LivePayload> {
    const session = await resolveSession(examId, studentUserId)
    if (!session) throw { statusCode: 404, message: 'Сессия не найдена' }

    const language = session.task?.language ?? 'python'
    const entryFile = language === 'javascript' ? 'index.js' : 'main.py'

    const headers = {
        'Content-Type': 'application/json',
        'x-user-id': teacherUser.id,
        'x-user-role': teacherUser.role,
    }

    let code = ''
    let codePath = entryFile
    let codeReadError: string | null = null
    let files: string[] = []

    const treeRes = await fetch(`${config.FS_SERVICE_URL}/fs/${session.projectId}/tree`, { headers })
    if (treeRes.ok) {
        const treeData = await treeRes.json() as { data: FsTreeNode[] }
        files = flattenFilePaths(treeData.data)
        const rootEntry = treeData.data.find(node => node.type === 'dir')
        if (rootEntry?.path) {
            codePath = `${rootEntry.path}/${entryFile}`
        }
        if (files.includes(codePath) === false && files.length > 0) {
            codePath = files[0]
        }
    }

    const fileRes = await fetch(
        `${config.FS_SERVICE_URL}/fs/${session.projectId}/file?path=${encodeURIComponent(codePath)}`,
        { headers }
    )
    if (fileRes.ok) {
        const fileData = await fileRes.json() as { data: { content: string } }
        code = fileData.data.content
    } else {
        codeReadError = 'Не удалось прочитать файл решения'
    }

    const tests = Array.isArray(session.submission?.resultsJson)
        ? session.submission?.resultsJson
        : []

    return {
        sessionId: session.id,
        status: session.status,
        warningsCount: session.warningsCount,
        startedAt: session.startedAt,
        finishedAt: session.finishedAt,
        codePath,
        code,
        codeReadError,
        files,
        tests,
        submission: session.submission ? {
            score: session.submission.score,
            maxScore: session.submission.maxScore,
            status: session.submission.status,
            submittedAt: session.submission.submittedAt,
        } : null,
    }
}

export async function examsRoutes(app: FastifyInstance) {
    // POST /exams — создать экзамен (teacher)
    app.post('/', { preHandler: requireRole(['teacher', 'admin']) }, async (req, reply) => {
        try {
            const user = getUser(req)
            const schema = z.object({
                taskId: z.string().uuid().optional(),
                folderId: z.string().uuid().optional(),
                title: z.string().min(1).max(255),
                openMode: z.enum(['manual', 'scheduled']).default('manual'),
                startsAt: z.string().datetime().optional(),
                endsAt: z.string().datetime().optional(),
                groupId: z.string().uuid(),
            }).refine(d => d.taskId || d.folderId, {
                message: 'Укажите taskId или folderId',
            })

            const result = schema.safeParse(req.body)
            if (!result.success) {
                return reply.status(400).send({ ok: false, error: result.error.errors[0].message })
            }

            const exam = await ExamService.createExam({
                ...result.data,
                openMode: result.data.openMode as any,
                startsAt: result.data.startsAt ? new Date(result.data.startsAt) : undefined,
                endsAt: result.data.endsAt ? new Date(result.data.endsAt) : undefined,
                createdBy: user.id,
            })

            return reply.status(201).send({ ok: true, data: exam })
        } catch (err: any) {
            return reply.status(err.statusCode ?? 500).send({ ok: false, error: err.message })
        }
    })

    // GET /exams — список экзаменов преподавателя
    app.get('/', { preHandler: requireRole(['teacher', 'admin']) }, async (req, reply) => {
        const user = getUser(req)
        const exams = await ExamRepository.findByTeacher(user.id)
        return reply.send({ ok: true, data: exams })
    })

    // GET /exams/my — экзамены группы студента
    app.get('/my', async (req, reply) => {
        try {
            const user = getUser(req)
            console.log('[GET /my] user:', user)  // ← добавить
            if (!user.groupId) {
                return reply.status(400).send({ ok: false, error: 'Вы не состоите в группе' })
            }
            const exams = await ExamRepository.findByGroup(user.groupId)
            return reply.send({ ok: true, data: exams })
        } catch (err: any) {
            return reply.status(err.statusCode ?? 500).send({ ok: false, error: err.message })
        }
    })

    app.get('/my/:id', async (req, reply) => {
        try {
            const user = getUser(req)
            const { id } = req.params as { id: string }
            const exam = await ExamRepository.findById(id)
            if (!exam) return reply.status(404).send({ ok: false, error: 'Не найдено' })
            if (exam.groupId !== user.groupId) {
                return reply.status(403).send({ ok: false, error: 'Нет доступа' })
            }
            return reply.send({ ok: true, data: exam })
        } catch (err: any) {
            return reply.status(err.statusCode ?? 500).send({ ok: false, error: err.message })
        }
    })

    // GET /exams/:id — детали (teacher)
    app.get('/:id', { preHandler: requireRole(['teacher', 'admin']) }, async (req, reply) => {
        try {
            const { id } = req.params as { id: string }
            const exam = await ExamRepository.findById(id)
            if (!exam) return reply.status(404).send({ ok: false, error: 'Не найдено' })
            return reply.send({ ok: true, data: exam })
        } catch (err: any) {
            return reply.status(err.statusCode ?? 500).send({ ok: false, error: err.message })
        }
    })

    // PATCH /exams/:id/open — открыть вручную
    app.patch('/:id/open', { preHandler: requireRole(['teacher', 'admin']) }, async (req, reply) => {
        try {
            const { id } = req.params as { id: string }
            const exam = await ExamService.openExam(id)  // ← через сервис
            return reply.send({ ok: true, data: exam })
        } catch (err: any) {
            return reply.status(err.statusCode ?? 500).send({ ok: false, error: err.message })
        }
    })

    // PATCH /exams/:id/close — закрыть
    app.patch('/:id/close', { preHandler: requireRole(['teacher', 'admin']) }, async (req, reply) => {
        try {
            const { id } = req.params as { id: string }
            const exam = await ExamRepository.updateStatus(id, 'closed', new Date())
            return reply.send({ ok: true, data: exam })
        } catch (err: any) {
            return reply.status(err.statusCode ?? 500).send({ ok: false, error: err.message })
        }
    })

    // GET /exams/:id/results — сводная таблица результатов
    app.get('/:id/results', { preHandler: requireRole(['teacher', 'admin']) }, async (req, reply) => {
        try {
            const { SessionRepository } = await import('../repositories/session.repository.js')
            const { id } = req.params as { id: string }
            const sessions = await SessionRepository.findAllByExam(id)
            return reply.send({ ok: true, data: sessions })
        } catch (err: any) {
            return reply.status(err.statusCode ?? 500).send({ ok: false, error: err.message })
        }
    })

    // GET /exams/:id/sessions/:sessionId/anticheat
    app.get('/:id/sessions/:sessionId/anticheat', { preHandler: requireRole(['teacher', 'admin']) }, async (req, reply) => {
        try {
            const { SessionRepository } = await import('../repositories/session.repository.js')
            const { id, sessionId } = req.params as { id: string; sessionId: string }
            const session = await resolveSession(id, sessionId)
            if (!session) {
                return reply.status(404).send({ ok: false, error: 'Сессия не найдена' })
            }
            const logs = await SessionRepository.getAntiCheatLogs(session.id)
            return reply.send({ ok: true, data: logs })
        } catch (err: any) {
            return reply.status(err.statusCode ?? 500).send({ ok: false, error: err.message })
        }
    })

    // GET /exams/:id/sessions/:sessionId/live
    app.get('/:id/sessions/:sessionId/live', { preHandler: requireRole(['teacher', 'admin']) }, async (req, reply) => {
        try {
            const user = getUser(req)
            const { id, sessionId } = req.params as { id: string; sessionId: string }
            const payload = await buildLivePayload(id, sessionId, user)

            return reply.send({
                ok: true,
                data: payload,
            })
        } catch (err: any) {
            return reply.status(err.statusCode ?? 500).send({ ok: false, error: err.message })
        }
    })

    // GET /exams/:id/sessions/:sessionId/live/file?path=...
    app.get('/:id/sessions/:sessionId/live/file', { preHandler: requireRole(['teacher', 'admin']) }, async (req, reply) => {
        try {
            const user = getUser(req)
            const { id, sessionId } = req.params as { id: string; sessionId: string }
            const { path } = req.query as { path?: string }
            if (!path) return reply.status(400).send({ ok: false, error: 'path обязателен' })

            const session = await resolveSession(id, sessionId)
            if (!session) return reply.status(404).send({ ok: false, error: 'Сессия не найдена' })

            const fileRes = await fetch(
                `${config.FS_SERVICE_URL}/fs/${session.projectId}/file?path=${encodeURIComponent(path)}`,
                {
                    headers: {
                        'Content-Type': 'application/json',
                        'x-user-id': user.id,
                        'x-user-role': user.role,
                    },
                }
            )

            if (!fileRes.ok) {
                return reply.status(404).send({ ok: false, error: 'Файл не найден или недоступен' })
            }

            const fileData = await fileRes.json() as { data: { content: string } }
            return reply.send({ ok: true, data: { path, content: fileData.data.content } })
        } catch (err: any) {
            return reply.status(err.statusCode ?? 500).send({ ok: false, error: err.message })
        }
    })

    // GET /exams/:id/sessions/:sessionId/live/events — realtime стрим с кодом/тестами
    app.get('/:id/sessions/:sessionId/live/events', { preHandler: requireRole(['teacher', 'admin']) }, async (req, reply) => {
        const user = getUser(req)
        const { id, sessionId } = req.params as { id: string; sessionId: string }

        reply.raw.writeHead(200, {
            'Content-Type': 'text/event-stream',
            'Cache-Control': 'no-cache',
            'Connection': 'keep-alive',
            'X-Accel-Buffering': 'no',
        })

        try {
            let lastSnapshot = ''

            const sendLive = async (type: 'snapshot' | 'update') => {
                const payload = await buildLivePayload(id, sessionId, user)
                const snapshot = JSON.stringify({
                    status: payload.status,
                    warningsCount: payload.warningsCount,
                    finishedAt: payload.finishedAt,
                    codePath: payload.codePath,
                    code: payload.code,
                    tests: payload.tests,
                    submission: payload.submission,
                })

                if (type === 'snapshot' || snapshot !== lastSnapshot) {
                    lastSnapshot = snapshot
                    reply.raw.write(`data: ${JSON.stringify({ type, payload })}\n\n`)
                }
            }

            await sendLive('snapshot')

            const ping = setInterval(() => {
                reply.raw.write(`data: ${JSON.stringify({ type: 'ping' })}\n\n`)
            }, 15000)

            const poll = setInterval(async () => {
                try {
                    await sendLive('update')
                } catch {
                    // ignore transient errors while stream stays open
                }
            }, 2000)

            req.raw.on('close', () => {
                clearInterval(ping)
                clearInterval(poll)
            })
        } catch (err: any) {
            reply.raw.write(`data: ${JSON.stringify({ type: 'error', error: err.message ?? 'stream error' })}\n\n`)
            reply.raw.end()
        }
    })

    // GET /exams/join/:token — инфо об экзамене по инвайт-токену (публичный)
    app.get('/join/:token', async (req, reply) => {
        try {
            const { token } = req.params as { token: string }
            const exam = await ExamRepository.findByToken(token)
            if (!exam) return reply.status(404).send({ ok: false, error: 'Экзамен не найден' })

            return reply.send({
                ok: true,
                data: {
                    id: exam.id,
                    title: exam.title,
                    status: exam.status,
                    task: exam.task,
                    openMode: exam.openMode,
                    startsAt: exam.startsAt,
                    endsAt: exam.endsAt,
                },
            })
        } catch (err: any) {
            return reply.status(err.statusCode ?? 500).send({ ok: false, error: err.message })
        }
    })

    // POST /exams/join/:token — вступить в экзамен (student)
    app.post('/join/:token', async (req, reply) => {
        try {
            const user = getUser(req)
            const { token } = req.params as { token: string }
            const exam = await ExamRepository.findByToken(token)
            if (!exam) return reply.status(404).send({ ok: false, error: 'Экзамен не найден' })
            if (exam.status === 'closed') {
                return reply.status(403).send({ ok: false, error: 'Экзамен закрыт' })
            }

            await ExamRepository.addParticipant(exam.id, user.id, user.fullName, user.email)
            return reply.send({ ok: true, data: { examId: exam.id, joined: true } })
        } catch (err: any) {
            return reply.status(err.statusCode ?? 500).send({ ok: false, error: err.message })
        }
    })

    // GET /exams/:id/events — SSE стрим для преподавателя
    app.get('/:id/events', { preHandler: requireRole(['teacher', 'admin']) }, async (req, reply) => {
        const { id } = req.params as { id: string }

        reply.raw.writeHead(200, {
            'Content-Type': 'text/event-stream',
            'Cache-Control': 'no-cache',
            'Connection': 'keep-alive',
            'X-Accel-Buffering': 'no',  // отключаем буферизацию nginx
        })

        // Отправляем начальное состояние
        const sessions = await SessionRepository.findAllByExam(id)
        reply.raw.write(`data: ${JSON.stringify({ type: 'snapshot', sessions })}\n\n`)

        // Пингуем каждые 15 сек чтобы не закрылось соединение
        const ping = setInterval(() => {
            reply.raw.write(`data: ${JSON.stringify({ type: 'ping' })}\n\n`)
        }, 15000)

        // Поллинг БД каждые 3 секунды — ищем изменения
        let lastSnapshot = JSON.stringify(sessions.map(s => ({ id: s.id, status: s.status, warningsCount: s.warningsCount })))

        const poll = setInterval(async () => {
            try {
                const current = await SessionRepository.findAllByExam(id)
                const currentSnapshot = JSON.stringify(current.map(s => ({ id: s.id, status: s.status, warningsCount: s.warningsCount })))

                if (currentSnapshot !== lastSnapshot) {
                    lastSnapshot = currentSnapshot
                    reply.raw.write(`data: ${JSON.stringify({ type: 'update', sessions: current })}\n\n`)
                }
            } catch { }
        }, 3000)

        req.raw.on('close', () => {
            clearInterval(ping)
            clearInterval(poll)
        })
    })
}