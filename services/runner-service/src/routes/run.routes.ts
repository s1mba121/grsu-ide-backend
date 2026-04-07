import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { runInDocker, normalizeOutput } from '../services/docker.service.js'
import { config } from '../config.js'

async function resolveProject(projectId: string, requesterId: string, requesterRole: string) {
    const url = `${config.FS_SERVICE_URL}/fs/projects/${projectId}`
    console.log(`[runner] resolving project from: ${url}`)

    const res = await fetch(url, {
        headers: {
            'x-user-id': requesterId,
            'x-user-role': requesterRole,
        },
    })

    if (!res.ok) {
        const text = await res.text()
        console.error(`[runner] fs-service error ${res.status}:`, text)
        throw { statusCode: 404, message: 'Проект не найден' }
    }

    const data = await res.json() as { data: { userId: string; language: string } }
    return data.data
}

export async function runRoutes(app: FastifyInstance) {
    // POST /runner/run — разовый запуск кода напрямую (без очереди)
    app.post('/run', async (req, reply) => {
        const userId = req.headers['x-user-id'] as string
        const userRole = (req.headers['x-user-role'] as string) ?? 'student'

        if (!userId) {
            return reply.status(401).send({ ok: false, error: 'Требуется авторизация' })
        }

        const schema = z.object({
            projectId: z.string().uuid(),
            entryFile: z.string().min(1),
            language: z.enum(['python', 'javascript']),
            stdin: z.string().optional(),
        })

        const result = schema.safeParse(req.body)
        if (!result.success) {
            return reply.status(400).send({ ok: false, error: result.error.errors[0].message })
        }

        try {
            const project = await resolveProject(result.data.projectId, userId, userRole)

            const runResult = await runInDocker({
                projectId: result.data.projectId,
                userId: project.userId,
                language: result.data.language,
                entryFile: result.data.entryFile,
                stdin: result.data.stdin,
            })

            return reply.send({ ok: true, data: runResult })
        } catch (err: any) {
            console.error('[runner] run error:', err)
            return reply.status(err.statusCode ?? 500).send({ ok: false, error: err.message ?? 'Внутренняя ошибка' })
        }
    })

    // POST /runner/test — прогон тест-кейсов от task-service
    app.post('/test', async (req, reply) => {
        const schema = z.object({
            projectId: z.string().uuid(),
            userId: z.string(),
            language: z.enum(['python', 'javascript']),
            entryFile: z.string().min(1),
            testCases: z.array(z.object({
                input: z.string(),
                expectedOutput: z.string(),
            })).min(1),
        })

        const result = schema.safeParse(req.body)
        if (!result.success) {
            return reply.status(400).send({ ok: false, error: result.error.errors[0].message })
        }

        try {
            const { projectId, userId, language, entryFile, testCases } = result.data
            const results = []

            for (let i = 0; i < testCases.length; i++) {
                const tc = testCases[i]
                const runResult = await runInDocker({
                    projectId,
                    userId,
                    language,
                    entryFile,
                    stdin: tc.input,
                })

                const actualNorm = normalizeOutput(runResult.stdout)
                const expectedNorm = normalizeOutput(tc.expectedOutput)
                const passed = actualNorm === expectedNorm
                    && runResult.exitCode === 0
                    && !runResult.timedOut

                results.push({
                    index: i,
                    passed,
                    input: tc.input,
                    expectedOutput: tc.expectedOutput,
                    actualOutput: runResult.stdout,
                    durationMs: runResult.durationMs,
                    timedOut: runResult.timedOut,
                    error: runResult.exitCode !== 0 ? runResult.stderr : undefined,
                })
            }

            return reply.send({ ok: true, data: results })
        } catch (err: any) {
            console.error('[runner] test error:', err)
            return reply.status(err.statusCode ?? 500).send({ ok: false, error: err.message ?? 'Внутренняя ошибка' })
        }
    })
}