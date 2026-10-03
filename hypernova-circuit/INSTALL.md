# Hypernova Circuit v3.0.0 — beginner upgrade guide

This upgrades the game that is already live at `https://racer.flexzonicgames.com` on host port `8091`. The Cloudflare route, the portal card and every player's saved progress stay the same. The installer keeps the old folder as a rollback copy and puts it back automatically if the new version fails its health checks.

For a first-time install on a new server, use `BEGINNER-SETUP.md` instead.

## What you need

- The `hypernova-circuit-v3.0.0.zip` package on your Windows computer (in Downloads).
- The Ubuntu game server address and the `gamesadmin` password. The examples use `192.168.4.53`; change it if your server's address is different.
- Docker Compose already working on the server, which it is if v2 is running.
- Free disk space for a second copy of the source plus a Docker build. Check it with `df -h /` (step 3).

## 1. Send the ZIP to the server

On Windows, right-click **Start** → **Terminal** (or **Windows PowerShell**) and run:

```powershell
cd "$env:USERPROFILE\Downloads"
scp .\hypernova-circuit-v3.0.0.zip gamesadmin@192.168.4.53:/home/gamesadmin/
```

Type the server password when asked. The characters don't appear as you type. Wait for `100%`.

## 2. Sign in to Ubuntu

```powershell
ssh gamesadmin@192.168.4.53
```

## 3. Check the current game

```bash
df -h /
docker ps --filter name=hypernova-racer
curl -fsS http://127.0.0.1:8091/healthz
```

The last command should print `hypernova-ok`. If the old version is already down, you can still continue.

## 4. Extract into a staging folder

Paste this whole block:

```bash
cd /opt
stage_dir="/opt/hypernova-stage-$(date +%Y%m%d-%H%M%S)"
sudo mkdir "$stage_dir"
sudo unzip -q /home/gamesadmin/hypernova-circuit-v3.0.0.zip -d "$stage_dir"
sudo chown -R gamesadmin:gamesadmin "$stage_dir"
cd "$stage_dir/hypernova-circuit"
```

## 5. Run the installer

```bash
bash install-v3.0.0.sh
```

The installer:

1. copies your existing `.env` (port setting) into the new version;
2. moves `/opt/hypernova-circuit` to a timestamped backup;
3. puts v3.0.0 in its place and builds the container;
4. checks `/healthz` and that the game manifest reports `3.0.0`.

The first build can take several minutes. When you see `Hypernova Circuit v3.0.0 is healthy`, confirm:

```bash
curl -fsS http://127.0.0.1:8091/healthz
curl -fsS http://127.0.0.1:8091/.well-known/flexzonic-game.json | grep version
docker compose -f /opt/hypernova-circuit/docker-compose.yml ps
```

You should see `hypernova-ok`, `"version": "3.0.0"` and a healthy `hypernova-racer` container.

## 6. Test the public game

1. Open `https://racer.flexzonicgames.com/?v=3.0.0`. If the old menu appears, refresh with Ctrl+Shift+R (desktop) or close and reopen the tab (phone). The service worker cache was renamed, so the new version takes over after one reload.
2. The header should read **CIRCUIT · FULL 3D** and the menu **RACE THE HYPERNOVA GRAND PRIX**, with AI cars racing in the background.
3. Press **GRAND PRIX**. Round 1 (Neon Megacity Grandway) and round 2 are open. Press **RACE**. After the 3-2-1 countdown, steer with ← → (or the on-screen arrows, or drag), hold Space or BOOST for nitro, and press C for the camera views.
4. Finish the 3 laps. The results screen shows the finishing order and your prize. A podium unlocks the next round.
5. Open **GARAGE & SHOWROOM** and try the ORBIT / FRONT / REAR / LEFT / RIGHT / TOP / UNDER buttons.
6. Back on the menu, **ENDLESS STORM · CLASSIC RUN** starts the v2-style endless run.
7. On `https://www.flexzonicgames.com`, the portal card picks up the new description and version 3.0.0 automatically. Allow a short delay.

Saved coins, cars and upgrades carry over, because the save key `hypernova-circuit-save-v1` is unchanged.

If the game stutters on an older phone, tap **GFX** in the header until it reads **GFX LOW**.

## Manual rollback if needed

If the installer's automatic rollback already ran, the old version is back and you don't need to do anything. Otherwise use the backup folder name the installer printed:

```bash
cd /opt
sudo mv hypernova-circuit "hypernova-circuit-v3-hold-$(date +%Y%m%d-%H%M%S)"
sudo mv hypernova-circuit-backup-YYYYMMDD-HHMMSS hypernova-circuit
cd hypernova-circuit
docker compose up -d --build
curl -fsS http://127.0.0.1:8091/healthz
```

## Blueprint files

`blueprints/Hypernova-Circuit-3D-Blueprint-Atlas-v3.0.0.pdf` holds all 9 plates: six-side views of every car, quarter views, hazards and pickups, the six circuit plans and the raceway cross-section. The PNGs are in `blueprints/renders/` and the GLB 3D models are in `blueprints/models/`. They are kept with the source and are not served on the public site.
