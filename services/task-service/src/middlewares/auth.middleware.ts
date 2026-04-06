import type { FastifyRequest, FastifyReply } from 'fastify'

export function getUser(req: FastifyRequest): { id: string; role: string } {
    const id = req.headers['x-user-id'] as string
    const role = req.headers['x-user-role'] as string
    if (!id || !role) throw { statusCode: 401, message: 'Требуется авторизация' }
    return { id, role }
}

export function requireRole(roles: string[]) {
    return (req: FastifyRequest, reply: FastifyReply, done: () => void) => {
        const id = req.headers['x-user-id'] as string
        const role = req.headers['x-user-role'] as string
        if (!id || !role) {
            reply.status(401).send({ ok: false, error: 'Требуется авторизация' })
            return
        }
        if (!roles.includes(role)) {
            reply.status(403).send({ ok: false, error: 'Нет доступа' })
            return
        }
        done()
    }
}