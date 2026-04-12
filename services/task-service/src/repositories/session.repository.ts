import { prisma } from '../db.js'
import type { SessionStatus, AntiCheatEvent, SubmissionStatus } from '@prisma/client'

export const SessionRepository = {
    async create(examId: string, userId: string, projectId: string, taskId: string) {
        return prisma.examSession.create({
            data: { examId, userId, projectId, taskId },
        })
    },

    async findByExamAndUser(examId: string, userId: string) {
        return prisma.examSession.findUnique({
            where: { examId_userId: { examId, userId } },
            include: {
                submission: true,
                task: { select: { timeLimitMin: true } },  // ← добавить
            },
        })
    },

    async findById(id: string) {
        return prisma.examSession.findUnique({
            where: { id },
            include: {
                exam: true,           // убираем include task из exam
                submission: true,
            },
        })
    },

    async updateStatus(id: string, status: SessionStatus, finishedAt?: Date) {
        return prisma.examSession.update({
            where: { id },
            data: { status, ...(finishedAt && { finishedAt }) },
        })
    },

    async incrementWarning(id: string) {
        return prisma.examSession.update({
            where: { id },
            data: { warningsCount: { increment: 1 } },
        })
    },

    async logAntiCheat(sessionId: string, userId: string, eventType: AntiCheatEvent, details?: object) {
        return prisma.antiCheatLog.create({
            data: { sessionId, userId, eventType, details },
        })
    },

    async getAntiCheatLogs(sessionId: string) {
        return prisma.antiCheatLog.findMany({
            where: { sessionId },
            orderBy: { occurredAt: 'asc' },
        })
    },

    async createSubmission(data: {
        sessionId: string
        userId: string
        taskId: string
        score: number
        maxScore: number
        status: SubmissionStatus
        resultsJson: object
    }) {
        return prisma.submission.create({ data })
    },

    async findSubmission(sessionId: string) {
        return prisma.submission.findUnique({ where: { sessionId } })
    },

    async findAllByExam(examId: string) {
        return prisma.examSession.findMany({
            where: { examId },
            include: {
                submission: true,
                antiCheatLogs: { orderBy: { occurredAt: 'asc' } },
            },
            orderBy: { startedAt: 'asc' },
        })
    },
}