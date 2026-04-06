import { nanoid } from 'nanoid'
import { ExamRepository } from '../repositories/exam.repository.js'
import { SessionRepository } from '../repositories/session.repository.js'
import { TaskRepository } from '../repositories/task.repository.js'
import { config } from '../config.js'
import type { OpenMode } from '@prisma/client'

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
        taskId: string
        title: string
        openMode: OpenMode
        startsAt?: Date
        endsAt?: Date
        createdBy: string
    }) {
        const task = await TaskRepository.findById(data.taskId)
        if (!task) throw { statusCode: 404, message: 'Задание не найдено' }

        const inviteToken = nanoid(32)
        return ExamRepository.create({ ...data, inviteToken })
    },

    async startSession(examId: string, userId: string) {
        const exam = await ExamRepository.findById(examId)
        if (!exam) throw { statusCode: 404, message: 'Экзамен не найден' }

        // Проверяем статус экзамена
        if (exam.status !== 'active') {
            throw { statusCode: 403, message: 'Экзамен не активен' }
        }

        // Проверяем что студент в списке участников
        const isParticipant = await ExamRepository.isParticipant(examId, userId)
        if (!isParticipant) {
            throw { statusCode: 403, message: 'Вы не зарегистрированы на этот экзамен' }
        }

        // Проверяем что сессии ещё нет
        const existing = await SessionRepository.findByExamAndUser(examId, userId)
        if (existing) {
            // Возвращаем существующую сессию (переподключение)
            return existing
        }

        // Создаём проект через fs-service
        const projectId = await createStudentProject(
            userId,
            exam.task.id,
            exam.task.language,
            exam.task.templateCode
        )

        return SessionRepository.create(examId, userId, projectId)
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