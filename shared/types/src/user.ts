export type UserRole = 'student' | 'teacher' | 'admin'

export interface User {
    id: string
    email: string
    fullName: string
    role: UserRole
    groupId: string | null
    createdAt: string
}

export interface Group {
    id: string
    name: string
    createdAt: string
}

export interface RegisterDto {
    email: string
    fullName: string
    password: string
}

export interface LoginDto {
    email: string
    password: string
}

export interface AuthTokens {
    accessToken: string
    refreshToken: string
}