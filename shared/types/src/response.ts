export interface ApiSuccess<T> {
    ok: true
    data: T
}

export interface ApiError {
    ok: false
    error: string
    code?: string
}

export type ApiResponse<T> = ApiSuccess<T> | ApiError