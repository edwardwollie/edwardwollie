#!/usr/bin/env bash
# Upgrade the live Hypernova Circuit to 3.0.0 with automatic rollback.
set -Eeuo pipefail

SOURCE_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
LIVE_DIR="/opt/hypernova-circuit"
STAMP="$(date +%Y%m%d-%H%M%S)"
BACKUP_DIR="/opt/hypernova-circuit-backup-${STAMP}"
FAILED_DIR="/opt/hypernova-circuit-failed-${STAMP}"
export GAME_PORT="${GAME_PORT:-8091}"
BACKUP_CREATED=0

rollback(){
  local status="$1"
  trap - ERR
  set +e
  echo "Upgrade stopped. Restoring the previous Hypernova Circuit installation..."
  if [[ "$BACKUP_CREATED" == 1 ]]; then
    [[ ! -d "$LIVE_DIR" ]] || sudo mv "$LIVE_DIR" "$FAILED_DIR"
    sudo mv "$BACKUP_DIR" "$LIVE_DIR"
    (cd "$LIVE_DIR" && docker compose up -d --build)
    echo "Previous version restored at $LIVE_DIR. The failed version is at $FAILED_DIR."
  else
    echo "The previous installation was not moved. Check the error above."
  fi
  exit "$status"
}
trap 'rollback $?' ERR

[[ "$SOURCE_DIR" != "$LIVE_DIR" ]] || { echo "Run from an extracted staging folder, not the live folder."; exit 2; }
[[ -f "$SOURCE_DIR/app/game/track-spec.json" && -f "$SOURCE_DIR/app/game/blueprint-spec.json" ]] || { echo "The extracted package is incomplete."; exit 2; }
command -v docker >/dev/null && command -v curl >/dev/null || { echo "Docker and curl are required."; exit 2; }
# Keep the server's existing port setting.
if [[ -f "$LIVE_DIR/.env" ]]; then cp "$LIVE_DIR/.env" "$SOURCE_DIR/.env"; else cp "$SOURCE_DIR/.env.example" "$SOURCE_DIR/.env"; fi
(cd "$SOURCE_DIR" && docker compose config >/dev/null)

if [[ -d "$LIVE_DIR" ]]; then
  sudo mv "$LIVE_DIR" "$BACKUP_DIR"
  BACKUP_CREATED=1
fi
sudo mv "$SOURCE_DIR" "$LIVE_DIR"
sudo chown -R "$(id -un):$(id -gn)" "$LIVE_DIR"
(cd "$LIVE_DIR" && docker compose up -d --build)

PORT="$(sed -n 's/^GAME_PORT=//p' "$LIVE_DIR/.env" | tail -n 1)"; PORT="${PORT:-8091}"
healthy=0
for ((attempt=1;attempt<=40;attempt++));do
  if curl -fsS "http://127.0.0.1:${PORT}/healthz" | grep -qx 'hypernova-ok' && \
     curl -fsS "http://127.0.0.1:${PORT}/.well-known/flexzonic-game.json" | \
       grep -Eq '"version"[[:space:]]*:[[:space:]]*"3\.0\.0"'; then
    healthy=1;break
  fi
  sleep 2
done
[[ "$healthy" == 1 ]] || { echo "Version 3.0.0 did not pass its local health checks."; false; }

trap - ERR
echo "Hypernova Circuit v3.0.0 is healthy on host port $PORT."
if [[ "$BACKUP_CREATED" == 1 ]];then echo "Rollback copy: $BACKUP_DIR";fi
echo "Public check: https://racer.flexzonicgames.com/?v=3.0.0"
