# Install Healthy Hero 3D v2.0.1 on the Flexzonic Ubuntu server

v2.0.1 hides the Blueprint Lab and the blueprint book PDF from the public site. Everything else is
unchanged: same Docker setup, same port `8121`, same Cloudflare Tunnel route, and saved progress keeps working.

## What you need

- A Windows computer with `healthy-hero-v2.0.1-blueprints-private.zip` (and its `.sha256` file) in Downloads.
- The Ubuntu game server address and the `gamesadmin` password. The examples use `192.168.4.53`; change it if the server's address is different.
- Docker Compose already working on the server (it is, if Healthy Hero 2.0.0 is running).

## 1. Check the download (Windows PowerShell)

```powershell
cd "$env:USERPROFILE\Downloads"
Get-FileHash .\healthy-hero-v2.0.1-blueprints-private.zip -Algorithm SHA256
```

Open the `.sha256` file in Notepad. The code PowerShell shows must match the code at the start of the file. If not, download the ZIP again.

## 2. Copy the ZIP to the server

```powershell
scp .\healthy-hero-v2.0.1-blueprints-private.zip gamesadmin@192.168.4.53:/home/gamesadmin/
```

Enter the server password when asked (it does not show while you type). Wait for `100%`.

## 3. Log in to the server

```powershell
ssh gamesadmin@192.168.4.53
```

## 4. Install (Ubuntu terminal)

Copy and paste this whole block. It keeps the old version as a backup instead of deleting it:

```bash
cd /opt
backup="/opt/healthy-hero-backup-$(date +%Y%m%d-%H%M%S)"
[ -d /opt/healthy-hero ] && sudo mv /opt/healthy-hero "$backup" && echo "Old version saved to $backup"
sudo unzip -q /home/gamesadmin/healthy-hero-v2.0.1-blueprints-private.zip -d /opt
sudo chown -R gamesadmin:gamesadmin /opt/healthy-hero
cd /opt/healthy-hero
chmod +x deploy.sh
./deploy.sh
```

Expected last line:

```text
PASS - Healthy Hero is healthy: healthy-hero-ok
```

## 5. Verify on the server

```bash
curl -s http://127.0.0.1:8121/healthz; echo
curl -s http://127.0.0.1:8121/.well-known/flexzonic-game.json | grep '"version"'
curl -s -o /dev/null -w '%{http_code}\n' http://127.0.0.1:8121/blueprints/healthy-hero-3d-blueprints.pdf
```

Expected: `healthy-hero-ok`, `"version": "2.0.1"`, and `404` (the PDF is no longer public).

## 6. Check the public site

1. Open `https://healthy.flexzonicgames.com/?v=2.0.1` on your phone or computer.
2. The title screen should say **3D BUILD v2.0.1** and show **no Blueprint Lab** button. If you still see the old version, reload once (Ctrl+Shift+R on a computer, or close and reopen the tab on a phone). The new service worker replaces the old cache on that visit.
3. Open **Heroes**: there should be no **See blueprint** button.
4. Play a mission to confirm the game runs normally.

The Cloudflare Tunnel route stays the same:

```text
healthy.flexzonicgames.com
→ http://172.17.0.1:8121
```

## If something goes wrong (rollback)

`deploy.sh` prints the container logs if the health check fails. To go back to the previous version
(use the folder name printed in step 4):

```bash
cd /opt
docker compose -f /opt/healthy-hero/compose.yaml down
sudo mv /opt/healthy-hero /opt/healthy-hero-failed-$(date +%Y%m%d-%H%M%S)
sudo mv /opt/healthy-hero-backup-YYYYMMDD-HHMMSS /opt/healthy-hero
cd /opt/healthy-hero && ./deploy.sh
```

Once v2.0.1 is working, you can delete the backup folder with `sudo rm -rf /opt/healthy-hero-backup-*`.

## Using the Blueprint Lab privately

The Lab and blueprint book still ship in the source package for your own use:

- **Blueprint book:** open `blueprints/healthy-hero-3d-blueprints.pdf` from the ZIP.
- **Blueprint Lab:** on a computer with Node.js 20+, run `npm start` in the `healthy-hero` folder and open `http://localhost:3000`. The Lab only appears when the address is `localhost` or `127.0.0.1`; visitors using `healthy.flexzonicgames.com` or the server's network address never see it.
