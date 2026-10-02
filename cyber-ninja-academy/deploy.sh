#!/bin/sh
set -eu

export CYBER_NINJA_PORT="${CYBER_NINJA_PORT:-8099}"
echo "Building Cyber Ninja Academy on port ${CYBER_NINJA_PORT}..."
docker compose up -d --build

echo "Waiting for the production health check..."
attempt=1
while [ "$attempt" -le 30 ]; do
  if curl -fsS "http://127.0.0.1:${CYBER_NINJA_PORT}/healthz" >/dev/null 2>&1; then
    echo "Cyber Ninja Academy is healthy."
    echo "Health: http://127.0.0.1:${CYBER_NINJA_PORT}/healthz"
    exit 0
  fi
  attempt=$((attempt + 1))
  sleep 2
done

echo "Cyber Ninja Academy did not become healthy in 60 seconds."
docker compose ps
docker compose logs --tail 120
exit 1
