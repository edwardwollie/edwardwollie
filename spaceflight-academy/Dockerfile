FROM node:22-alpine AS builder
WORKDIR /game
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
RUN npm run build

FROM node:22-alpine AS runtime
RUN apk add --no-cache tini
WORKDIR /game
ENV NODE_ENV=production PORT=3000
COPY --from=builder /game/dist ./dist
COPY --from=builder /game/server.mjs ./server.mjs
EXPOSE 3000
ENTRYPOINT ["/sbin/tini", "--"]
CMD ["node", "server.mjs"]
