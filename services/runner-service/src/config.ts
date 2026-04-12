import 'dotenv/config'
import { z } from 'zod'

const schema = z.object({
    PORT: z.coerce.number().default(3004),
    REDIS_URL: z.string().default('redis://localhost:6379'),
    FS_SERVICE_URL: z.string().default('http://fs-service:3002'),
    STORAGE_PATH: z.string().default('/tmp/grsu-storage'),
    HOST_STORAGE_PATH: z.string().default('/var/lib/docker/volumes/grsu-ide-backend_fs_storage/_data'),
    CODE_TIMEOUT_MS: z.coerce.number().default(15000),
    MAX_CONCURRENT_RUNS: z.coerce.number().default(5),
    NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
})

const parsed = schema.safeParse(process.env)
if (!parsed.success) {
    console.error('❌ Invalid environment variables:')
    console.error(parsed.error.flatten().fieldErrors)
    process.exit(1)
}

export const config = parsed.data