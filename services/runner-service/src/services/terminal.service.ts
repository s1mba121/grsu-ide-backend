import { spawn, type ChildProcessWithoutNullStreams } from 'child_process'
import { join } from 'path'
import { config } from '../config.js'
import type { WebSocket } from '@fastify/websocket'

interface TerminalSession {
    proc: ChildProcessWithoutNullStreams
    projectId: string
    userId: string
}

// Хранилище активных терминальных сессий
const sessions = new Map<string, TerminalSession>()

export function startTerminal(
    ws: WebSocket,
    projectId: string,
    userId: string,
    language: string
) {
    const srcDir = join(config.STORAGE_PATH, 'users', userId, 'projects', projectId)

    // Запускаем bash внутри Docker-контейнера интерактивно
    const image = language === 'python' ? 'python:3.12-slim' : 'node:20-slim'

    const proc = spawn('docker', [
        'run',
        '--rm',
        '-i',                          // интерактивный режим
        '--network=none',
        '--memory=128m',
        '--memory-swap=128m',
        '--cpus=0.5',
        '--pids-limit=50',
        `-v`, `${srcDir}:/app`,
        '--workdir=/app',
        '--user=nobody',
        image,
        '/bin/sh',                     // sh вместо bash (slim образы)
    ])

    const sessionId = `${userId}:${projectId}`
    sessions.set(sessionId, { proc, projectId, userId })

    // Docker stdout → WebSocket (в браузер xterm.js)
    proc.stdout.on('data', (data: Buffer) => {
        if (ws.readyState === ws.OPEN) {
            ws.send(JSON.stringify({ type: 'output', data: data.toString() }))
        }
    })

    proc.stderr.on('data', (data: Buffer) => {
        if (ws.readyState === ws.OPEN) {
            ws.send(JSON.stringify({ type: 'output', data: data.toString() }))
        }
    })

    proc.on('close', (code) => {
        sessions.delete(sessionId)
        if (ws.readyState === ws.OPEN) {
            ws.send(JSON.stringify({ type: 'exit', code }))
            ws.close()
        }
    })

    proc.on('error', (err) => {
        if (ws.readyState === ws.OPEN) {
            ws.send(JSON.stringify({ type: 'error', message: err.message }))
            ws.close()
        }
    })

    // WebSocket → Docker stdin (ввод пользователя)
    ws.on('message', (raw: Buffer) => {
        try {
            const msg = JSON.parse(raw.toString())
            if (msg.type === 'input' && proc.stdin.writable) {
                proc.stdin.write(msg.data)
            }
            // Resize терминала
            if (msg.type === 'resize') {
                // Docker не поддерживает resize напрямую через spawn,
                // но xterm.js всё равно будет работать корректно
            }
        } catch {
            // игнорируем невалидный JSON
        }
    })

    ws.on('close', () => {
        proc.kill('SIGTERM')
        sessions.delete(sessionId)
    })

    // Приветственное сообщение
    ws.send(JSON.stringify({
        type: 'output',
        data: `\r\n\x1b[32m✓ Терминал подключён (${language})\x1b[0m\r\n$ `,
    }))
}

export function killTerminal(userId: string, projectId: string) {
    const sessionId = `${userId}:${projectId}`
    const session = sessions.get(sessionId)
    if (session) {
        session.proc.kill('SIGTERM')
        sessions.delete(sessionId)
    }
}