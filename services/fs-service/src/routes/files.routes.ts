import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { ProjectRepository } from '../repositories/project.repository.js'
import { StorageService } from '../services/storage.service.js'
import { getUserFromHeaders } from '../middlewares/auth.middleware.js'

// Проверка доступа к проекту
async function checkAccess(
    userId: string,
    role: string,
    projectId: string,
    requireWritable = false
) {
    const project = await ProjectRepository.findById(projectId)
    if (!project) throw { statusCode: 404, message: 'Проект не найден' }

    // Преподаватель/admin видит всё
    if (role === 'teacher' || role === 'admin') return project

    // Студент только свой проект
    if (project.userId !== userId) {
        throw { statusCode: 403, message: 'Нет доступа' }
    }

    // Проверка readonly (файлы заморожены после сдачи)
    if (requireWritable && project.isReadonly) {
        throw { statusCode: 403, message: 'Проект доступен только для чтения' }
    }

    return project
}

export async function filesRoutes(app: FastifyInstance) {
    // GET /fs/:projectId/tree
    app.get('/:projectId/tree', async (req, reply) => {
        try {
            const user = getUserFromHeaders(req)
            const { projectId } = req.params as { projectId: string }
            const project = await checkAccess(user.id, user.role, projectId)
            const tree = await StorageService.getTree(project.userId, projectId)
            return reply.send({ ok: true, data: tree })
        } catch (err: any) {
            return reply.status(err.statusCode ?? 500).send({ ok: false, error: err.message })
        }
    })

    // GET /fs/:projectId/file?path=src/main.py
    app.get('/:projectId/file', async (req, reply) => {
        try {
            const user = getUserFromHeaders(req)
            const { projectId } = req.params as { projectId: string }
            const { path } = req.query as { path: string }

            if (!path) return reply.status(400).send({ ok: false, error: 'path обязателен' })

            const project = await checkAccess(user.id, user.role, projectId)
            const content = await StorageService.readFile(project.userId, projectId, path)
            return reply.send({ ok: true, data: { path, content } })
        } catch (err: any) {
            return reply.status(err.statusCode ?? 500).send({ ok: false, error: err.message })
        }
    })

    // PUT /fs/:projectId/file — сохранить
    app.put('/:projectId/file', async (req, reply) => {
        try {
            const user = getUserFromHeaders(req)
            const { projectId } = req.params as { projectId: string }

            const schema = z.object({
                path: z.string().min(1),
                content: z.string(),
            })
            const result = schema.safeParse(req.body)
            if (!result.success) {
                return reply.status(400).send({ ok: false, error: result.error.errors[0].message })
            }

            const project = await checkAccess(user.id, user.role, projectId, true)
            await StorageService.writeFile(project.userId, projectId, result.data.path, result.data.content)
            return reply.send({ ok: true, data: null })
        } catch (err: any) {
            return reply.status(err.statusCode ?? 500).send({ ok: false, error: err.message })
        }
    })

    // POST /fs/:projectId/file — создать файл или папку
    app.post('/:projectId/file', async (req, reply) => {
        try {
            const user = getUserFromHeaders(req)
            const { projectId } = req.params as { projectId: string }

            const schema = z.object({
                path: z.string().min(1),
                type: z.enum(['file', 'dir']),
            })
            const result = schema.safeParse(req.body)
            if (!result.success) {
                return reply.status(400).send({ ok: false, error: result.error.errors[0].message })
            }

            const project = await checkAccess(user.id, user.role, projectId, true)
            await StorageService.create(project.userId, projectId, result.data.path, result.data.type)
            return reply.status(201).send({ ok: true, data: null })
        } catch (err: any) {
            return reply.status(err.statusCode ?? 500).send({ ok: false, error: err.message })
        }
    })

    // DELETE /fs/:projectId/file?path=...
    app.delete('/:projectId/file', async (req, reply) => {
        try {
            const user = getUserFromHeaders(req)
            const { projectId } = req.params as { projectId: string }
            const { path } = req.query as { path: string }

            if (!path) return reply.status(400).send({ ok: false, error: 'path обязателен' })

            const project = await checkAccess(user.id, user.role, projectId, true)
            await StorageService.delete(project.userId, projectId, path)
            return reply.send({ ok: true, data: null })
        } catch (err: any) {
            return reply.status(err.statusCode ?? 500).send({ ok: false, error: err.message })
        }
    })

    // PATCH /fs/:projectId/rename
    app.patch('/:projectId/rename', async (req, reply) => {
        try {
            const user = getUserFromHeaders(req)
            const { projectId } = req.params as { projectId: string }

            const schema = z.object({
                oldPath: z.string().min(1),
                newPath: z.string().min(1),
            })
            const result = schema.safeParse(req.body)
            if (!result.success) {
                return reply.status(400).send({ ok: false, error: result.error.errors[0].message })
            }

            const project = await checkAccess(user.id, user.role, projectId, true)
            await StorageService.rename(project.userId, projectId, result.data.oldPath, result.data.newPath)
            return reply.send({ ok: true, data: null })
        } catch (err: any) {
            return reply.status(err.statusCode ?? 500).send({ ok: false, error: err.message })
        }
    })
}