FROM nginx:1.27-alpine

LABEL org.opencontainers.image.title="Neon Dominion: Rift Command" \
      org.opencontainers.image.description="Original full 3D futuristic squad action game by Flexzonic Games" \
      org.opencontainers.image.version="3.0.0"

RUN rm /etc/nginx/conf.d/default.conf

COPY nginx.conf /etc/nginx/conf.d/neon-dominion.conf
COPY security-headers.conf /etc/nginx/snippets/security-headers.conf
COPY index.html styles.css manifest.webmanifest sw.js version.json /usr/share/nginx/html/
COPY app /usr/share/nginx/html/app
COPY assets /usr/share/nginx/html/assets
COPY .well-known /usr/share/nginx/html/.well-known

EXPOSE 80

HEALTHCHECK --interval=30s --timeout=4s --start-period=8s --retries=3 \
  CMD wget -qO- http://127.0.0.1/healthz | grep -q neon-dominion-ok || exit 1
