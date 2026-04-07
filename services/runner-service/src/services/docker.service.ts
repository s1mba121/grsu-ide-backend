import { spawn } from 'child_process'
import { mkdir, cp, rm } from 'fs/promises'
import { join } from 'path'
import { randomUUID } from 'crypto'
import { config } from '../config.js'

export interface RunOptions {
    projectId: string
    userId: string
    language: 'python' | 'javascript'
    entryFile: string
    stdin?: string
    timeoutMs?: number
}

export interface RunResult {
    stdout: string
    stderr: string
    exitCode: number
    durationMs: number
    timedOut: boolean
}

// Образ Docker для каждого языка
const IMAGES: Record<string, string> = {
    python: 'python:3.12-slim',
    javascript: 'node:20-slim',
}

// Команда запуска внутри контейнера
const COMMANDS: Record<string, (entryFile: string) => string[]> = {
    python: (f) => ['python', `/app/${f}`],
    javascript: (f) => ['node', `/app/${f}`],
}

export async function runInDocker(opts: RunOptions): Promise<RunResult> {
    const {
        projectId,
        userId,
        language,
        entryFile,
        stdin = '',
        timeoutMs = config.CODE_TIMEOUT_MS,
    } = opts

    const runId = randomUUID()
    const tmpDir = `/tmp/grsu-run-${runId}`
    const srcDir = join(config.STORAGE_PATH, 'users', userId, 'projects', projectId)

    const startedAt = Date.now()

    try {
        // Копируем файлы проекта во временную директорию
        await mkdir(tmpDir, { recursive: true })
        await cp(srcDir, tmpDir, { recursive: true })

        const image = IMAGES[language]
        const cmd = COMMANDS[language](entryFile)

        const dockerArgs = [
            'run',
            '--rm',                          // удалить контейнер после завершения
            '--network=none',                // нет доступа к сети
            `--memory=128m`,                 // лимит памяти
            `--memory-swap=128m`,            // swap тоже ограничиваем
            `--cpus=0.5`,                    // лимит CPU
            `--pids-limit=50`,               // нельзя форкать без конца
            `--read-only`,                   // read-only файловая система
            `--tmpfs=/tmp:size=10m`,         // только /tmp доступен для записи
            `-v`, `${tmpDir}:/app:ro`,       // файлы студента только на чтение
            `--user=nobody`,                 // непривилегированный пользователь
            image,
            ...cmd,
        ]

        return await new Promise<RunResult>((resolve) => {
            let stdout = ''
            let stderr = ''
            let timedOut = false

            const proc = spawn('docker', dockerArgs, { stdio: ['pipe', 'pipe', 'pipe'] })

            // Таймер — убиваем контейнер если превысил лимит
            const timer = setTimeout(() => {
                timedOut = true
                proc.kill('SIGKILL')
            }, timeoutMs)

            // Пишем stdin если есть
            if (stdin) {
                proc.stdin.write(stdin)
            }
            proc.stdin.end()

            proc.stdout.on('data', (chunk: Buffer) => {
                stdout += chunk.toString()
                // Защита от бесконечного вывода
                if (stdout.length > 1024 * 512) proc.kill('SIGKILL')
            })

            proc.stderr.on('data', (chunk: Buffer) => {
                stderr += chunk.toString()
            })

            proc.on('close', (exitCode) => {
                clearTimeout(timer)
                const durationMs = Date.now() - startedAt

                resolve({
                    stdout: stdout.trim(),
                    stderr: stderr.trim(),
                    exitCode: exitCode ?? 1,
                    durationMs,
                    timedOut,
                })
            })

            proc.on('error', (err) => {
                clearTimeout(timer)
                resolve({
                    stdout: '',
                    stderr: `Ошибка запуска: ${err.message}`,
                    exitCode: 1,
                    durationMs: Date.now() - startedAt,
                    timedOut: false,
                })
            })
        })
    } finally {
        // Всегда чистим временную директорию
        await rm(tmpDir, { recursive: true, force: true })
    }
}

// Нормализация вывода для сравнения с expected_output
export function normalizeOutput(output: string): string {
    return output
        .trim()
        .split('\n')
        .map(line => line.trimEnd())
        .join('\n')
}