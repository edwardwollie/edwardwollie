# Install Spaceflight Academy v3.0.2 (3D edition)

From Windows PowerShell:

```powershell
scp "$env:USERPROFILE\Downloads\spaceflight-academy-v3.0.2-3d.zip" gamesadmin@192.168.4.53:/home/gamesadmin/
```

On the Ubuntu game server (this keeps the running version as a backup):

```bash
cd /opt
sudo rm -rf /opt/spaceflight-academy-backup-previous
sudo cp -a /opt/spaceflight-academy /opt/spaceflight-academy-backup-previous
sudo rm -rf /opt/spaceflight-academy
sudo unzip /home/gamesadmin/spaceflight-academy-v3.0.2-3d.zip -d /opt
sudo chown -R gamesadmin:gamesadmin /opt/spaceflight-academy
cd /opt/spaceflight-academy
chmod +x deploy.sh
./deploy.sh
```

The Docker build runs `npm ci`, type-checks and builds both editions; the first build takes a
few minutes.

Health check:

```bash
curl http://127.0.0.1:8119/healthz
curl -s http://127.0.0.1:8119/version.json
```

Expected:

```text
spaceflight-academy-ok
{"name":"Spaceflight Academy","version":"3.0.2","edition":"3D","port":8119,"health":"spaceflight-academy-ok","classic":"/classic/"}
```

Public URLs:

```text
https://spaceflight.flexzonicgames.com/?v=3.0.2          3D edition
https://spaceflight.flexzonicgames.com/classic/          Classic 2D edition (same save)
```

Open `https://spaceflight.flexzonicgames.com/?v=3.0.2`, enter the Spaceport and check that the
menu shows Missions, Rocket Hangar, Observatory, Training, Family Lab and Crew Lounge, with
**no** Blueprint Studio button and no Blueprint Studio building beside the Family Space Lab.
The Studio is intentionally hidden on the public site; to use it, run `npm run dev` locally.

Cloudflare Tunnel route is unchanged:

```text
spaceflight.flexzonicgames.com -> http://172.17.0.1:8119
```

Saved progress is kept: v3 uses the same browser save key as v2.1, so children keep their
unlocked missions, stars, XP, badges and star cores. Devices without WebGL 2 are sent to the
Classic edition automatically. Browsers that already have v3.0.1 pick up v3.0.2 on their next
visit (the offline cache is renamed for each release); a normal refresh is enough.

## Roll back

```bash
cd /opt
sudo rm -rf /opt/spaceflight-academy
sudo cp -a /opt/spaceflight-academy-backup-previous /opt/spaceflight-academy
cd /opt/spaceflight-academy && ./deploy.sh
```
