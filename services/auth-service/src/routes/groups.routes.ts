import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { GroupRepository } from '../repositories/group.repository.js'
import { requireAuth } from '../middlewares/auth.middleware.js'
import { config } from '../config.js'

export async function groupsRoutes(app: FastifyInstance) {
    // POST /groups — admin
    app.post('/groups', { preHandler: requireAuth(['admin']) }, async (req, reply) => {
        const schema = z.object({ name: z.string().min(1).max(100) })
        const result = schema.safeParse(req.body)
        if (!result.success) {
            return reply.status(400).send({ ok: false, error: 'Некорректное название' })
        }

        try {
            const group = await GroupRepository.create(result.data.name)
            return reply.status(201).send({ ok: true, data: group })
        } catch {
            return reply.status(409).send({ ok: false, error: 'Группа уже существует' })
        }
    })

    // GET /groups — teacher, admin
    // , { preHandler: requireAuth(['admin', 'teacher']) }
    app.get('/groups', async (_req, reply) => {
        const groups = await GroupRepository.findAll()
        return reply.send({ ok: true, data: groups })
    })

    // GET /groups/:id
    app.get('/groups/:id', { preHandler: requireAuth(['admin', 'teacher']) }, async (req, reply) => {
        const { id } = req.params as { id: string }
        const group = await GroupRepository.findById(id)
        if (!group) return reply.status(404).send({ ok: false, error: 'Группа не найдена' })
        return reply.send({ ok: true, data: group })
    })

    // POST /groups/:id/members — добавить студента
    app.post('/groups/:id/members', { preHandler: requireAuth(['admin', 'teacher']) }, async (req, reply) => {
        const { id } = req.params as { id: string }
        const schema = z.object({ userId: z.string().uuid() })
        const result = schema.safeParse(req.body)
        if (!result.success) {
            return reply.status(400).send({ ok: false, error: 'userId обязателен' })
        }

        try {
            const user = await GroupRepository.addMember(id, result.data.userId)
            const { passwordHash, ...safe } = user
            return reply.send({ ok: true, data: safe })
        } catch {
            return reply.status(404).send({ ok: false, error: 'Пользователь не найден' })
        }
    })

    // DELETE /groups/:id/members/:userId
    app.delete('/groups/:id/members/:userId', { preHandler: requireAuth(['admin', 'teacher']) }, async (req, reply) => {
        const { userId } = req.params as { id: string; userId: string }
        try {
            await GroupRepository.removeMember(userId)
            return reply.send({ ok: true, data: null })
        } catch {
            return reply.status(404).send({ ok: false, error: 'Пользователь не найден' })
        }
    })

    // GET /internal/groups/:id/members — только для межсервисных запросов
    app.get('/internal/groups/:id/members', async (req, reply) => {
        const serviceKey = req.headers['x-service-key']
        if (serviceKey !== config.SERVICE_KEY) {  // ← config вместо process.env
            return reply.status(403).send({ ok: false, error: 'Forbidden' })
        }

        const { id } = req.params as { id: string }
        const group = await GroupRepository.findById(id)
        if (!group) return reply.status(404).send({ ok: false, error: 'Группа не найдена' })

        const students = group.users
            .filter(u => u.role === 'student')
            .map(({ passwordHash, ...u }) => u)

        return reply.send({ ok: true, data: students })
    })
}