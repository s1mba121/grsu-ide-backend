import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { ProjectRepository } from '../repositories/project.repository.js'
import { StorageService } from '../services/storage.service.js'
import { getUserFromHeaders } from '../middlewares/auth.middleware.js'
import type { Language } from '@prisma/client'

export async function projectsRoutes(app: FastifyInstance) {
    // POST /fs/projects — создать проект
    app.post('/projects', async (req, reply) => {
        const user = getUserFromHeaders(req)

        const schema = z.object({
            name: z.string().min(1).max(255),
            language: z.enum(['python', 'javascript']),
            taskId: z.string().uuid().optional(),
            templateCode: z.string().optional(),
        })

        const result = schema.safeParse(req.body)
        if (!result.success) {
            return reply.status(400).send({ ok: false, error: result.error.errors[0].message })
        }

        const project = await ProjectRepository.create({
            userId: user.id,
            name: result.data.name,
            language: result.data.language as Language,
            taskId: result.data.taskId,
        })

        await StorageService.initProject(
            user.id,
            project.id,
            result.data.language,
            result.data.templateCode
        )

        return reply.status(201).send({ ok: true, data: project })
    })

    // GET /fs/projects — список проектов пользователя
    app.get('/projects', async (req, reply) => {
        const user = getUserFromHeaders(req)
        const projects = await ProjectRepository.findByUser(user.id)
        return reply.send({ ok: true, data: projects })
    })

    // GET /fs/projects/:id — мета-данные проекта
    app.get('/projects/:id', async (req, reply) => {
        const user = getUserFromHeaders(req)
        const { id } = req.params as { id: string }

        const project = await ProjectRepository.findById(id)
        if (!project) {
            return reply.status(404).send({ ok: false, error: 'Проект не найден' })
        }

        // Преподаватель может смотреть любой проект, студент — только свой
        if (user.role === 'student' && project.userId !== user.id) {
            return reply.status(403).send({ ok: false, error: 'Нет доступа' })
        }

        return reply.send({ ok: true, data: project })
    })
}