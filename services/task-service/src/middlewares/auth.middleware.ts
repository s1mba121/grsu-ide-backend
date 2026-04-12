import type { FastifyRequest, FastifyReply } from 'fastify'

export function getUser(req: FastifyRequest): { id: string; role: string; email: string; fullName: string; groupId?: string } {
    const id = req.headers['x-user-id'] as string
    const role = req.headers['x-user-role'] as string
    const email = req.headers['x-user-email'] as string ?? ''
    const fullName = req.headers['x-user-fullname'] as string ?? ''
    const groupId = req.headers['x-user-groupid'] as string || undefined
    if (!id || !role) throw { statusCode: 401, message: 'Требуется авторизация' }
    return { id, role, email, fullName, groupId }
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