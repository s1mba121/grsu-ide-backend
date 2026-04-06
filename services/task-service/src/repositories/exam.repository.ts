import { prisma } from '../db.js'
import type { OpenMode, ExamStatus } from '@prisma/client'

export const ExamRepository = {
    async create(data: {
        taskId: string
        title: string
        inviteToken: string
        openMode: OpenMode
        startsAt?: Date
        endsAt?: Date
        createdBy: string
    }) {
        return prisma.exam.create({
            data,
            include: { task: true },
        })
    },

    async findById(id: string) {
        return prisma.exam.findUnique({
            where: { id },
            include: {
                task: { include: { testCases: true } },
                participants: true,
                sessions: true,
            },
        })
    },

    async findByToken(token: string) {
        return prisma.exam.findUnique({
            where: { inviteToken: token },
            include: { task: { select: { title: true, description: true, language: true, timeLimitMin: true } } },
        })
    },

    async findByTeacher(createdBy: string) {
        return prisma.exam.findMany({
            where: { createdBy },
            include: {
                task: { select: { title: true } },
                _count: { select: { participants: true, sessions: true } },
            },
            orderBy: { createdAt: 'desc' },
        })
    },

    async updateStatus(id: string, status: ExamStatus, endsAt?: Date) {
        return prisma.exam.update({
            where: { id },
            data: { status, ...(endsAt && { endsAt }) },
        })
    },

    async addParticipant(examId: string, userId: string) {
        return prisma.examParticipant.upsert({
            where: { examId_userId: { examId, userId } },
            create: { examId, userId },
            update: {},
        })
    },

    async isParticipant(examId: string, userId: string) {
        const p = await prisma.examParticipant.findUnique({
            where: { examId_userId: { examId, userId } },
        })
        return !!p
    },
}