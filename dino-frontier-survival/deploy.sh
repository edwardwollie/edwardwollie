#!/bin/sh
set -eu
export DINO_FRONTIER_PORT="${DINO_FRONTIER_PORT:-8101}"
echo "Building Dino Frontier Survival on port ${DINO_FRONTIER_PORT}..."
docker compose up -d --build
echo "Waiting for the production health check..."
attempt=1
while [ "$attempt" -le 30 ]; do
  if curl -fsS "http://127.0.0.1:${DINO_FRONTIER_PORT}/healthz" >/dev/null 2>&1; then
    echo "Dino Frontier Survival is healthy."
    exit 0
  fi
  attempt=$((attempt + 1))
  sleep 2
done
echo "Dino Frontier Survival did not become healthy in 60 seconds."
docker compose ps
docker compose logs --tail 120
exit 1
