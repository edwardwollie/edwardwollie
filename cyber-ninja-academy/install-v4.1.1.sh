#!/usr/bin/env bash
set -Eeuo pipefail

SOURCE_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
LIVE_DIR="/opt/cyber-ninja-academy"
STAMP="$(date +%Y%m%d-%H%M%S)"
BACKUP_DIR="/opt/cyber-ninja-academy-backup-${STAMP}"
FAILED_DIR="/opt/cyber-ninja-academy-failed-${STAMP}"
export CYBER_NINJA_PORT="${CYBER_NINJA_PORT:-8099}"
BACKUP_CREATED=0

rollback(){
  local status="$1"
  trap - ERR
  set +e
  echo "Upgrade stopped. Restoring the previous Cyber Ninja installation..."
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
[[ -f "$SOURCE_DIR/app/blueprint-spec.json" ]] || { echo "The extracted package is incomplete."; exit 2; }
command -v docker >/dev/null && command -v curl >/dev/null || { echo "Docker and curl are required."; exit 2; }
(cd "$SOURCE_DIR" && docker compose config >/dev/null)

if [[ -d "$LIVE_DIR" ]]; then
  sudo mv "$LIVE_DIR" "$BACKUP_DIR"
  BACKUP_CREATED=1
fi
sudo mv "$SOURCE_DIR" "$LIVE_DIR"
sudo chown -R "$(id -un):$(id -gn)" "$LIVE_DIR"
(cd "$LIVE_DIR" && docker compose up -d --build)

healthy=0
for ((attempt=1;attempt<=30;attempt++));do
  if curl -fsS "http://127.0.0.1:${CYBER_NINJA_PORT}/healthz" | grep -qx 'cyber-ninja-ok' && \
     curl -fsS "http://127.0.0.1:${CYBER_NINJA_PORT}/.well-known/flexzonic-game.json" | \
       grep -Eq '"version"[[:space:]]*:[[:space:]]*"4\.1\.1"'; then
    healthy=1;break
  fi
  sleep 2
done
[[ "$healthy" == 1 ]] || { echo "Version 4.1.1 did not pass its local health checks."; false; }

trap - ERR
echo "Cyber Ninja Academy v4.1.1 is healthy on host port $CYBER_NINJA_PORT."
if [[ "$BACKUP_CREATED" == 1 ]];then echo "Rollback copy: $BACKUP_DIR";fi
echo "Public check: https://ninja.flexzonicgames.com/?v=4.1.1"
