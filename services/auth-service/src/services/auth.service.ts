import bcrypt from 'bcryptjs'
import { UserRepository } from '../repositories/user.repository.js'
import { TokenRepository } from '../repositories/token.repository.js'
import { config } from '../config.js'
import type { FastifyInstance } from 'fastify'

export function createAuthService(app: FastifyInstance) {
    return {
        async register(email: string, fullName: string, password: string) {
            const existing = await UserRepository.findByEmail(email)
            if (existing) {
                throw { statusCode: 409, message: 'Email уже зарегистрирован' }
            }

            const passwordHash = await bcrypt.hash(password, config.BCRYPT_ROUNDS)
            const user = await UserRepository.create({ email, fullName, passwordHash })

            return this.generateTokens(user)
        },

        async login(email: string, password: string) {
            const user = await UserRepository.findByEmail(email)
            if (!user) {
                throw { statusCode: 401, message: 'Неверный email или пароль' }
            }

            const valid = await bcrypt.compare(password, user.passwordHash)
            if (!valid) {
                throw { statusCode: 401, message: 'Неверный email или пароль' }
            }

            return this.generateTokens(user)
        },

        async refresh(refreshToken: string) {
            // Проверяем подпись
            let payload: { sub: string }
            try {
                payload = app.jwt.verify<{ sub: string }>(
                    refreshToken,
                    { key: config.JWT_REFRESH_SECRET } as any
                )
            } catch {
                throw { statusCode: 401, message: 'Невалидный refresh token' }
            }

            // Проверяем что токен есть в БД (и удаляем — rotation)
            const record = await TokenRepository.findAndDelete(refreshToken)
            if (!record) {
                // Возможная атака — инвалидируем все токены пользователя
                await TokenRepository.deleteAllForUser(payload.sub)
                throw { statusCode: 401, message: 'Refresh token уже использован' }
            }

            if (record.expiresAt < new Date()) {
                throw { statusCode: 401, message: 'Refresh token истёк' }
            }

            const user = await UserRepository.findById(record.userId)
            if (!user) {
                throw { statusCode: 401, message: 'Пользователь не найден' }
            }

            return this.generateTokens(user)
        },

        async logout(refreshToken: string) {
            await TokenRepository.findAndDelete(refreshToken)
        },

        async generateTokens(user: { id: string; email: string; role: string }) {
            const payload = { sub: user.id, email: user.email, role: user.role }

            const accessToken = app.jwt.sign(payload, {
                expiresIn: config.JWT_ACCESS_EXPIRES,
            })

            // Refresh подписываем другим секретом
            const refreshToken = app.jwt.sign(payload, {
                key: config.JWT_REFRESH_SECRET,
                expiresIn: config.JWT_REFRESH_EXPIRES,
            } as any)

            const expiresAt = new Date()
            expiresAt.setDate(expiresAt.getDate() + 7)
            await TokenRepository.save(user.id, refreshToken, expiresAt)

            return { accessToken, refreshToken }
        },
    }
}