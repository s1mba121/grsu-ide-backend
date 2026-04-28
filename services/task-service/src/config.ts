import 'dotenv/config'
import { z } from 'zod'

const schema = z.object({
    PORT: z.coerce.number().default(3003),
    DATABASE_URL: z.string(),
    FS_SERVICE_URL: z.string().default('http://fs-service:3002'),
    RUNNER_SERVICE_URL: z.string().default('http://runner-service:3004'),
    AUTH_SERVICE_URL: z.string().default('http://auth-service:3001'),
    SERVICE_KEY: z.string().default(''),
    NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
    /** Gemini API keys через запятую или перенос строки; будет round-robin */
    GEMINI_API_KEYS: z.string().optional().default(''),
    /** Один ключ (если не используете GEMINI_API_KEYS) */
    GEMINI_API_KEY: z.string().optional().default(''),
    /** Базовый URL Gemini API (native generateContent) */
    GEMINI_BASE_URL: z.string().default('https://generativelanguage.googleapis.com/v1beta'),
    /** Модель Gemini по умолчанию */
    GEMINI_MODEL: z.string().default('gemini-3-flash-preview'),
})
const parsed = schema.safeParse(process.env)
if (!parsed.success) {
    console.error('❌ Invalid environment variables:')
    console.error(parsed.error.flatten().fieldErrors)
    process.exit(1)
}

const keys = `${parsed.data.GEMINI_API_KEYS}\n${parsed.data.GEMINI_API_KEY}`
    .split(/[\n,]/g)
    .map(v => v.trim())
    .filter(Boolean)

export const config = {
    ...parsed.data,
    GEMINI_API_KEYS: keys,
}