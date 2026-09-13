FROM node:22-alpine

WORKDIR /app

COPY package*.json ./
RUN npm ci --only=production

COPY . .
RUN mkdir -p logs public

EXPOSE 5000

CMD ["node", "backend/src/server.js"]
