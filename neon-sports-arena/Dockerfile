FROM node:22-alpine AS builder
WORKDIR /game
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
RUN ./node_modules/.bin/vinext build

FROM node:22-alpine AS runtime
RUN apk add --no-cache tini
WORKDIR /game
ENV NODE_ENV=production WRANGLER_LOG_PATH=/tmp/wrangler.log
COPY --from=builder /game/dist/standalone ./
EXPOSE 3000
ENTRYPOINT ["/sbin/tini", "--"]
CMD ["node", "server.js"]
