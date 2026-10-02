# Neon Sports Arena v2.0.0 — beginner upgrade guide

This release keeps the existing game address `https://sports.flexzonicgames.com` and host port `8105`. The portal entry, the Cloudflare Tunnel route and saved player progress all stay where they are. The installer keeps your old application folder as a rollback copy. If the new version fails its local health checks, it restores the old one automatically.

## What you need

- A Windows computer with `neon-sports-arena-v2.0.0-full-3d.zip` and its `.sha256` file in Downloads.
- The Ubuntu game server address and the `gamesadmin` password. The examples use `192.168.4.53`; change it if your server's IP address is different.
- Docker Compose already working on the server.
- At least 2 GB of free disk space for the new source and a Docker build. Run `df -h /` first.

## 1. Check the download on Windows

1. Open **Downloads**, then right-click **Start** and select **Terminal** (or **Windows PowerShell**).
2. Run:

```powershell
cd "$env:USERPROFILE\Downloads"
Get-FileHash .\neon-sports-arena-v2.0.0-full-3d.zip -Algorithm SHA256
```

3. Open the `.sha256` file in Notepad. The code that PowerShell printed must match the code at the start of the file. If it doesn't, download the ZIP again.

## 2. Send the ZIP to the server

```powershell
scp .\neon-sports-arena-v2.0.0-full-3d.zip gamesadmin@192.168.4.53:/home/gamesadmin/
```

Type the server password when asked. The characters don't show while you type. Wait for `100%`.

## 3. Sign in and check the current game

```powershell
ssh gamesadmin@192.168.4.53
```

Then, on Ubuntu:

```bash
df -h /
docker ps --filter name=neon-sports-arena
curl -fsS http://127.0.0.1:8105/healthz
```

The last command should print `neon-sports-ok`. If the old version is already offline, you can still continue, but make a note of it.

## 4. Extract into a staging folder

Paste this whole block:

```bash
cd /opt
stage_dir="/opt/neon-sports-stage-$(date +%Y%m%d-%H%M%S)"
sudo mkdir "$stage_dir"
sudo unzip -q /home/gamesadmin/neon-sports-arena-v2.0.0-full-3d.zip -d "$stage_dir"
sudo chown -R gamesadmin:gamesadmin "$stage_dir"
cd "$stage_dir/neon-sports-arena"
```

## 5. Install and check

```bash
bash install-v2.0.sh
```

The script:

1. checks the Compose file
2. moves `/opt/neon-sports-arena` to a timestamped backup
3. puts the new version in its place and builds the container
4. waits for `/healthz` and for the manifest to report `2.0.0`

The first build takes a few minutes. If anything fails after the old folder was moved, the script puts the old version back and tells you where it saved the failed one.

When you see `Neon Sports Arena v2.0.0 is healthy`, run:

```bash
curl -fsS http://127.0.0.1:8105/healthz
curl -fsS http://127.0.0.1:8105/.well-known/flexzonic-game.json | grep version
docker compose -f /opt/neon-sports-arena/docker-compose.yml ps
```

You should see `neon-sports-ok`, `"version": "2.0.0"` and a healthy `neon-sports-arena` container.

The Cloudflare Tunnel needs no changes: hostname `sports.flexzonicgames.com`, service `http://172.17.0.1:8105`.

## 6. Test the public game

1. Open `https://sports.flexzonicgames.com/?v=2.0.0`. If the old page appears, refresh once with Ctrl+Shift+R, or close and reopen the tab on a phone. Version 2.0 replaces the old offline cache, so later updates appear on their own.
2. The header should read **ARENA LEAGUE · FULL 3D 2.0**.
3. Press **ENTER MATCH**. Returning players get the new six-step tutorial once. You should see a camera flyover of a 3D stadium, then **READY / GO**.
4. On a computer, skate with WASD and hold Space to charge. Release in the lime band for **PERFECT RELEASE**. A goal plays a slow-motion celebration and an instant replay (tap or press any key to skip).
5. On a phone (landscape), use the left stick, the ACTION button (hold to charge) and the five other buttons.
6. Check the portal card at `https://www.flexzonicgames.com`. Its manifest should report `2.0.0` once discovery refreshes.

Saved progress (credits, upgrades, stars, unlocked matches and teams) carries over because the save key `neon-sports-arena-save-v1` is unchanged.

## Manual rollback if needed

The installer prints the exact backup folder name. Replace the example name below with it:

```bash
cd /opt
sudo mv neon-sports-arena "neon-sports-arena-v2-hold-$(date +%Y%m%d-%H%M%S)"
sudo mv neon-sports-arena-backup-YYYYMMDD-HHMMSS neon-sports-arena
cd neon-sports-arena
docker compose up -d --build
curl -fsS http://127.0.0.1:8105/healthz
```

If the automatic rollback already ran, the old folder is already back. Don't repeat these commands.

## Blueprint files

The blueprints are private and are not part of the website. They stay in the source folder only: `blueprints/Neon-Sports-Arena-3D-Blueprint-Atlas-v2.0.0.pdf`, the PNG plates in `blueprints/renders/` and the GLB models in `blueprints/models/`. A request for `https://sports.flexzonicgames.com/blueprints/...` returns "not found".
