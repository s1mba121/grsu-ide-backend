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
                task: { select: { timeLimitMin: true, language: true } },
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

    async findByExamAndSessionId(examId: string, sessionId: string) {
        return prisma.examSession.findFirst({
            where: { examId, id: sessionId },
            include: {
                submission: true,
                task: { select: { timeLimitMin: true, language: true } },
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

    async updateSubmission(sessionId: string, data: {
        score: number
        maxScore: number
        status: SubmissionStatus
        resultsJson: object
    }) {
        return prisma.submission.update({
            where: { sessionId },
            data,
        })
    },

    async findSubmission(sessionId: string) {
        return prisma.submission.findUnique({ where: { sessionId } })
    },

    async findAllByExam(examId: string) {
        const [sessions, participants] = await Promise.all([
            prisma.examSession.findMany({
                where: { examId },
                include: {
                    submission: true,
                    antiCheatLogs: { orderBy: { occurredAt: 'asc' } },
                },
                orderBy: { startedAt: 'asc' },
            }),
            prisma.examParticipant.findMany({
                where: { examId },
                select: { userId: true, fullName: true, email: true },
            }),
        ])

        const participantMap = new Map(participants.map(p => [p.userId, p]))

        return sessions.map(s => ({
            ...s,
            fullName: participantMap.get(s.userId)?.fullName ?? s.userId,
            email: participantMap.get(s.userId)?.email ?? '',
        }))
    },
}