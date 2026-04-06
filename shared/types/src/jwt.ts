export interface JwtPayload {
    sub: string        // user id
    email: string
    role: UserRole
    iat: number
    exp: number
}

import type { UserRole } from './user'

// Заголовки которые Gateway добавляет после верификации JWT
export interface GatewayHeaders {
    'x-user-id': string
    'x-user-role': UserRole
    'x-user-email': string
}