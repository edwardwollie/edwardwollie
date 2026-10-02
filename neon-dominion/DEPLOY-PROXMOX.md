# Beginner's deployment guide: Proxmox VE + Ubuntu + Cloudflare

This guide deploys **Neon Dominion: Rift Command** on port **8108**. If you already have an Ubuntu game server and Docker, begin at Phase 3.

## Phase 1 — Create the Ubuntu VM in Proxmox VE

1. Sign in to the Proxmox VE web page.
2. In the left column, click your Proxmox node.
3. Click **Create VM** in the upper-right corner.
4. On **General**:
   - Enter a VM ID or accept the suggested number.
   - Name the VM `flexzonic-games`.
   - Check **Start at boot** if that option is shown.
5. On **OS**:
   - Select your Ubuntu Server 24.04 LTS or 26.04 LTS ISO.
   - Leave the guest type as Linux.
6. On **System**, keep the normal defaults. Choose **VirtIO SCSI single** when available.
7. On **Disks**, choose at least **16 GB**.
8. On **CPU**, choose **2 cores**.
9. On **Memory**, enter **2048 MB**.
10. On **Network**, use the bridge connected to your LAN—normally `vmbr0`—and select the VirtIO model.
11. Review the summary, check **Start after created**, and click **Finish**.
12. Open the VM's **Console** and install Ubuntu Server.
13. During Ubuntu setup:
    - Create an administrator username and a strong password.
    - Enable **Install OpenSSH server**.
    - Do not install a desktop environment; it is not needed.
14. After Ubuntu restarts, sign in and run:

```bash
sudo apt update
sudo apt full-upgrade -y
sudo reboot
```

## Phase 2 — Install Docker Engine and Compose

If `sudo docker version` and `sudo docker compose version` both work, skip to Phase 3.

The following uses Docker's official Ubuntu repository and current Compose plugin.

```bash
sudo apt update
sudo apt install -y ca-certificates curl unzip
sudo install -m 0755 -d /etc/apt/keyrings
sudo curl -fsSL https://download.docker.com/linux/ubuntu/gpg -o /etc/apt/keyrings/docker.asc
sudo chmod a+r /etc/apt/keyrings/docker.asc
```

Add Docker's package source:

```bash
sudo tee /etc/apt/sources.list.d/docker.sources > /dev/null <<EOF
Types: deb
URIs: https://download.docker.com/linux/ubuntu
Suites: $(. /etc/os-release && echo "${UBUNTU_CODENAME:-$VERSION_CODENAME}")
Components: stable
Architectures: $(dpkg --print-architecture)
Signed-By: /etc/apt/keyrings/docker.asc
EOF
```

Install and start Docker:

```bash
sudo apt update
sudo apt install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin
sudo systemctl enable --now docker
sudo docker run --rm hello-world
sudo docker compose version
```

