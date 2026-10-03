# Hypernova Circuit — Ubuntu deployment guide

This installs the racing game on port `8091`. It will not change Squad Rush (`8088`), Aether Bastion (`8089`), or the Flexzonic Games portal (`8090`).

## 1. Upload the ZIP

Download `hypernova-circuit.zip` to your computer, then upload it to the `gamesadmin` home folder on the Ubuntu server using your preferred SFTP tool.

The expected server path is:

```text
/home/gamesadmin/hypernova-circuit.zip
```

## 2. Install the game

Connect to Ubuntu with SSH and run:

```bash
cd /opt
sudo unzip -o /home/gamesadmin/hypernova-circuit.zip
sudo chown -R gamesadmin:gamesadmin /opt/hypernova-circuit
cd /opt/hypernova-circuit
chmod +x deploy.sh
./deploy.sh
```

The deploy script builds the container, starts it, and waits for a successful health response.

## 3. Verify locally

```bash
docker compose ps
curl http://127.0.0.1:8091/healthz
```

Expected response:

```text
hypernova-ok
```

Open the game from another computer on the same network using:

```text
http://YOUR-UBUNTU-SERVER-IP:8091
```

## 4. Add the Cloudflare Tunnel route

Your `cloudflared` connector runs inside Docker. It must use the Docker host gateway—not `localhost`.

1. Sign in to Cloudflare.
2. Open **Networking → Tunnels**.
3. Select the tunnel already serving your other Flexzonic games.
4. Open **Routes**.
5. Select **Add route → Published application**.
6. Enter the following values:

| Setting | Value |
| --- | --- |
| Subdomain | `racer` |
| Domain | `flexzonicgames.com` |
| Path | Leave blank |
| Service URL | `http://172.17.0.1:8091` |

7. Select **Save**.

The origin protocol must be `http`, not `https`. Visitors still receive normal HTTPS from Cloudflare.

## 5. Verify publicly

Wait about 30 seconds, then run:

```bash
curl -I https://racer.flexzonicgames.com
curl https://racer.flexzonicgames.com/healthz
```

The first command should return `HTTP/2 200`. The second should return `hypernova-ok`.

## 6. Confirm homepage discovery

The portal normally discovers the new `racer.flexzonicgames.com` DNS record automatically. Open:

```text
https://www.flexzonicgames.com/api/games
```

If automatic discovery is disabled, edit `/opt/flexzonic-games/.env` and add `racer.flexzonicgames.com` to `GAMES_MANUAL_HOSTS`, separated from existing hosts by a comma. Then restart the portal:

```bash
cd /opt/flexzonic-games
docker compose up -d --force-recreate
```

## Updating the game

Upload a newer ZIP, extract it over `/opt/hypernova-circuit`, and run:

```bash
cd /opt/hypernova-circuit
./deploy.sh
```

Player coins, owned cars, and upgrades are stored in each device's browser and are not erased by server updates.

## Troubleshooting

### Container does not become healthy

```bash
docker compose ps
docker logs --tail 150 hypernova-racer
sudo ss -ltnp | grep ':8091'
```

### Cloudflare error 502 or 1033

Confirm `cloudflared` is healthy and the published application route is exactly:

```text
http://172.17.0.1:8091
```

### Cloudflare error 525

The route was entered as HTTPS. Change the service URL to `http://172.17.0.1:8091`.

### Game is slow on an older phone

Close other browser tabs, disable battery-saving mode, and reload the game. The renderer automatically limits pixel density for mobile performance.
