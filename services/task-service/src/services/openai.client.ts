import { config } from '../config.js'

const OPENAI_URL = 'https://api.openai.com/v1/chat/completions'

function previewSnippet(s: string, max = 320): string {
    const t = s.replace(/\s+/g, ' ').trim()
    return t.length <= max ? t : `${t.slice(0, max)}…`
}

/** Текст ответа ассистента: строка или массив фрагментов (новые модели / API). */
function assistantContentToString(content: unknown): string {
    if (typeof content === 'string') return content
    if (content === null || content === undefined) return ''
    if (!Array.isArray(content)) return ''
    const chunks: string[] = []
    for (const part of content) {
        if (typeof part !== 'object' || part === null) continue
        const p = part as { type?: string; text?: string; content?: string }
        if (typeof p.text === 'string' && p.text.length) {
            chunks.push(p.text)
            continue
        }
        if (typeof p.content === 'string' && p.content.length) chunks.push(p.content)
    }
    return chunks.join('')
}

type ChatChoiceMessage = {
    content?: unknown
    refusal?: string | null
}

type ChatCompletionPayload = {
    error?: { message?: string }
    choices?: Array<{
        message?: ChatChoiceMessage
        /** legacy completions */
        text?: string
    }>
}

function extractAssistantText(data: ChatCompletionPayload): string {
    if (data.error?.message) {
        const err = new Error(`OpenAI: ${data.error.message}`) as Error & { statusCode?: number }
        err.statusCode = 502
        throw err
    }
    const choice = data.choices?.[0]
    const refusal = choice?.message?.refusal
    if (typeof refusal === 'string' && refusal.trim()) {
        const err = new Error(`Модель отказалась ответить: ${previewSnippet(refusal, 400)}`) as Error & { statusCode?: number }
        err.statusCode = 502
        throw err
    }
    const fromMessage = assistantContentToString(choice?.message?.content)
    if (fromMessage.trim()) return fromMessage
    const legacy = choice?.text
    if (typeof legacy === 'string' && legacy.trim()) return legacy
    return ''
}

export function assertOpenAiConfigured(): void {
    if (!config.OPENAI_API_KEY?.trim()) {
        const err = new Error('OpenAI не настроен: задайте OPENAI_API_KEY для task-service') as Error & { statusCode?: number }
        err.statusCode = 503
        throw err
    }
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
    // Не подменять весь ответ пустым fenced-блоком (тогда теряется JSON после ```).
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
        throw new SyntaxError(
            hint.length ? `${base} (ответ: ${hint})` : base,
        )
    }
}

export type ChatCompletionOptions = {
    /** Гарантирует синтаксически валидный JSON-объект от API (Chat Completions). */
    jsonObject?: boolean
    /** Лимит токенов ответа (по умолчанию 4096; для больших JSON — больше). */
    maxTokens?: number
}

export async function chatCompletion(system: string, user: string, options?: ChatCompletionOptions): Promise<string> {
    assertOpenAiConfigured()
    const body: Record<string, unknown> = {
        model: config.OPENAI_MODEL,
        messages: [
            { role: 'system', content: system },
            { role: 'user', content: user },
        ],
        temperature: 0.35,
        max_tokens: options?.maxTokens ?? 4096,
    }
    if (options?.jsonObject) {
        body.response_format = { type: 'json_object' }
    }
    const res = await fetch(OPENAI_URL, {
        method: 'POST',
        headers: {
            Authorization: `Bearer ${config.OPENAI_API_KEY}`,
            'Content-Type': 'application/json',
        },
        body: JSON.stringify(body),
    })
    if (!res.ok) {
        const t = await res.text()
        const err = new Error(`OpenAI HTTP ${res.status}: ${t.slice(0, 400)}`) as Error & { statusCode?: number }
        err.statusCode = 502
        throw err
    }
    const data = (await res.json()) as ChatCompletionPayload
    const content = extractAssistantText(data).trim()
    if (!content) {
        const err = new Error('Пустой ответ от OpenAI (нет текста в choices[0].message)') as Error & {
            statusCode?: number
        }
        err.statusCode = 502
        throw err
    }
    return content
}
