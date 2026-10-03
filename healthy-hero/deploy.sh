#!/usr/bin/env sh
set -eu
export COMPOSE_BAKE=false
cd "$(dirname "$0")"
docker compose -f compose.yaml up -d --build --remove-orphans
printf '\nHealthy Hero 3D v2.0.0 is starting on port 8121. Waiting for health check...\n'
i=0
while [ "$i" -lt 30 ]; do
  if curl -fsS http://127.0.0.1:8121/healthz >/tmp/healthy-hero-health.txt 2>/dev/null; then
    if grep -q 'healthy-hero-ok' /tmp/healthy-hero-health.txt; then
      printf 'PASS - Healthy Hero is healthy: healthy-hero-ok\n'
      exit 0
    fi
  fi
  i=$((i+1))
  sleep 1
done
printf 'ERROR - Healthy Hero did not become healthy within 30 seconds.\n' >&2
docker compose -f compose.yaml ps >&2 || true
docker compose -f compose.yaml logs --tail=100 >&2 || true
exit 1
