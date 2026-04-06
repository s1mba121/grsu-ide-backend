import 'dotenv/config'
import Fastify from 'fastify'
import fastifyJwt from '@fastify/jwt'
import fastifyCors from '@fastify/cors'
import { config } from './config.js'
import { prisma } from './db.js'
import { authRoutes } from './routes/auth.routes.js'
import { usersRoutes } from './routes/users.routes.js'
import { groupsRoutes } from './routes/groups.routes.js'

const app = Fastify({
    logger: {
        level: config.NODE_ENV === 'development' ? 'info' : 'warn',
        transport: config.NODE_ENV === 'development'
            ? { target: 'pino-pretty' }
            : undefined,
    },
})

// Plugins
await app.register(fastifyCors, { origin: true })
await app.register(fastifyJwt, { secret: config.JWT_ACCESS_SECRET })

// Routes
await app.register(authRoutes, { prefix: '/auth' })
await app.register(usersRoutes, { prefix: '/auth' })
await app.register(groupsRoutes, { prefix: '/auth' })

// Health check
app.get('/health', async () => ({ status: 'ok', service: 'auth-service' }))

// Graceful shutdown
const shutdown = async () => {
    await app.close()
    await prisma.$disconnect()
    process.exit(0)
}
process.on('SIGINT', shutdown)
process.on('SIGTERM', shutdown)

// Start
try {
    await app.listen({ port: config.PORT, host: '0.0.0.0' })
    console.log(`✅ auth-service running on port ${config.PORT}`)
} catch (err) {
    app.log.error(err)
    process.exit(1)
}