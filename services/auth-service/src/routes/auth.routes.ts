import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { createAuthService } from '../services/auth.service.js'
import { UserRepository } from '../repositories/user.repository.js'

const registerSchema = z.object({
    email: z.string().email('Некорректный email'),
    fullName: z.string().min(2, 'Минимум 2 символа').max(100),
    password: z.string().min(8, 'Минимум 8 символов'),
    groupId: z.string().uuid().optional(),  // ← добавить
})

const loginSchema = z.object({
    email: z.string().email(),
    password: z.string(),
})

const refreshSchema = z.object({
    refreshToken: z.string(),
})

export async function authRoutes(app: FastifyInstance) {
    const authService = createAuthService(app)

    // POST /auth/register
    app.post('/register', async (req, reply) => {
        const result = registerSchema.safeParse(req.body)
        if (!result.success) {
            return reply.status(400).send({
                ok: false,
                error: result.error.errors[0].message,
            })
        }

        try {
            const tokens = await authService.register(
                result.data.email,
                result.data.fullName,
                result.data.password,
                result.data.groupId,  // ← добавить
            )
            return reply.status(201).send({ ok: true, data: tokens })
        } catch (err: any) {
            return reply.status(err.statusCode ?? 500).send({
                ok: false,
                error: err.message,
            })
        }
    })

    // POST /auth/login
    app.post('/login', async (req, reply) => {
        const result = loginSchema.safeParse(req.body)
        if (!result.success) {
            return reply.status(400).send({ ok: false, error: 'Некорректные данные' })
        }

        try {
            const tokens = await authService.login(result.data.email, result.data.password)
            return reply.send({ ok: true, data: tokens })
        } catch (err: any) {
            return reply.status(err.statusCode ?? 500).send({
                ok: false,
                error: err.message,
            })
        }
    })

    // POST /auth/refresh
    app.post('/refresh', async (req, reply) => {
        const result = refreshSchema.safeParse(req.body)
        if (!result.success) {
            return reply.status(400).send({ ok: false, error: 'refreshToken обязателен' })
        }

        try {
            const tokens = await authService.refresh(result.data.refreshToken)
            return reply.send({ ok: true, data: tokens })
        } catch (err: any) {
            return reply.status(err.statusCode ?? 500).send({
                ok: false,
                error: err.message,
            })
        }
    })

    // POST /auth/logout
    app.post('/logout', async (req, reply) => {
        const result = refreshSchema.safeParse(req.body)
        if (!result.success) {
            return reply.status(400).send({ ok: false, error: 'refreshToken обязателен' })
        }

        await authService.logout(result.data.refreshToken)
        return reply.send({ ok: true, data: null })
    })

    // GET /auth/me  (защищённый)
    app.get('/me', {
        preHandler: async (req, reply) => {
            try { await req.jwtVerify() }
            catch { return reply.status(401).send({ ok: false, error: 'Требуется авторизация' }) }
        }
    }, async (req, reply) => {
        const payload = req.user as { sub: string }
        const user = await UserRepository.findById(payload.sub)
        if (!user) return reply.status(404).send({ ok: false, error: 'Пользователь не найден' })

        const { passwordHash, ...safe } = user
        return reply.send({ ok: true, data: safe })
    })
}