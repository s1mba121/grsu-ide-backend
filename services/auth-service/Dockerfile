# services/auth-service/Dockerfile
FROM node:20-alpine

# Установка OpenSSL
RUN apk add --no-cache openssl

# Создание символических ссылок для совместимости
RUN ln -sf /usr/lib/libssl.so.3 /usr/lib/libssl.so.1.1 && \
    ln -sf /usr/lib/libcrypto.so.3 /usr/lib/libcrypto.so.1.1

WORKDIR /app

# Копируем только необходимые файлы для установки зависимостей
COPY package*.json ./
COPY shared/types ./shared/types
COPY services/auth-service/package*.json ./services/auth-service/

# Установка зависимостей
RUN npm install

# Копируем исходный код сервиса
COPY services/auth-service ./services/auth-service

WORKDIR /app/services/auth-service

# Генерация Prisma Client
RUN npx prisma generate

EXPOSE 3001

CMD ["npx", "tsx", "src/index.ts"]