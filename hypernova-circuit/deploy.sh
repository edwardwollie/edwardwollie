#!/usr/bin/env sh
set -eu

command -v docker >/dev/null 2>&1 || {
  echo "Docker is not installed. Follow BEGINNER-SETUP.md first."
  exit 1
}

command -v curl >/dev/null 2>&1 || {
  echo "curl is required for the deployment health check."
  exit 1
}

if docker compose version >/dev/null 2>&1; then
  COMPOSE="docker compose"
elif command -v docker-compose >/dev/null 2>&1; then
  COMPOSE="docker-compose"
else
  echo "Docker Compose is not installed. Follow BEGINNER-SETUP.md first."
  exit 1
fi

if [ ! -f .env ]; then
  cp .env.example .env
fi

GAME_PORT_VALUE="$(sed -n 's/^GAME_PORT=//p' .env | tail -n 1)"
GAME_PORT_VALUE="${GAME_PORT_VALUE:-8091}"

echo "Building Hypernova Circuit..."
$COMPOSE up -d --build

echo "Waiting for the game server on port ${GAME_PORT_VALUE}..."
attempt=1
while [ "$attempt" -le 45 ]; do
  if curl --fail --silent "http://127.0.0.1:${GAME_PORT_VALUE}/healthz" >/dev/null 2>&1; then
    echo "Hypernova Circuit is healthy."
    echo "Game:   http://127.0.0.1:${GAME_PORT_VALUE}/"
    echo "Health: http://127.0.0.1:${GAME_PORT_VALUE}/healthz"
    exit 0
  fi
  sleep 2
  attempt=$((attempt + 1))
done

echo "The container did not become healthy in time. Recent logs:"
$COMPOSE logs --tail 100 hypernova-racer
exit 1
