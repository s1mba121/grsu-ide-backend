FROM node:20-alpine AS builder
WORKDIR /app
COPY package*.json ./
COPY shared/types ./shared/types
COPY services/gateway/package*.json ./services/gateway/
RUN npm install --workspace=services/gateway
COPY services/gateway ./services/gateway

FROM node:20-alpine
RUN npm install -g pino-pretty
WORKDIR /app
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/shared ./shared
COPY --from=builder /app/services/gateway ./services/gateway
WORKDIR /app/services/gateway
EXPOSE 4000
CMD ["npx", "tsx", "src/index.ts"]