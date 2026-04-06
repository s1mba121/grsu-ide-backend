import { prisma } from '../db.js'

export const GroupRepository = {
    async create(name: string) {
        return prisma.group.create({ data: { name } })
    },

    async findAll() {
        return prisma.group.findMany({
            include: { _count: { select: { users: true } } },
            orderBy: { name: 'asc' },
        })
    },

    async findById(id: string) {
        return prisma.group.findUnique({
            where: { id },
            include: { users: true },
        })
    },

    async addMember(groupId: string, userId: string) {
        return prisma.user.update({
            where: { id: userId },
            data: { groupId },
        })
    },

    async removeMember(userId: string) {
        return prisma.user.update({
            where: { id: userId },
            data: { groupId: null },
        })
    },
}