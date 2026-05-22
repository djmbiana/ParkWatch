FROM node:20-alpine AS builder

WORKDIR /app

COPY package*.json ./
# Install all deps including devDependencies (nodemon) for docker-compose dev.
# For a production Cloud Run image, swap this to: npm ci --omit=dev
RUN npm ci

FROM node:20-alpine

WORKDIR /app

RUN addgroup -S parkwatch && adduser -S parkwatch -G parkwatch

COPY --from=builder /app/node_modules ./node_modules
COPY . .

RUN mkdir -p uploads && chown -R parkwatch:parkwatch /app

USER parkwatch

# Cloud Run injects PORT=8080 at runtime.
# docker-compose overrides this to 3000 via its environment block.
ENV PORT=8080
EXPOSE 8080

CMD ["node", "server.js"]
