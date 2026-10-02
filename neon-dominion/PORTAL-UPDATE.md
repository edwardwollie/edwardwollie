# Flexzonic portal update — v3.0.0 Full 3D Rift Engine

Version 3.0.0 keeps Flexzonic portal discovery, the port, the health check and players' saved progress.

After uploading `neon-dominion-rift-command-v3.0.0.zip` to `/home/gamesadmin`, run:

```bash
cd /opt
sudo unzip -o /home/gamesadmin/neon-dominion-rift-command-v3.0.0.zip
sudo chown -R gamesadmin:gamesadmin /opt/neon-dominion
cd /opt/neon-dominion
sudo rm -rf src   # v2 code folder; v3 serves code from /app
sudo env GAME_PORT=8108 docker compose up -d --build --force-recreate
```

If you deploy from the Git repository instead of a zip, copy the `neon-dominion` folder to `/opt/neon-dominion` and run the same `docker compose` command.

Verify the game, the security headers and the discovery record:

```bash
curl -fsS http://127.0.0.1:8108/healthz
curl -fsSI http://127.0.0.1:8108/ | grep -i content-security-policy
curl -fsS http://127.0.0.1:8108/version.json
curl -s -o /dev/null -w "%{http_code}\n" http://127.0.0.1:8108/assets/blueprints/plates/index.json   # must print 404 (blueprints are private)
curl -fsS http://127.0.0.1:8108/.well-known/flexzonic-game.json
curl -fsS https://neon.flexzonicgames.com/.well-known/flexzonic-game.json
```

The health response must be `neon-dominion-ok`. `version.json` must report `3.0.0`. Both discovery requests must return JSON with the title `Neon Dominion: Rift Command` and version `3.0.0`.

The portal normally picks up the new version, description and cover automatically. If it still shows v2.0.0 after two minutes, refresh the portal catalog container once:

```bash
sudo docker restart flexzonic-games
```

No Cloudflare route change is required. Keep the existing route:

```text
neon.flexzonicgames.com
→ http://172.17.0.1:8108
```

If Cloudflare caches static files for this hostname, purge the cache for `neon.flexzonicgames.com` once after the upgrade so the new cover image (`/assets/og.png`) shows on the portal.
