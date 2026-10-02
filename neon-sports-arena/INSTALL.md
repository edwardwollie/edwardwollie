# Neon Sports Arena — Ubuntu installation

Neon Sports Arena uses port `8105` by default. Career progress and upgrades are stored in each player's browser.

```bash
cd /opt
sudo unzip -o /home/gamesadmin/neon-sports-arena.zip
sudo chown -R gamesadmin:gamesadmin /opt/neon-sports-arena
cd /opt/neon-sports-arena
chmod +x deploy.sh
./deploy.sh
curl http://127.0.0.1:8105/healthz
```

Expected response: `neon-sports-ok`

Add this published application to the existing Cloudflare Tunnel:

- Hostname: `sports.flexzonicgames.com`
- Service type: `HTTP`
- Service URL: `http://172.17.0.1:8105`

Public tests:

```bash
curl -I https://sports.flexzonicgames.com
curl https://sports.flexzonicgames.com/healthz
curl https://sports.flexzonicgames.com/.well-known/flexzonic-game.json
```

Desktop controls: WASD/arrows move, Space shoots or uses the held core, Shift boosts, Q tackles, and E triggers overdrive. Large touch controls appear automatically on mobile screens, and the in-game tutorial demonstrates every control.
