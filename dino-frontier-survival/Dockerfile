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
COPY --from=builder /game/dist ./dist
COPY --from=builder /game/node_modules ./node_modules
COPY --from=builder /game/package.json ./package.json
EXPOSE 3000
ENTRYPOINT ["/sbin/tini", "--"]
CMD ["npm", "run", "start", "--", "--hostname", "0.0.0.0", "--port", "3000"]
