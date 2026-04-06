import 'dotenv/config'
import Fastify from 'fastify'
import fastifyCors from '@fastify/cors'
import { config } from './config.js'
import { prisma } from './db.js'
import { projectsRoutes } from './routes/projects.routes.js'
import { filesRoutes } from './routes/files.routes.js'
import { mkdir } from 'fs/promises'

const app = Fastify({
    logger: { level: config.NODE_ENV === 'development' ? 'info' : 'warn' }
})

await app.register(fastifyCors, { origin: true })

// Роуты
await app.register(projectsRoutes, { prefix: '/fs' })
await app.register(filesRoutes, { prefix: '/fs' })

app.get('/health', async () => ({ status: 'ok', service: 'fs-service' }))

// Создаём корневую папку хранилища если не существует
await mkdir(config.STORAGE_PATH, { recursive: true })

const shutdown = async () => {
    await app.close()
    await prisma.$disconnect()
    process.exit(0)
}
process.on('SIGINT', shutdown)
process.on('SIGTERM', shutdown)

try {
    await app.listen({ port: config.PORT, host: '0.0.0.0' })
    console.log(`✅ fs-service running on port ${config.PORT}`)
} catch (err) {
    app.log.error(err)
    process.exit(1)
}