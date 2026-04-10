import { nanoid } from 'nanoid'
import { ExamRepository } from '../repositories/exam.repository.js'
import { SessionRepository } from '../repositories/session.repository.js'
import { TaskRepository } from '../repositories/task.repository.js'
import { config } from '../config.js'
import type { OpenMode } from '@prisma/client'
import { prisma } from '../db.js'

// Создать проект студента через fs-service
async function createStudentProject(
    userId: string,
    taskId: string,
    language: string,
    templateCode: string
): Promise<string> {
    const res = await fetch(`${config.FS_SERVICE_URL}/fs/projects`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'x-user-id': userId,
            'x-user-role': 'student',
        },
        body: JSON.stringify({
            name: `exam-${taskId}`,
            language,
            taskId,
            templateCode,
        }),
    })

    if (!res.ok) throw { statusCode: 500, message: 'Не удалось создать проект' }
    const data = await res.json() as { data: { id: string } }
    return data.data.id
}

// Заморозить проект (readonly) после сдачи
async function freezeProject(userId: string, projectId: string) {
    await fetch(`${config.FS_SERVICE_URL}/fs/projects/${projectId}/readonly`, {
        method: 'PATCH',
        headers: {
            'Content-Type': 'application/json',
            'x-user-id': userId,
            'x-user-role': 'student',
        },
        body: JSON.stringify({ isReadonly: true }),
    })
}

export const ExamService = {
    async createExam(data: {
        taskId?: string
        folderId?: string
        title: string
        openMode: OpenMode
        startsAt?: Date
        endsAt?: Date
        createdBy: string
        groupId: string
    }) {
        if (!data.taskId && !data.folderId) {
            throw { statusCode: 400, message: 'Укажите задание или папку' }
        }

        if (data.taskId) {
            const task = await TaskRepository.findById(data.taskId)
            if (!task) throw { statusCode: 404, message: 'Задание не найдено' }
        }

        if (data.folderId) {
            const count = await prisma.task.count({ where: { folderId: data.folderId } })
            if (!count) throw { statusCode: 400, message: 'Папка пуста' }
        }

        const inviteToken = nanoid(32)
        return ExamRepository.create({ ...data, inviteToken })
    },

    async startSession(examId: string, userId: string) {
        const exam = await ExamRepository.findById(examId)
        if (!exam) throw { statusCode: 404, message: 'Экзамен не найден' }
        if (exam.status !== 'active') throw { statusCode: 403, message: 'Экзамен не активен' }

        const isParticipant = await ExamRepository.isParticipant(examId, userId)
        if (!isParticipant) throw { statusCode: 403, message: 'Вы не зарегистрированы на этот экзамен' }

        const existing = await SessionRepository.findByExamAndUser(examId, userId)
        if (existing) return existing

        // Определяем задание для этого студента
        let taskId: string
        if (exam.taskId) {
            taskId = exam.taskId
        } else if (exam.folderId) {
            const tasks = await prisma.task.findMany({
                where: { folderId: exam.folderId },
                select: { id: true },
            })
            if (!tasks.length) throw { statusCode: 400, message: 'Папка заданий пуста' }
            taskId = tasks[Math.floor(Math.random() * tasks.length)].id
        } else {
            throw { statusCode: 400, message: 'У экзамена нет задания' }
        }

        const task = await TaskRepository.findById(taskId)
        if (!task) throw { statusCode: 404, message: 'Задание не найдено' }

        const projectId = await createStudentProject(userId, task.id, task.language, task.templateCode)

        return SessionRepository.create(examId, userId, projectId, taskId)
    },

    async warn(sessionId: string, userId: string, eventType: string, details?: object) {
        const session = await SessionRepository.findById(sessionId)
        if (!session) throw { statusCode: 404, message: 'Сессия не найдена' }
        if (session.userId !== userId) throw { statusCode: 403, message: 'Нет доступа' }
        if (session.status !== 'in_progress') {
            throw { statusCode: 400, message: 'Сессия уже завершена' }
        }

        // Логируем событие
        await SessionRepository.logAntiCheat(
            sessionId,
            userId,
            eventType as any,
            details
        )

        // Инкрементируем счётчик
        const updated = await SessionRepository.incrementWarning(sessionId)

        // 3 предупреждения — дисквалификация
        if (updated.warningsCount >= 3) {
            await SessionRepository.updateStatus(sessionId, 'disqualified', new Date())
            await freezeProject(userId, session.projectId)
            return { warning: true, count: updated.warningsCount, disqualified: true }
        }

        return {
            warning: true,
            count: updated.warningsCount,
            remaining: 3 - updated.warningsCount,
            disqualified: false,
        }
    },

    async submit(examId: string, userId: string) {
        const session = await SessionRepository.findByExamAndUser(examId, userId)
        if (!session) throw { statusCode: 404, message: 'Сессия не найдена' }
        if (session.status !== 'in_progress') {
            throw { statusCode: 400, message: 'Сессия уже завершена' }
        }

        await SessionRepository.updateStatus(session.id, 'submitted', new Date())
        await freezeProject(userId, session.projectId)

        return { submitted: true, sessionId: session.id }
    },
}