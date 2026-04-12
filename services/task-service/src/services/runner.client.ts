import { config } from '../config.js'

export interface TestResult {
    index: number
    passed: boolean
    input: string
    expectedOutput: string
    actualOutput: string
    durationMs: number
    error?: string
}

export interface RunResult {
    output: string
    error?: string
    durationMs: number
    exitCode: number
}

export async function runTests(
    projectId: string,
    userId: string,
    language: string,
    entryFile: string,
    testCases: { input: string; expectedOutput: string }[]
): Promise<TestResult[]> {
    const res = await fetch(`${config.RUNNER_SERVICE_URL}/runner/test`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ projectId, language, entryFile, testCases }),
    })

    if (!res.ok) throw { statusCode: 502, message: 'Runner недоступен' }
    const data = await res.json() as { data: TestResult[] }
    return data.data
}

export async function runCode(
    projectId: string,
    language: string,
    entryFile: string,
    userId: string
): Promise<RunResult> {
    const url = `${config.RUNNER_SERVICE_URL}/runner/run`
    console.log('[runner.client] runCode →', url, { projectId, language, entryFile, userId })

    const res = await fetch(url, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'x-user-id': userId,
            'x-user-role': 'student',
        },
        body: JSON.stringify({ projectId, language, entryFile }),
    })

    console.log('[runner.client] runCode ← status:', res.status)

    if (!res.ok) {
        const text = await res.text()
        console.error('[runner.client] runCode error body:', text)
        throw { statusCode: 502, message: 'Runner недоступен' }
    }

    const data = await res.json() as { data: RunResult }
    return data.data
}