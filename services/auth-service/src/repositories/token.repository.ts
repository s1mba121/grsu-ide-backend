import { prisma } from '../db.js'
import { createHash } from 'crypto'

function hashToken(token: string): string {
    return createHash('sha256').update(token).digest('hex')
}

export const TokenRepository = {
    async save(userId: string, token: string, expiresAt: Date) {
        const tokenHash = hashToken(token)
        return prisma.refreshToken.create({
            data: { userId, tokenHash, expiresAt },
        })
    },

    async findAndDelete(token: string) {
        const tokenHash = hashToken(token)
        const record = await prisma.refreshToken.findUnique({ where: { tokenHash } })
        if (!record) return null
        await prisma.refreshToken.delete({ where: { tokenHash } })
        return record
    },

    async deleteAllForUser(userId: string) {
        return prisma.refreshToken.deleteMany({ where: { userId } })
    },

    async deleteExpired() {
        return prisma.refreshToken.deleteMany({
            where: { expiresAt: { lt: new Date() } },
        })
    },
}