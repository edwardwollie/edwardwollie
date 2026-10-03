#!/bin/sh
set -eu
PORT="${WILDFRONT_PORT:-8096}"
echo "Building Wildfront Horizon on port $PORT..."
WILDFRONT_PORT="$PORT" docker compose up -d --build
echo "Waiting for the game health check..."
i=0
while [ "$i" -lt 30 ]; do
  if wget -qO- "http://127.0.0.1:$PORT/healthz" 2>/dev/null | grep -q wildfront-ok; then
    echo "Wildfront Horizon is healthy: http://127.0.0.1:$PORT"
    exit 0
  fi
  i=$((i+1)); sleep 2
done
docker compose ps
docker compose logs --tail=80
exit 1