Docker documents these exact repository/package steps in its [official Ubuntu installation guide](https://docs.docker.com/engine/install/ubuntu/) and recommends the Compose plugin instead of the legacy standalone command.

## Phase 3 — Upload and extract the game

### Easiest method from a Windows computer

1. Install and open WinSCP.
2. Create a new connection:
   - File protocol: **SFTP**
   - Host: your Ubuntu VM's IP address
   - Port: `22`
   - Username/password: the Ubuntu account you created
3. Connect and accept the server fingerprint only after confirming it belongs to your VM.
4. Upload the supplied `neon-dominion-rift-command-v3.0.0.zip` to your Ubuntu user's home folder.
5. Open PuTTY, Windows Terminal, or the Proxmox VM console and sign in.

Extract the package:

```bash
sudo mkdir -p /opt/flexzonic
cd /opt/flexzonic
sudo unzip -o "$HOME/neon-dominion-rift-command-v3.0.0.zip"
sudo chown -R root:root /opt/flexzonic/neon-dominion
cd /opt/flexzonic/neon-dominion
```

Confirm that the files are present:

```bash
ls
```

You should see `compose.yaml`, `Dockerfile`, `index.html`, `src`, and other files.

## Phase 4 — Build and start the game

Run:

```bash
cd /opt/flexzonic/neon-dominion
sudo docker compose up -d --build
sudo docker compose ps
```

Under `STATUS`, the container should first show `health: starting` and then `healthy`.

Test the internal health page:

```bash
curl http://127.0.0.1:8108/healthz
```

Expected result:

```text
neon-dominion-ok
```

Test from another computer on the same LAN by opening:

```text
http://YOUR-UBUNTU-IP:8108
```

To find the Ubuntu IP address:

```bash
hostname -I
```

## Phase 5 — Add the Cloudflare Tunnel hostname

A good default hostname is:

```text
neon.flexzonicgames.com
```

Cloudflare's current dashboard path is **Networking → Tunnels**. Select the tunnel, open **Routes**, choose **Add route**, then choose **Published application**. Cloudflare documents that current sequence in its [Tunnel setup guide](https://developers.cloudflare.com/tunnel/setup/).

### If `cloudflared` is installed directly on the Ubuntu VM

1. Sign in to the Cloudflare dashboard.
2. Open **Networking**.
3. Open **Tunnels**.
4. Click your existing Flexzonic tunnel.
5. Open **Routes**.
6. Click **Add route**.
7. Choose **Published application**.
8. For the hostname:
   - Subdomain: `neon`
   - Domain: `flexzonicgames.com`
9. For Service URL, enter:

```text
http://localhost:8108
```

10. Save the route.

### If `cloudflared` runs in its own Docker container

Inside that container, `localhost` means the Cloudflare container—not the Ubuntu host. Use the Docker bridge gateway address that has worked for your other games:

```text
http://172.17.0.1:8108
```

If that address does not respond, test it from the Cloudflare container:

```bash
sudo docker exec cloudflared wget -qO- http://172.17.0.1:8108/healthz
```

If your Cloudflare container has a different name, find it with:

```bash
sudo docker ps --format "table {{.Names}}\t{{.Image}}"
```

Cloudflare describes a published route as a public hostname mapped to a local HTTP service in its [routing documentation](https://developers.cloudflare.com/tunnel/routing/).

## Phase 6 — Verify public access and install it like an app

1. On a phone with Wi-Fi turned off, open:

```text
https://neon.flexzonicgames.com
```

2. Confirm that the command menu appears.
3. Tap **Deploy Squad** and complete the tutorial.
4. On Android Chrome, open the browser menu and choose **Install app** or **Add to Home screen**.
5. After one successful online load, launch it again with airplane mode enabled to verify offline play.

The HTTPS Cloudflare address is important for service-worker/PWA installation. Plain LAN HTTP is suitable for a quick game test but browsers normally require HTTPS for offline installation outside localhost.

## Routine commands

Check status:

```bash
cd /opt/flexzonic/neon-dominion
sudo docker compose ps
```

View the latest logs:

```bash
sudo docker compose logs --tail=100
```

Restart the game:

```bash
sudo docker compose restart
```

Rebuild after replacing game files:

```bash
sudo docker compose up -d --build
```

Stop the game without deleting its source files:

```bash
sudo docker compose down
```

## Troubleshooting

### The health check works, but the Cloudflare hostname does not

1. Confirm `curl http://127.0.0.1:8108/healthz` returns `neon-dominion-ok`.
2. Confirm the Cloudflare tunnel is **Healthy**.
3. If Cloudflare is in Docker, use `http://172.17.0.1:8108`, not `localhost`.
4. Confirm the route uses `http`, not `https`, for the origin service.
5. Make sure no other container already uses host port `8108`:

```bash
sudo ss -lntp | grep 8108
```

### Port 8108 is already in use

Choose another port, for example 8104:

```bash
cd /opt/flexzonic/neon-dominion
GAME_PORT=8104 sudo docker compose up -d --build
```

Then update the Cloudflare service URL to the same new port.

### The browser still shows an older release

1. Close every open game tab.
2. In the browser's site settings, clear cached data for the game hostname.
3. Reopen the game.
4. For future code releases, increase the cache version in `sw.js`.

### Touch movement does not respond

- Drag from inside the circular MOVE control in the lower-left corner.
- Make sure no browser accessibility overlay is intercepting touches.
- Reload once after rotating the device.

### The game appears small or zoomed

- Reset the browser zoom to 100%.
- Open it from the installed PWA icon for a full-screen layout.
- The game supports both portrait and landscape, but landscape gives a wider battlefield.
