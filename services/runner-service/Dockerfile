# services/runner-service/Dockerfile
FROM node:20-alpine AS builder

# Устанавливаем openssl и создаем символические ссылки
RUN apk add --no-cache openssl && \
    ln -s /usr/lib/libssl.so.3 /usr/lib/libssl.so.1.1 && \
    ln -s /usr/lib/libcrypto.so.3 /usr/lib/libcrypto.so.1.1

RUN apk add --no-cache docker-cli

WORKDIR /app
COPY package*.json ./
COPY shared/types ./shared/types
COPY services/runner-service/package*.json ./services/runner-service/
RUN npm install --workspace=services/runner-service
COPY services/runner-service ./services/runner-service
WORKDIR /app/services/runner-service

FROM node:20-alpine

RUN apk add --no-cache openssl && \
    ln -s /usr/lib/libssl.so.3 /usr/lib/libssl.so.1.1 && \
    ln -s /usr/lib/libcrypto.so.3 /usr/lib/libcrypto.so.1.1

RUN apk add --no-cache docker-cli

WORKDIR /app
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/shared ./shared
COPY --from=builder /app/services/runner-service ./services/runner-service
WORKDIR /app/services/runner-service
EXPOSE 3004
CMD ["npx", "tsx", "src/index.ts"]