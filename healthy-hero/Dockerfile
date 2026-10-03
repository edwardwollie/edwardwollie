FROM node:22-alpine
RUN apk add --no-cache tini
WORKDIR /app
COPY --chown=node:node . .
USER node
ENV NODE_ENV=production PORT=3000
EXPOSE 3000
HEALTHCHECK --interval=20s --timeout=5s --start-period=10s --retries=3 CMD wget -qO- http://127.0.0.1:3000/healthz | grep -q healthy-hero-ok || exit 1
ENTRYPOINT ["/sbin/tini", "--"]
CMD ["node", "server.mjs"]
