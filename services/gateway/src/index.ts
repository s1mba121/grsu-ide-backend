import 'dotenv/config'
import Fastify from 'fastify'
import fastifyJwt from '@fastify/jwt'
import fastifyCors from '@fastify/cors'
import httpProxy from '@fastify/http-proxy'
import { config } from './config.js'

const app = Fastify({
    logger: {
        level: 'info',
        transport: config.NODE_ENV === 'development' ? { target: 'pino-pretty' } : undefined,
    },
})

await app.register(fastifyCors, { origin: true })
await app.register(fastifyJwt, { secret: config.JWT_ACCESS_SECRET })

// Публичные маршруты — без JWT (auth сам разберётся)
const PUBLIC_PATHS = [
    '/api/auth/groups', // список групп может быть публичным
    '/api/auth/register',
    '/api/auth/login',
    '/api/auth/refresh',
    '/api/exams/join/', // инвайт-ссылки публичные
]

// Хук — проверяем JWT для всех НЕ публичных маршрутов
app.addHook('onRequest', async (req, reply) => {
    const isPublic = PUBLIC_PATHS.some(p => req.url.startsWith(p))
    if (isPublic) return

    // /health не трогаем
    if (req.url === '/health') return

    try {
        await req.jwtVerify()

        // Добавляем заголовки для downstream сервисов
        const payload = req.user as { sub: string; email: string; role: string; fullName: string; groupId?: string }
        req.headers['x-user-id'] = payload.sub
        req.headers['x-user-email'] = payload.email
        req.headers['x-user-role'] = payload.role
        req.headers['x-user-fullname'] = payload.fullName
        req.headers['x-user-groupid'] = payload.groupId ?? ''
    } catch {
        return reply.status(401).send({ ok: false, error: 'Требуется авторизация' })
    }
})

// Проксирование по префиксам
await app.register(httpProxy, {
    upstream: config.AUTH_SERVICE_URL,
    prefix: '/api/auth',
    rewritePrefix: '/auth',
})

await app.register(httpProxy, {
    upstream: config.FS_SERVICE_URL,
    prefix: '/api/fs',
    rewritePrefix: '/fs',
})

await app.register(httpProxy, {
    upstream: config.TASK_SERVICE_URL,
    prefix: '/api/tasks',
    rewritePrefix: '/tasks',
})

await app.register(httpProxy, {
    upstream: config.TASK_SERVICE_URL,
    prefix: '/api/exams',
    rewritePrefix: '/exams',
})

await app.register(httpProxy, {
    upstream: config.TASK_SERVICE_URL,
    prefix: '/api/sessions',
    rewritePrefix: '/sessions',
})

await app.register(httpProxy, {
    upstream: config.RUNNER_SERVICE_URL,
    prefix: '/api/runner',
    rewritePrefix: '/runner',
})

await app.register(httpProxy, {
    upstream: config.TASK_SERVICE_URL,
    prefix: '/api/task-folders',
    rewritePrefix: '/task-folders',
})

app.get('/health', async () => ({ status: 'ok', service: 'gateway' }))

try {
    await app.listen({ port: config.PORT, host: '0.0.0.0' })
    console.log(`✅ gateway running on port ${config.PORT}`)
} catch (err) {
    app.log.error(err)
    process.exit(1)
}