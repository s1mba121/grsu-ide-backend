import type { FastifyInstance } from 'fastify'
import { startTerminal } from '../services/terminal.service.js'
import { config } from '../config.js'

export async function terminalRoutes(app: FastifyInstance) {
    // WS /terminal/:projectId — интерактивный терминал
    app.get('/terminal/:projectId', { websocket: true }, async (socket, req) => {
        const userId = req.headers['x-user-id'] as string
        const userRole = req.headers['x-user-role'] as string
        const { projectId } = req.params as { projectId: string }

        if (!userId) {
            socket.send(JSON.stringify({ type: 'error', message: 'Требуется авторизация' }))
            socket.close()
            return
        }

        // Получаем язык проекта из fs-service
        try {
            const res = await fetch(`${config.FS_SERVICE_URL}/fs/projects/${projectId}`, {
                headers: { 'x-user-id': userId, 'x-user-role': userRole },
            })

            if (!res.ok) {
                socket.send(JSON.stringify({ type: 'error', message: 'Проект не найден' }))
                socket.close()
                return
            }

            const data = await res.json() as { data: { userId: string; language: string } }
            const { userId: projectUserId, language } = data.data

            startTerminal(socket, projectId, projectUserId, language)
        } catch (err) {
            socket.send(JSON.stringify({ type: 'error', message: 'Ошибка подключения' }))
            socket.close()
        }
    })
}