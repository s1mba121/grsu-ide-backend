import { prisma } from '../db.js'
import type { Role } from '@prisma/client'

export const UserRepository = {
    async findByEmail(email: string) {
        return prisma.user.findUnique({
            where: { email },
            include: { group: true },
        })
    },

    async findById(id: string) {
        return prisma.user.findUnique({
            where: { id },
            include: { group: true },
        })
    },

    async create(data: {
        email: string
        fullName: string
        passwordHash: string
        role?: Role
        groupId?: string
    }) {
        return prisma.user.create({
            data,
            include: { group: true },
        })
    },

    async updateRole(id: string, role: Role) {
        return prisma.user.update({
            where: { id },
            data: { role },
        })
    },

    async findAll() {
        return prisma.user.findMany({
            include: { group: true },
            orderBy: { createdAt: 'desc' },
        })
    },
}