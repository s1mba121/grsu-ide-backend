import { prisma } from '../db.js'
import type { Language } from '@prisma/client'

export const ProjectRepository = {
    async create(data: {
        userId: string
        name: string
        language: Language
        taskId?: string
    }) {
        return prisma.project.create({ data })
    },

    async findById(id: string) {
        return prisma.project.findUnique({ where: { id } })
    },

    async findByUser(userId: string) {
        return prisma.project.findMany({
            where: { userId },
            orderBy: { createdAt: 'desc' },
        })
    },

    async findByUserAndTask(userId: string, taskId: string) {
        return prisma.project.findFirst({
            where: { userId, taskId },
        })
    },

    async setReadonly(id: string, isReadonly: boolean) {
        return prisma.project.update({
            where: { id },
            data: { isReadonly },
        })
    },

    async delete(id: string) {
        return prisma.project.delete({ where: { id } })
    },
}