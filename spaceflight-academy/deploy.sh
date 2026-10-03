#!/bin/sh
set -eu
export COMPOSE_BAKE=false
export SPACEFLIGHT_PORT="${SPACEFLIGHT_PORT:-8119}"
echo "Building Spaceflight Academy v3.0.2 (3D) on port ${SPACEFLIGHT_PORT}..."
docker compose up -d --build --remove-orphans
echo "Waiting for the production health check..."
attempt=1
while [ "$attempt" -le 30 ]; do
  if result=$(curl -fsS "http://127.0.0.1:${SPACEFLIGHT_PORT}/healthz" 2>/dev/null); then
    if [ "$result" = "spaceflight-academy-ok" ]; then
      echo "PASS - Spaceflight Academy is healthy: ${result}"
      exit 0
    fi
  fi
  attempt=$((attempt + 1)); sleep 2
done
echo "FAIL - Spaceflight Academy did not become healthy in 60 seconds."
docker compose ps
docker compose logs --tail 120
exit 1
