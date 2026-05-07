import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { UserRepository } from '../repositories/user.repository.js'
import { requireAuth } from '../middlewares/auth.middleware.js'
import type { Role } from '@prisma/client'
import bcrypt from 'bcryptjs'
import { config } from '../config.js'

export async function usersRoutes(app: FastifyInstance) {
    const listQuerySchema = z.object({
        q: z.string().trim().optional(),
        role: z.enum(['student', 'teacher', 'admin']).optional(),
        status: z.enum(['active', 'banned', 'all']).default('all'),
    })

    const createUserSchema = z.object({
        email: z.string().email('Некорректный email'),
        fullName: z.string().min(2, 'Минимум 2 символа').max(100),
        password: z.string().min(8, 'Минимум 8 символов'),
        role: z.enum(['student', 'teacher', 'admin']),
        groupId: z.string().uuid().optional(),
    })

    const banSchema = z.object({
        banned: z.boolean(),
    })

    function toSafeUser<T extends { passwordHash: string }>(user: T) {
        const { passwordHash, ...safe } = user
        return safe
    }

    // GET /users — только admin
    app.get('/users', { preHandler: requireAuth(['admin']) }, async (req, reply) => {
        const parsed = listQuerySchema.safeParse(req.query)
        if (!parsed.success) {
            return reply.status(400).send({ ok: false, error: 'Некорректные параметры фильтрации' })
        }

        const users = await UserRepository.search(parsed.data)
        const safe = users.map(toSafeUser)
        return reply.send({ ok: true, data: safe })
    })

    // POST /users — создание пользователя (admin)
    app.post('/users', { preHandler: requireAuth(['admin']) }, async (req, reply) => {
        const result = createUserSchema.safeParse(req.body)
        if (!result.success) {
            return reply.status(400).send({ ok: false, error: result.error.errors[0].message })
        }

        const existing = await UserRepository.findByEmail(result.data.email)
        if (existing) {
            return reply.status(409).send({ ok: false, error: 'Email уже зарегистрирован' })
        }

        const passwordHash = await bcrypt.hash(result.data.password, config.BCRYPT_ROUNDS)
        const user = await UserRepository.create({
            email: result.data.email,
            fullName: result.data.fullName,
            role: result.data.role as Role,
            passwordHash,
            groupId: result.data.role === 'student' ? result.data.groupId : undefined,
        })

        return reply.status(201).send({ ok: true, data: toSafeUser(user) })
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
        return reply.send({ ok: true, data: toSafeUser(user) })
    })

    // PATCH /users/:id/ban — блокировка/разблокировка
    app.patch('/users/:id/ban', { preHandler: requireAuth(['admin']) }, async (req, reply) => {
        const { id } = req.params as { id: string }
        const result = banSchema.safeParse(req.body)
        if (!result.success) {
            return reply.status(400).send({ ok: false, error: 'Некорректный статус блокировки' })
        }

        const actor = req.user as { sub: string }
        if (actor.sub === id && result.data.banned) {
            return reply.status(400).send({ ok: false, error: 'Нельзя заблокировать самого себя' })
        }

        const user = await UserRepository.setBan(id, result.data.banned)
        return reply.send({ ok: true, data: toSafeUser(user) })
    })

    // DELETE /users/:id — удаление пользователя
    app.delete('/users/:id', { preHandler: requireAuth(['admin']) }, async (req, reply) => {
        const { id } = req.params as { id: string }
        const actor = req.user as { sub: string }
        if (actor.sub === id) {
            return reply.status(400).send({ ok: false, error: 'Нельзя удалить самого себя' })
        }

        await UserRepository.deleteById(id)
        return reply.send({ ok: true, data: null })
    })
}