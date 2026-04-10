import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { prisma } from '../db.js'
import { getUser, requireRole } from '../middlewares/auth.middleware.js'

export async function taskFoldersRoutes(app: FastifyInstance) {
    // GET /task-folders — папки учителя
    app.get('/', { preHandler: requireRole(['teacher', 'admin']) }, async (req, reply) => {
        const user = getUser(req)
        const folders = await prisma.taskFolder.findMany({
            where: { createdBy: user.id },
            orderBy: { createdAt: 'asc' },
        })
        return reply.send({ ok: true, data: folders })
    })

    // POST /task-folders — создать папку
    app.post('/', { preHandler: requireRole(['teacher', 'admin']) }, async (req, reply) => {
        try {
            const user = getUser(req)
            const schema = z.object({ name: z.string().min(1).max(100) })
            const result = schema.safeParse(req.body)
            if (!result.success) {
                return reply.status(400).send({ ok: false, error: result.error.errors[0].message })
            }

            const folder = await prisma.taskFolder.create({
                data: { name: result.data.name, createdBy: user.id },
            })
            return reply.status(201).send({ ok: true, data: folder })
        } catch (err: any) {
            return reply.status(err.statusCode ?? 500).send({ ok: false, error: err.message })
        }
    })

    // DELETE /task-folders/:id — удалить папку (задания остаются, folderId → null)
    app.delete('/:id', { preHandler: requireRole(['teacher', 'admin']) }, async (req, reply) => {
        try {
            const user = getUser(req)
            const { id } = req.params as { id: string }

            const folder = await prisma.taskFolder.findUnique({ where: { id } })
            if (!folder) return reply.status(404).send({ ok: false, error: 'Папка не найдена' })
            if (folder.createdBy !== user.id && user.role !== 'admin') {
                return reply.status(403).send({ ok: false, error: 'Нет доступа' })
            }

            // Задания отвязываются автоматически через onDelete: SetNull
            await prisma.taskFolder.delete({ where: { id } })
            return reply.send({ ok: true, data: null })
        } catch (err: any) {
            return reply.status(err.statusCode ?? 500).send({ ok: false, error: err.message })
        }
    })

    // PATCH /task-folders/assign — положить задание в папку (или убрать)
    app.patch('/assign', { preHandler: requireRole(['teacher', 'admin']) }, async (req, reply) => {
        try {
            const schema = z.object({
                taskId: z.string().uuid(),
                folderId: z.string().uuid().nullable(),
            })
            const result = schema.safeParse(req.body)
            if (!result.success) {
                return reply.status(400).send({ ok: false, error: result.error.errors[0].message })
            }

            const task = await prisma.task.update({
                where: { id: result.data.taskId },
                data: { folderId: result.data.folderId },
            })
            return reply.send({ ok: true, data: task })
        } catch (err: any) {
            return reply.status(err.statusCode ?? 500).send({ ok: false, error: err.message })
        }
    })
}