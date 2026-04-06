import type { FastifyRequest, FastifyReply } from 'fastify'
import type { UserRole } from '@grsu/types'

export function requireAuth(roles?: UserRole[]) {
    return async (req: FastifyRequest, reply: FastifyReply) => {
        try {
            await req.jwtVerify()
        } catch {
            return reply.status(401).send({ ok: false, error: 'Требуется авторизация' })
        }

        if (roles && roles.length > 0) {
            const payload = req.user as { role: UserRole }
            if (!roles.includes(payload.role)) {
                return reply.status(403).send({ ok: false, error: 'Нет доступа' })
            }
        }
    }
}