# Dino Frontier Survival — Ubuntu installation

This game uses port `8101` by default and stores campaign progress only in the player's browser.

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

Keyboard controls: WASD or arrows to move, Space to fire, Shift to dash. Large mobile movement, fire, and dash controls appear automatically on touch-sized screens.
