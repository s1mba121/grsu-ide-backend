import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { TaskRepository } from '../repositories/task.repository.js'
import { getUser, requireRole } from '../middlewares/auth.middleware.js'

export async function tasksRoutes(app: FastifyInstance) {
    // POST /tasks — создать задание (teacher)
    app.post('/', { preHandler: requireRole(['teacher', 'admin']) }, async (req, reply) => {
        const user = getUser(req)
        const schema = z.object({
            title: z.string().min(1).max(255),
            description: z.string().min(1),
            language: z.enum(['python', 'javascript']),
            templateCode: z.string(),
            timeLimitMin: z.number().int().min(5).max(300).default(60),
        })

        const result = schema.safeParse(req.body)
        if (!result.success) {
            return reply.status(400).send({ ok: false, error: result.error.errors[0].message })
        }

        const task = await TaskRepository.create({ ...result.data, createdBy: user.id })
        return reply.status(201).send({ ok: true, data: task })
    })

    // GET /tasks — список заданий преподавателя
    app.get('/', { preHandler: requireRole(['teacher', 'admin']) }, async (req, reply) => {
        const user = getUser(req)
        const tasks = await TaskRepository.findByTeacher(user.id)
        return reply.send({ ok: true, data: tasks })
    })

    // GET /tasks/:id
    app.get('/:id', async (req, reply) => {
        try {
            const user = getUser(req)
            const { id } = req.params as { id: string }
            const task = await TaskRepository.findById(id)
            if (!task) return reply.status(404).send({ ok: false, error: 'Задание не найдено' })

            // Студент не видит скрытые тест-кейсы
            if (user.role === 'student') {
                task.testCases = task.testCases.filter(tc => !tc.isHidden)
            }

            return reply.send({ ok: true, data: task })
        } catch (err: any) {
            return reply.status(err.statusCode ?? 500).send({ ok: false, error: err.message })
        }
    })

    // PATCH /tasks/:id
    app.patch('/:id', { preHandler: requireRole(['teacher', 'admin']) }, async (req, reply) => {
        try {
            const user = getUser(req)
            const { id } = req.params as { id: string }
            const task = await TaskRepository.findById(id)
            if (!task) return reply.status(404).send({ ok: false, error: 'Не найдено' })
            if (task.createdBy !== user.id && user.role !== 'admin') {
                return reply.status(403).send({ ok: false, error: 'Нет доступа' })
            }

            const schema = z.object({
                title: z.string().min(1).max(255).optional(),
                description: z.string().optional(),
                templateCode: z.string().optional(),
                timeLimitMin: z.number().int().min(5).max(300).optional(),
            })

            const result = schema.safeParse(req.body)
            if (!result.success) {
                return reply.status(400).send({ ok: false, error: result.error.errors[0].message })
            }

            const updated = await TaskRepository.update(id, result.data)
            return reply.send({ ok: true, data: updated })
        } catch (err: any) {
            return reply.status(err.statusCode ?? 500).send({ ok: false, error: err.message })
        }
    })

    // DELETE /tasks/:id
    app.delete('/:id', { preHandler: requireRole(['teacher', 'admin']) }, async (req, reply) => {
        try {
            const user = getUser(req)
            const { id } = req.params as { id: string }
            const task = await TaskRepository.findById(id)
            if (!task) return reply.status(404).send({ ok: false, error: 'Не найдено' })
            if (task.createdBy !== user.id && user.role !== 'admin') {
                return reply.status(403).send({ ok: false, error: 'Нет доступа' })
            }

            await TaskRepository.delete(id)
            return reply.send({ ok: true, data: null })
        } catch (err: any) {
            return reply.status(err.statusCode ?? 500).send({ ok: false, error: err.message })
        }
    })

    // POST /tasks/:id/test-cases
    app.post('/:id/test-cases', { preHandler: requireRole(['teacher', 'admin']) }, async (req, reply) => {
        try {
            const { id } = req.params as { id: string }
            const schema = z.object({
                input: z.string(),
                expectedOutput: z.string(),
                isHidden: z.boolean().default(true),
                points: z.number().int().min(1).default(1),
                orderIndex: z.number().int().min(0).default(0),
            })

            const result = schema.safeParse(req.body)
            if (!result.success) {
                return reply.status(400).send({ ok: false, error: result.error.errors[0].message })
            }

            const tc = await TaskRepository.addTestCase(id, result.data)
            return reply.status(201).send({ ok: true, data: tc })
        } catch (err: any) {
            return reply.status(err.statusCode ?? 500).send({ ok: false, error: err.message })
        }
    })

    // PATCH /tasks/:id/test-cases/:tcId
    app.patch('/:id/test-cases/:tcId', { preHandler: requireRole(['teacher', 'admin']) }, async (req, reply) => {
        try {
            const { tcId } = req.params as { id: string; tcId: string }
            const schema = z.object({
                input: z.string().optional(),
                expectedOutput: z.string().optional(),
                isHidden: z.boolean().optional(),
                points: z.number().int().min(1).optional(),
            })

            const result = schema.safeParse(req.body)
            if (!result.success) {
                return reply.status(400).send({ ok: false, error: result.error.errors[0].message })
            }

            const tc = await TaskRepository.updateTestCase(tcId, result.data)
            return reply.send({ ok: true, data: tc })
        } catch (err: any) {
            return reply.status(err.statusCode ?? 500).send({ ok: false, error: err.message })
        }
    })

    // DELETE /tasks/:id/test-cases/:tcId
    app.delete('/:id/test-cases/:tcId', { preHandler: requireRole(['teacher', 'admin']) }, async (req, reply) => {
        try {
            const { tcId } = req.params as { id: string; tcId: string }
            await TaskRepository.deleteTestCase(tcId)
            return reply.send({ ok: true, data: null })
        } catch (err: any) {
            return reply.status(err.statusCode ?? 500).send({ ok: false, error: err.message })
        }
    })
}