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

    async updateProfile(id: string, data: { email?: string; fullName?: string }) {
        return prisma.user.update({
            where: { id },
            data,
            include: { group: true },
        })
    },

    async updatePasswordHash(id: string, passwordHash: string) {
        return prisma.user.update({
            where: { id },
            data: { passwordHash },
            include: { group: true },
        })
    },

    async updateRole(id: string, role: Role) {
        return prisma.user.update({
            where: { id },
            data: { role },
        })
    },

    async setBan(id: string, banned: boolean) {
        return prisma.user.update({
            where: { id },
            data: { bannedAt: banned ? new Date() : null },
            include: { group: true },
        })
    },

    async deleteById(id: string) {
        return prisma.user.delete({
            where: { id },
        })
    },

    async findAll() {
        return prisma.user.findMany({
            include: { group: true },
            orderBy: { createdAt: 'desc' },
        })
    },

    async search(params: { q?: string; role?: Role; status?: 'active' | 'banned' | 'all' }) {
        const q = params.q?.trim()
        return prisma.user.findMany({
            where: {
                ...(params.role ? { role: params.role } : {}),
                ...(params.status === 'active' ? { bannedAt: null } : {}),
                ...(params.status === 'banned' ? { NOT: { bannedAt: null } } : {}),
                ...(q ? {
                    OR: [
                        { fullName: { contains: q, mode: 'insensitive' } },
                        { email: { contains: q, mode: 'insensitive' } },
                    ],
                } : {}),
            },
            include: { group: true },
            orderBy: [{ bannedAt: 'desc' }, { createdAt: 'desc' }],
        })
    },
}