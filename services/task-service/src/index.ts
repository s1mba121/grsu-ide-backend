import 'dotenv/config'
import Fastify from 'fastify'
import fastifyCors from '@fastify/cors'
import { config } from './config.js'
import { prisma } from './db.js'
import { tasksRoutes } from './routes/tasks.routes.js'
import { examsRoutes } from './routes/exams.routes.js'
import { sessionsRoutes } from './routes/sessions.routes.js'
import { taskFoldersRoutes } from './routes/task-folders.routes.js'

const app = Fastify({
    logger: { level: config.NODE_ENV === 'development' ? 'info' : 'warn' }
})

await app.register(fastifyCors, { origin: true })

await app.register(tasksRoutes, { prefix: '/tasks' })
await app.register(examsRoutes, { prefix: '/exams' })
await app.register(sessionsRoutes, { prefix: '/sessions' })
await app.register(taskFoldersRoutes, { prefix: '/task-folders' })

app.get('/health', async () => ({ status: 'ok', service: 'task-service' }))

const shutdown = async () => {
    await app.close()
    await prisma.$disconnect()
    process.exit(0)
}
process.on('SIGINT', shutdown)
process.on('SIGTERM', shutdown)

try {
    await app.listen({ port: config.PORT, host: '0.0.0.0' })
    console.log(`✅ task-service running on port ${config.PORT}`)
} catch (err) {
    app.log.error(err)
    process.exit(1)
}