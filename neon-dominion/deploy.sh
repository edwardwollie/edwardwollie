#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")"
PORT="${GAME_PORT:-8108}"

if docker info >/dev/null 2>&1; then
  DOCKER=(docker)
else
  DOCKER=(sudo docker)
fi

printf 'Deploying Neon Dominion: Rift Command v3.0.0 on port %s\n' "$PORT"
"${DOCKER[@]}" rm -f neon-dominion >/dev/null 2>&1 || true
GAME_PORT="$PORT" "${DOCKER[@]}" compose up -d --build --remove-orphans

for attempt in $(seq 1 30); do
  if command -v curl >/dev/null 2>&1 && curl -fsS "http://127.0.0.1:${PORT}/healthz" | grep -q 'neon-dominion-ok'; then
    echo 'Health check passed: neon-dominion-ok'
    "${DOCKER[@]}" compose ps
    exit 0
  fi
  sleep 1
done

echo 'Deployment started, but the local health check did not pass within 30 seconds.' >&2
"${DOCKER[@]}" compose ps >&2 || true
"${DOCKER[@]}" logs --tail 80 neon-dominion >&2 || true
exit 1
