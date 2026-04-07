import 'dotenv/config'
import Fastify from 'fastify'
import fastifyCors from '@fastify/cors'
import fastifyWebSocket from '@fastify/websocket'
import { config } from './config.js'
import { runRoutes } from './routes/run.routes.js'
import { terminalRoutes } from './routes/terminal.routes.js'

const app = Fastify({
    logger: { level: config.NODE_ENV === 'development' ? 'info' : 'warn' }
})

await app.register(fastifyCors, { origin: true })
await app.register(fastifyWebSocket)

await app.register(runRoutes, { prefix: '/runner' })
await app.register(terminalRoutes)

app.get('/health', async () => ({ status: 'ok', service: 'runner-service' }))

const shutdown = async () => {
    await app.close()
    process.exit(0)
}
process.on('SIGINT', shutdown)
process.on('SIGTERM', shutdown)

try {
    await app.listen({ port: config.PORT, host: '0.0.0.0' })
    console.log(`✅ runner-service running on port ${config.PORT}`)
} catch (err) {
    app.log.error(err)
    process.exit(1)
}