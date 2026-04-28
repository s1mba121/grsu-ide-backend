import { config } from '../config.js'

let geminiKeyIndex = 0

function getGeminiGenerateContentUrl(): string {
    const base = config.GEMINI_BASE_URL.replace(/\/+$/, '')
    const model = encodeURIComponent(config.GEMINI_MODEL)
    return `${base}/models/${model}:generateContent`
}

function previewSnippet(s: string, max = 320): string {
    const t = s.replace(/\s+/g, ' ').trim()
    return t.length <= max ? t : `${t.slice(0, max)}…`
}

function pickGeminiApiKey(): string {
    const keys = config.GEMINI_API_KEYS
    if (!keys.length) {
        const err = new Error('Gemini не настроен: задайте GEMINI_API_KEYS или GEMINI_API_KEY для task-service') as Error & {
            statusCode?: number
        }
        err.statusCode = 503
        throw err
    }
    const key = keys[geminiKeyIndex % keys.length]
    geminiKeyIndex = (geminiKeyIndex + 1) % keys.length
    return key
}

type GeminiPart = { text?: string }
type GeminiContent = { parts?: GeminiPart[] }
type GeminiCandidate = { content?: GeminiContent; finishReason?: string }
type GeminiPayload = {
    error?: { message?: string }
    candidates?: GeminiCandidate[]
    promptFeedback?: { blockReason?: string }
}

function extractGeminiText(data: GeminiPayload): string {
    if (data.error?.message) {
        const err = new Error(`Gemini: ${data.error.message}`) as Error & { statusCode?: number }
        err.statusCode = 502
        throw err
    }
    const blocked = data.promptFeedback?.blockReason
    if (blocked) {
        const err = new Error(`Gemini заблокировал запрос: ${blocked}`) as Error & { statusCode?: number }
        err.statusCode = 502
        throw err
    }
    const parts = data.candidates?.[0]?.content?.parts ?? []
    return parts.map(p => (typeof p.text === 'string' ? p.text : '')).join('').trim()
}

/**
 * Из текста извлекает первый сбалансированный JSON-объект или массив
 * (учитывает строки в двойных кавычках и escape), если модель добавила текст до/после.
 */
function extractFirstBalancedJson(text: string): string {
    const s = text.trim()
    const startObj = s.indexOf('{')
    const startArr = s.indexOf('[')
    let start = -1
    let open: string
    let close: string
    if (startObj === -1 && startArr === -1) {
        const prev = previewSnippet(s, 400)
        throw new SyntaxError(
            prev.length
                ? `В ответе модели нет JSON (нет { или [). Начало ответа: ${prev}`
                : 'В ответе модели нет JSON (нет { или [); ответ пустой',
        )
    }
    if (startArr === -1 || (startObj !== -1 && startObj < startArr)) {
        start = startObj
        open = '{'
        close = '}'
    } else {
        start = startArr
        open = '['
        close = ']'
    }
    let depth = 0
    let inString = false
    let escape = false
    for (let i = start; i < s.length; i++) {
        const c = s[i]
        if (inString) {
            if (escape) {
                escape = false
                continue
            }
            if (c === '\\') {
                escape = true
                continue
            }
            if (c === '"') inString = false
            continue
        }
        if (c === '"') {
            inString = true
            continue
        }
        if (c === open) depth++
        else if (c === close) {
            depth--
            if (depth === 0) return s.slice(start, i + 1)
        }
    }
    throw new SyntaxError('Незакрытый JSON в ответе модели')
}

/** Достаёт JSON из ответа модели (сырой JSON, ```json … ``` или первый сбалансированный объект/массив). */
export function parseJsonFromModelContent(raw: string): unknown {
    const bomStripped = raw.replace(/^\uFEFF/, '').trim()
    let trimmed = bomStripped
    const fence = bomStripped.match(/```(?:json)?\s*([\s\S]*?)```/i)
    if (fence) {
        const inner = fence[1].trim()
        if (inner.length > 0) trimmed = inner
    }
    const tryParse = (text: string): unknown => {
        const t = text.trim()
        try {
            return JSON.parse(t)
        } catch {
            const chunk = extractFirstBalancedJson(t)
            return JSON.parse(chunk)
        }
    }
    try {
        return tryParse(trimmed)
    } catch (e) {
        if (trimmed !== bomStripped) {
            try {
                return tryParse(bomStripped)
            } catch {
                // fall through
            }
        }
        const hint = previewSnippet(bomStripped, 400)
        const base = e instanceof Error ? e.message : String(e)
        throw new SyntaxError(hint.length ? `${base} (ответ: ${hint})` : base)
    }
}

export type ChatCompletionOptions = {
    jsonObject?: boolean
    maxTokens?: number
}

export async function chatCompletion(system: string, user: string, options?: ChatCompletionOptions): Promise<string> {
    const generationConfig: Record<string, unknown> = {
        temperature: 0.35,
        maxOutputTokens: options?.maxTokens ?? 4096,
    }
    if (options?.jsonObject) {
        generationConfig.responseMimeType = 'application/json'
    }
    const body = {
        systemInstruction: { role: 'system', parts: [{ text: system }] },
        contents: [{ role: 'user', parts: [{ text: user }] }],
        generationConfig,
    }
    const res = await fetch(getGeminiGenerateContentUrl(), {
        method: 'POST',
        headers: {
            'x-goog-api-key': pickGeminiApiKey(),
            'Content-Type': 'application/json',
        },
        body: JSON.stringify(body),
    })
    if (!res.ok) {
        const t = await res.text()
        const err = new Error(`Gemini HTTP ${res.status}: ${t.slice(0, 600)}`) as Error & { statusCode?: number }
        err.statusCode = 502
        throw err
    }
    const data = (await res.json()) as GeminiPayload
    const content = extractGeminiText(data)
    if (!content) {
        const err = new Error('Пустой ответ от Gemini (нет текста в candidates[0].content.parts)') as Error & {
            statusCode?: number
        }
        err.statusCode = 502
        throw err
    }
    return content
}
