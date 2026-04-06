import { z } from 'zod'

const schema = z.object({
    PORT: z.coerce.number().default(4000),
    JWT_ACCESS_SECRET: z.string(),
    AUTH_SERVICE_URL: z.string().default('http://auth-service:3001'),
    FS_SERVICE_URL: z.string().default('http://fs-service:3002'),
    TASK_SERVICE_URL: z.string().default('http://task-service:3003'),
    RUNNER_SERVICE_URL: z.string().default('http://runner-service:3004'),
    NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
})

const parsed = schema.safeParse(process.env)
if (!parsed.success) {
    console.error('❌ Invalid env:', parsed.error.flatten().fieldErrors)
    process.exit(1)
}

export const config = parsed.data