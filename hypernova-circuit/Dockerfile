FROM node:22-alpine AS builder

WORKDIR /game
COPY package.json package-lock.json ./
RUN npm ci
COPY . .

# The local validation wrapper uses Bash; Alpine intentionally stays minimal.
RUN ./node_modules/.bin/vinext build

FROM node:22-alpine AS runtime

ENV NODE_ENV=production
ENV PORT=3000
WORKDIR /game

COPY --from=builder /game/dist ./dist
COPY --from=builder /game/node_modules ./node_modules
COPY --from=builder /game/package.json ./package.json

USER node
EXPOSE 3000
HEALTHCHECK --interval=20s --timeout=5s --start-period=15s --retries=4 CMD node -e "fetch('http://127.0.0.1:3000/healthz').then(r=>{if(!r.ok)process.exit(1)}).catch(()=>process.exit(1))"

CMD ["npm", "run", "start", "--", "--hostname", "0.0.0.0", "--port", "3000"]
