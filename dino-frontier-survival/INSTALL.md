# Dino Frontier Survival 2.0 — Ubuntu installation

This game uses port `8101` by default and stores campaign progress and settings only in the player's browser.
Version 2.0 is a drop-in replacement for 1.0.1: same port, same health check, same save data.

```bash
cd /opt
sudo unzip -o /home/gamesadmin/dino-frontier-survival.zip
sudo chown -R gamesadmin:gamesadmin /opt/dino-frontier-survival
cd /opt/dino-frontier-survival
chmod +x deploy.sh
./deploy.sh
curl http://127.0.0.1:8101/healthz
```

Expected response: `dino-frontier-ok`

Add this published application to the existing Cloudflare Tunnel:

- Hostname: `frontier.flexzonicgames.com`
- Service type: `HTTP`
- Service URL: `http://172.17.0.1:8101`

Test the public route:

```bash
curl -I https://frontier.flexzonicgames.com
curl https://frontier.flexzonicgames.com/healthz
curl https://frontier.flexzonicgames.com/.well-known/flexzonic-game.json
```

Check the new 3D blueprint archive as well:

```bash
curl -I https://frontier.flexzonicgames.com/blueprints
```

## Upgrading from 1.0.1

Unzip over the existing folder and run `./deploy.sh` again; Docker rebuilds the `dino-frontier-survival:2.0.0`
image and replaces the container. The service worker cache is versioned (`dino-frontier-v3`) and pages are now
network-first, so returning players receive 2.0 on their next visit instead of a cached 1.0 page.

## Controls

Keyboard and mouse: WASD or arrows to move, mouse to aim (click the game to lock the pointer), hold left mouse or F to
fire, Space to jump, Shift to dash, Q for the EMP pulse, V to switch between third-person and tactical cameras, Esc
to pause. Gamepads work automatically. On touch screens an analog stick, drag-to-look area and fire, jump, dash and
EMP buttons appear.

If the game is embedded in an iframe on the hub site, add `allow="fullscreen; pointer-lock; gamepad"` to the iframe
so mouse aiming can lock the pointer (right-drag look works as a fallback).
