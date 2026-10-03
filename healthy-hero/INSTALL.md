# Install Healthy Hero 3D v2.0.0 on the Flexzonic Ubuntu server

v2.0.0 replaces the 2D rush with a full 3D game. Deployment is unchanged: same Docker setup,
same port `8121`, same Cloudflare Tunnel route, and existing browser progress keeps working.

```bash
cd /opt
sudo rm -rf /opt/healthy-hero
sudo unzip /home/gamesadmin/healthy-hero-v2.0.0-3d.zip -d /opt
sudo chown -R gamesadmin:gamesadmin /opt/healthy-hero
cd /opt/healthy-hero
chmod +x deploy.sh
./deploy.sh
```

Expected deployment result:

```text
PASS - Healthy Hero is healthy: healthy-hero-ok
```

Verify:

```bash
curl http://127.0.0.1:8121/healthz
curl -s https://healthy.flexzonicgames.com/.well-known/flexzonic-game.json | jq '{title,name,category,version,order}'
curl -sI https://healthy.flexzonicgames.com/src/vendor/three.module.min.js?v=2.0.0 | head -n 3
```

The metadata should report `"version": "2.0.0"`.

Cloudflare Tunnel route remains:

```text
healthy.flexzonicgames.com
→ http://172.17.0.1:8121
```

Notes

- Fonts are now self-hosted, so the Content-Security-Policy no longer allows Google Fonts.
- The service worker cache is renamed `healthy-hero-v2.0.0-3d`; old 1.3.1 caches are deleted on first visit.
- If a browser still shows the old 2D game, a normal reload picks up the new version (HTML, JS and CSS are served with `no-cache, must-revalidate`).
- The previous 2D game stays available at `https://healthy.flexzonicgames.com/classic/`.
