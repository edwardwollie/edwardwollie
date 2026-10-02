# Cyber Ninja Academy v4.0.0 — beginner deployment

This release uses the existing game address `https://ninja.flexzonicgames.com` and host port `8099`. The portal, Cloudflare route, and saved player progress remain at their current locations. The installer keeps the old application folder as a rollback copy and restores it automatically if the new local health checks fail.

## What you need

- A Windows computer with the downloaded `cyber-ninja-academy-v4.0.0-full-3d-upgrade.zip` and `.sha256` file in Downloads.
- The Ubuntu game server address and the `gamesadmin` password. The examples use `192.168.4.53` as in your earlier setup; change it if the server's IP address has changed.
- Docker Compose already working on the game server.
- Enough free disk space for another copy of the extracted source and a Docker build. Run `df -h /` first. If the root filesystem is full, free space before starting.

## 1. Check the downloaded package on Windows

1. Open the **Downloads** folder and confirm that the ZIP and checksum file are both present.
2. Right-click the Windows **Start** button and select **Terminal** or **Windows PowerShell**.
3. Paste these two commands, pressing Enter after each:

```powershell
cd "$env:USERPROFILE\Downloads"
Get-FileHash .\cyber-ninja-academy-v4.0.0-full-3d-upgrade.zip -Algorithm SHA256
```

4. Open the `.sha256` file in Notepad. The long hexadecimal code displayed by PowerShell must match the code at the start of the file. If they differ, download the ZIP again.

## 2. Send the ZIP to the server

In the same Windows PowerShell window, run:

```powershell
scp .\cyber-ninja-academy-v4.0.0-full-3d-upgrade.zip gamesadmin@192.168.4.53:/home/gamesadmin/
```

Enter the server password when prompted. Password characters do not appear while you type. Wait for the transfer to reach `100%`.

## 3. Sign in to Ubuntu and check the existing game

```powershell
ssh gamesadmin@192.168.4.53
```

Once the prompt begins with `gamesadmin@flexgames`, run:

```bash
df -h /
docker ps --filter name=cyber-ninja-academy
curl -fsS http://127.0.0.1:8099/healthz
```

The last command should print `cyber-ninja-ok`. A healthy old version is useful as a rollback point. If it is already offline, the installer can still proceed, but record that condition before continuing.

## 4. Extract into a new staging folder

Copy and paste this entire block into the Ubuntu terminal:

```bash
cd /opt
stage_dir="/opt/cyber-ninja-stage-$(date +%Y%m%d-%H%M%S)"
sudo mkdir "$stage_dir"
sudo unzip -q /home/gamesadmin/cyber-ninja-academy-v4.0.0-full-3d-upgrade.zip -d "$stage_dir"
sudo chown -R gamesadmin:gamesadmin "$stage_dir"
cd "$stage_dir/cyber-ninja-academy"
```

If `unzip` says the file is not a ZIP, go back to Windows and compare the checksum in step 1. Do not run the installer on an incomplete download.

## 5. Install and check the new version

From the staging folder, run:

```bash
bash install-v4.0.sh
```

The script checks the Compose configuration, moves the old `/opt/cyber-ninja-academy` folder to a timestamped backup, places the new source at the live path, builds the container, and checks both `/healthz` and the `4.0.0` game manifest. A first build can take several minutes. If a command fails after the old folder is moved, the script restores the old version and tells you where it saved the failed files.

When you see `Cyber Ninja Academy v4.0.0 is healthy`, run:

```bash
curl -fsS http://127.0.0.1:8099/healthz
curl -fsS http://127.0.0.1:8099/.well-known/flexzonic-game.json | grep version
docker compose -f /opt/cyber-ninja-academy/docker-compose.yml ps
```

Expected: `cyber-ninja-ok`, `"version": "4.0.0"`, and a healthy `cyber-ninja-academy` container.

## 6. Open the public game and test both modes

1. On your phone or computer, open `https://ninja.flexzonicgames.com/?v=4.0.0`.
2. If an older page appears, refresh once with Ctrl+Shift+R on desktop or close and reopen the browser tab on mobile.
3. Confirm that the header says **FULL 3D 4.0** and the cover shows the new realistic operative.
4. **City Ops (new):** with the CITY OPS tab selected, press **DEPLOY TO CITY OPS**. After the five training cards you should be on a rooftop in a 3D city. On a computer, click the game once to capture the mouse, move with WASD and look with the mouse. On a phone, use the left stick and drag the right side of the screen. Check the radar (top right), the diamond objective marker, and that F or a left click swings the katana. Press ESC, then × to leave.
5. **Survival Trials:** select the SURVIVAL TRIALS tab and enter trial 1. It should play as before (22 hazard waves) with the new operative running, jumping and sliding.
6. **Blueprint Hangar:** press **3D BLUEPRINT HANGAR** in the header. You should be able to orbit the ninja, switch sides and poses, toggle the wireframe, and download the PDF atlas.
7. Check the portal game card at `https://www.flexzonicgames.com`. Its automatic discovery may take a short interval. The manifest should now report `4.0.0`.

Saved progress (credits, upgrades, unlocked trials and stars) carries over because the save key `cyber-ninja-save-v1` is unchanged.

## Manual rollback if needed

The installer prints the exact backup folder. Replace the example backup name below with the one it printed. Run on Ubuntu:

```bash
cd /opt
sudo mv cyber-ninja-academy "cyber-ninja-academy-v4-hold-$(date +%Y%m%d-%H%M%S)"
sudo mv cyber-ninja-academy-backup-YYYYMMDD-HHMMSS cyber-ninja-academy
cd cyber-ninja-academy
docker compose up -d --build
curl -fsS http://127.0.0.1:8099/healthz
```

If the automatic rollback already ran, the old folder is already restored; do not repeat these commands. Review the installer output first.

## Blueprint files

Inside `blueprints/`, open `Cyber-Ninja-3D-Blueprint-Atlas-v4.0.0.pdf` (also served at `/blueprints/` on the site) for six plates: six orthographic sides with dimensions, four quarter views, a detail review, the joint map and pose sheet, City Ops assets, and the survival hazards. The PNGs are in `blueprints/renders/`; exact neutral-pose operative, drone and beacon GLBs are in `blueprints/models/`. To regenerate everything, follow `blueprints/README.md`.
