import { Queue, Worker, type Job } from 'bullmq'
import IORedis from 'ioredis'
import { runInDocker, type RunOptions, type RunResult } from './docker.service.js'
import { config } from '../config.js'

const connection = new IORedis(config.REDIS_URL, {
    maxRetriesPerRequest: null, // требуется для BullMQ
})

// Очередь запусков
export const runQueue = new Queue<RunOptions, RunResult>('code-runs', {
    connection,
    defaultJobOptions: {
        removeOnComplete: 100,
        removeOnFail: 50,
        attempts: 1, // не ретраим — код должен упасть если упал
    },
})

// Воркер — обрабатывает задания из очереди
export const runWorker = new Worker<RunOptions, RunResult>(
    'code-runs',
    async (job: Job<RunOptions>) => {
        return runInDocker(job.data)
    },
    {
        connection,
        concurrency: config.MAX_CONCURRENT_RUNS, // максимум N контейнеров одновременно
    }
)

runWorker.on('failed', (job, err) => {
    console.error(`Job ${job?.id} failed:`, err.message)
})

export { connection as redisConnection }