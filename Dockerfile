FROM node:20-alpine

WORKDIR /app

RUN apk add --no-cache wget

COPY package.json package-lock.json ./
RUN npm ci --only=production

COPY . .

RUN addgroup -g 1001 nodeuser && \
    adduser -D -u 1001 -G nodeuser nodeuser && \
    chown -R nodeuser:nodeuser /app

USER nodeuser

EXPOSE 5000

HEALTHCHECK --interval=30s --timeout=5s --start-period=40s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://localhost:5000/api/store/health || exit 1

CMD ["node", "backend/src/server.js"]
