// Redis Pub/Sub события между сервисами
export type AntiCheatEventType =
    | 'tab_blur'
    | 'window_minimize'
    | 'paste_attempt'
    | 'devtools_open'

export interface AntiCheatEvent {
    sessionId: string
    userId: string
    eventType: AntiCheatEventType
    occurredAt: string
    details?: Record<string, unknown>
}

export interface ExamStatusChangedEvent {
    examId: string
    status: 'active' | 'closed'
    changedAt: string
}