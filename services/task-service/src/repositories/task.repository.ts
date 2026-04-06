import { prisma } from '../db.js'
import type { Language } from '@prisma/client'

export const TaskRepository = {
    async create(data: {
        title: string
        description: string
        language: Language
        templateCode: string
        timeLimitMin: number
        createdBy: string
    }) {
        return prisma.task.create({ data })
    },

    async findById(id: string) {
        return prisma.task.findUnique({
            where: { id },
            include: { testCases: { orderBy: { orderIndex: 'asc' } } },
        })
    },

    async findByTeacher(createdBy: string) {
        return prisma.task.findMany({
            where: { createdBy },
            include: { _count: { select: { testCases: true, exams: true } } },
            orderBy: { createdAt: 'desc' },
        })
    },

    async update(id: string, data: Partial<{
        title: string
        description: string
        templateCode: string
        timeLimitMin: number
    }>) {
        return prisma.task.update({ where: { id }, data })
    },

    async delete(id: string) {
        return prisma.task.delete({ where: { id } })
    },

    async addTestCase(taskId: string, data: {
        input: string
        expectedOutput: string
        isHidden: boolean
        points: number
        orderIndex: number
    }) {
        return prisma.testCase.create({ data: { taskId, ...data } })
    },

    async updateTestCase(id: string, data: Partial<{
        input: string
        expectedOutput: string
        isHidden: boolean
        points: number
    }>) {
        return prisma.testCase.update({ where: { id }, data })
    },

    async deleteTestCase(id: string) {
        return prisma.testCase.delete({ where: { id } })
    },
}