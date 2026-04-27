import 'dotenv/config'
import { z } from 'zod'

const schema = z.object({
    PORT: z.coerce.number().default(3003),
    DATABASE_URL: z.string(),
    FS_SERVICE_URL: z.string().default('http://fs-service:3002'),
    RUNNER_SERVICE_URL: z.string().default('http://runner-service:3004'),
    AUTH_SERVICE_URL: z.string().default('http://auth-service:3001'),  // ← добавить
    SERVICE_KEY: z.string().default(''),                                // ← добавить
    NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
    /** OpenAI: если пусто — эндпоинты /ai вернут 503 */
    OPENAI_API_KEY: z.string().optional().default(''),
    /** Дешёвая модель по умолчанию (меньше расход токенов) */
    OPENAI_MODEL: z.string().default('gpt-4o-mini'),
})
const parsed = schema.safeParse(process.env)
if (!parsed.success) {
    console.error('❌ Invalid environment variables:')
    console.error(parsed.error.flatten().fieldErrors)
    process.exit(1)
}

export const config = parsed.data