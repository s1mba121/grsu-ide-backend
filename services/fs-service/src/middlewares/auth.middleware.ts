import type { FastifyRequest, FastifyReply } from 'fastify'

// fs-service не верифицирует JWT сам — Gateway уже сделал это
// Просто читаем заголовки которые Gateway проставил
export function getUserFromHeaders(req: FastifyRequest): { id: string; role: string } {
    const id = req.headers['x-user-id'] as string
    const role = req.headers['x-user-role'] as string

    if (!id || !role) {
        throw { statusCode: 401, message: 'Требуется авторизация' }
    }

    return { id, role }
}

export function requireAuthHeader(req: FastifyRequest, reply: FastifyReply, done: () => void) {
    const id = req.headers['x-user-id'] as string
    if (!id) {
        reply.status(401).send({ ok: false, error: 'Требуется авторизация' })
        return
    }
    done()
}