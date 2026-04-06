import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { UserRepository } from '../repositories/user.repository.js'
import { requireAuth } from '../middlewares/auth.middleware.js'
import type { Role } from '@prisma/client'

export async function usersRoutes(app: FastifyInstance) {
    // GET /users — только admin
    app.get('/users', { preHandler: requireAuth(['admin']) }, async (req, reply) => {
        const users = await UserRepository.findAll()
        const safe = users.map(({ passwordHash, ...u }) => u)
        return reply.send({ ok: true, data: safe })
    })

    // GET /users/:id — admin или сам пользователь
    app.get('/users/:id', { preHandler: requireAuth(['admin', 'teacher']) }, async (req, reply) => {
        const { id } = req.params as { id: string }
        const user = await UserRepository.findById(id)
        if (!user) return reply.status(404).send({ ok: false, error: 'Не найден' })

        const { passwordHash, ...safe } = user
        return reply.send({ ok: true, data: safe })
    })

    // PATCH /users/:id/role — только admin
    app.patch('/users/:id/role', { preHandler: requireAuth(['admin']) }, async (req, reply) => {
        const { id } = req.params as { id: string }
        const schema = z.object({ role: z.enum(['student', 'teacher', 'admin']) })
        const result = schema.safeParse(req.body)
        if (!result.success) {
            return reply.status(400).send({ ok: false, error: 'Некорректная роль' })
        }

        const user = await UserRepository.updateRole(id, result.data.role as Role)
        const { passwordHash, ...safe } = user
        return reply.send({ ok: true, data: safe })
    })
}