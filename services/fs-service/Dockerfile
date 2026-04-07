FROM node:20-alpine AS builder
RUN apk add --no-cache openssl && \
    ln -s /usr/lib/libssl.so.3 /usr/lib/libssl.so.1.1 && \
    ln -s /usr/lib/libcrypto.so.3 /usr/lib/libcrypto.so.1.1
WORKDIR /app
COPY package*.json ./
COPY shared/types ./shared/types
COPY services/fs-service/package*.json ./services/fs-service/
RUN npm install --workspace=services/fs-service
COPY services/fs-service ./services/fs-service
WORKDIR /app/services/fs-service
RUN npx prisma generate

FROM node:20-alpine
RUN apk add --no-cache openssl && \
    ln -s /usr/lib/libssl.so.3 /usr/lib/libssl.so.1.1 && \
    ln -s /usr/lib/libcrypto.so.3 /usr/lib/libcrypto.so.1.1

WORKDIR /app

# Копируем node_modules из корня (там лежит .prisma)
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/shared ./shared
COPY --from=builder /app/services/fs-service ./services/fs-service

WORKDIR /app/services/fs-service
EXPOSE 3002
CMD ["npx", "tsx", "src/index.ts"]