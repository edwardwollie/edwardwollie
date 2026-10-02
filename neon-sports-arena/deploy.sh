#!/bin/sh
set -eu
export COMPOSE_BAKE="${COMPOSE_BAKE:-false}"
export SPORTS_PORT="${SPORTS_PORT:-8105}"
echo "Building Neon Sports Arena on port ${SPORTS_PORT}..."
docker compose up -d --build
echo "Waiting for the production health check..."
attempt=1
while [ "$attempt" -le 30 ]; do
  if curl -fsS "http://127.0.0.1:${SPORTS_PORT}/healthz" >/dev/null 2>&1; then
    echo "Neon Sports Arena is healthy."
    exit 0
  fi
  attempt=$((attempt + 1))
  sleep 2
done
echo "Neon Sports Arena did not become healthy in 60 seconds."
docker compose ps
docker compose logs --tail 120
exit 1
