# Wildfront Horizon v3.0.2 — beginner deployment

This release keeps the game address `https://hunt.flexzonicgames.com`, host port `8096` and the `/healthz` check (`wildfront-ok`). Player saves stay on the `wildfront-save-v1` browser key, so 2.0.3 and 3.0.x progress carries over. The installer keeps the old application folder as a rollback copy and restores it automatically if the new local health checks fail.

## What you need

- A Windows computer with the downloaded `wildfront-horizon-v3.0.2-studio-private.zip` and `.sha256` file in Downloads.
- The Ubuntu game server address and the `gamesadmin` password. The examples use `192.168.4.53` as in your earlier setup; change it if the server's IP address has changed.
- Docker Compose already working on the game server.
- Enough free disk space for another copy of the extracted source and a Docker build. Run `df -h /` first. If the root filesystem is full, free space before starting.

## 1. Check the downloaded package on Windows

1. Open the **Downloads** folder and confirm that the ZIP and checksum file are both present.
2. Right-click the Windows **Start** button and select **Terminal** or **Windows PowerShell**.
3. Paste these two commands, pressing Enter after each:

```powershell
cd "$env:USERPROFILE\Downloads"
Get-FileHash .\wildfront-horizon-v3.0.2-studio-private.zip -Algorithm SHA256
```

4. Open the `.sha256` file in Notepad. The long hexadecimal code displayed by PowerShell must match the code at the start of the file (letter case does not matter). If they differ, download the ZIP again.

## 2. Send the ZIP to the server

In the same Windows PowerShell window, run:

```powershell
scp .\wildfront-horizon-v3.0.2-studio-private.zip gamesadmin@192.168.4.53:/home/gamesadmin/
```

Enter the server password when prompted. Password characters do not appear while you type. Wait for the transfer to reach `100%`.

## 3. Sign in to Ubuntu and check the existing game

```powershell
ssh gamesadmin@192.168.4.53
```

Once you are signed in, run:

```bash
df -h /
docker ps --filter name=wildfront-horizon
curl -fsS http://127.0.0.1:8096/healthz
```

The last command should print `wildfront-ok`. A healthy old version is useful as a rollback point. If it is already offline, the installer can still proceed, but note that before continuing.

## 4. Extract into a new staging folder

Copy and paste this entire block into the Ubuntu terminal:

```bash
cd /opt
stage_dir="/opt/wildfront-stage-$(date +%Y%m%d-%H%M%S)"
sudo mkdir "$stage_dir"
sudo unzip -q /home/gamesadmin/wildfront-horizon-v3.0.2-studio-private.zip -d "$stage_dir"
sudo chown -R gamesadmin:gamesadmin "$stage_dir"
cd "$stage_dir/wildfront-horizon"
```

If `unzip` says the file is not a ZIP, go back to Windows and compare the checksum again. If `unzip` is missing, run `sudo apt install unzip` and repeat the block.

## 5. Install

From the staging folder, run:

```bash
bash install-v3.0.2.sh
```

The script checks the Compose configuration, moves the old `/opt/wildfront-horizon` folder to a timestamped backup, places the new source at the live path, builds the container, and checks both `/healthz` and the `3.0.2` game manifest. A first build can take several minutes. If a step fails after the old folder is moved, the script restores the old version and tells you where it saved the failed files.

When you see `Wildfront Horizon v3.0.2 is healthy`, run:

```bash
curl -fsS http://127.0.0.1:8096/healthz
curl -fsS http://127.0.0.1:8096/version.json
docker compose -f /opt/wildfront-horizon/docker-compose.yml ps
```

Expected: `wildfront-ok`, `"version": "3.0.2"`, and a healthy `wildfront-horizon` container.

## 6. Open the public game and check it

1. On your phone or computer, open `https://hunt.flexzonicgames.com/?v=3.0.2`.
2. If an older page appears, refresh once with Ctrl+Shift+R on desktop or close and reopen the browser tab on mobile.
3. In the lodge menu, confirm the entries are Field Contracts, Free Hunt, Gear Locker, Trophy Lodge, Field Guide and Settings, and that there is **no** Blueprint Studio.
4. Open **Settings** and confirm the version reads 3.0.2.
5. Start a contract and take one shot to confirm the game plays as before.
6. Open `https://hunt.flexzonicgames.com/classic` and confirm the Classic edition still loads.
7. Check the portal game card at `https://www.flexzonicgames.com`. Its automatic discovery may take a short while. The manifest should now report `3.0.2`.

The Blueprint Studio is intentionally hidden on the public site. To use it, run the game on your own computer with `npm ci` then `npm run dev`, open the address it prints, and choose **Blueprint Studio** in the lodge menu.

## Manual rollback if needed

The installer prints the exact backup folder. Replace the example backup name below with the one it printed. Run on Ubuntu:

```bash
cd /opt
sudo mv wildfront-horizon "wildfront-horizon-v302-hold-$(date +%Y%m%d-%H%M%S)"
sudo mv wildfront-horizon-backup-YYYYMMDD-HHMMSS wildfront-horizon
cd wildfront-horizon
docker compose up -d --build
curl -fsS http://127.0.0.1:8096/healthz
```

If the automatic rollback already ran, the old folder is already restored; do not repeat these commands. Review the installer output first.

## Cleaning up afterwards

Once 3.0.2 has run well for a few days, you can remove the rollback copy and the empty staging folder to free disk space (use the names the installer printed):

```bash
sudo rm -rf /opt/wildfront-horizon-backup-YYYYMMDD-HHMMSS
sudo rmdir /opt/wildfront-stage-*
```
