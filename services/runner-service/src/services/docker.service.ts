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

    // Путь к файлам проекта — монтируем напрямую, без копирования
    const srcDir = join(config.STORAGE_PATH, 'users', userId, 'projects', projectId)
    const hostSrcDir = join(config.HOST_STORAGE_PATH, 'users', userId, 'projects', projectId)

    const startedAt = Date.now()

    const image = IMAGES[language]
    const cmd = COMMANDS[language](entryFile)

    const dockerArgs = [
        'run',
        '--rm',
        '--network=none',
        '--memory=128m',
        '--memory-swap=128m',
        '--cpus=0.5',
        '--pids-limit=50',
        '--read-only',
        '--tmpfs=/tmp:size=10m',
        `-v`, `${hostSrcDir}:/app:ro`,  // ← hostSrcDir вместо tmpDir
        '--user=nobody',
        image,
        ...cmd,
    ]

    return await new Promise<RunResult>((resolve) => {
        let stdout = ''
        let stderr = ''
        let timedOut = false

        const proc = spawn('docker', dockerArgs, { stdio: ['pipe', 'pipe', 'pipe'] })

        const timer = setTimeout(() => {
            timedOut = true
            proc.kill('SIGKILL')
        }, timeoutMs)

        if (stdin) {
            proc.stdin.write(stdin)
        }
        proc.stdin.end()

        proc.stdout.on('data', (chunk: Buffer) => {
            stdout += chunk.toString()
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
}

// Нормализация вывода для сравнения с expected_output
export function normalizeOutput(output: string): string {
    return output
        .trim()
        .split('\n')
        .map(line => line.trimEnd())
        .join('\n')
}