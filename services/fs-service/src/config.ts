import 'dotenv/config'
import { z } from 'zod'

const schema = z.object({
    PORT: z.coerce.number().default(3002),
    DATABASE_URL: z.string(),
    STORAGE_PATH: z.string().default('/tmp/grsu-storage'),
    NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
})

const parsed = schema.safeParse(process.env)
if (!parsed.success) {
    console.error('❌ Invalid environment variables:')
    console.error(parsed.error.flatten().fieldErrors)
    process.exit(1)
}

export const config = parsed.data