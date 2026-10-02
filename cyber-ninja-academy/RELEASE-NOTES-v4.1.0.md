# Cyber Ninja Academy 4.1.0 — Bosses, wall-running, ghosts and leaderboard

## The Warden (sector boss)
- New 3D blueprint: a 3.5 m siege machine with 42 parts and 8,868 triangles. Plate 07 shows its six sides and two quarter views, and it also ships as a GLB.
- Clearing every shard and drone now wakes the Warden over the summit. Destroying it lights the uplink beacon.
- It fights in three phases:
  - **Phase 1:** cannon fan volleys.
  - **Phase 2:** adds plasma rain (telegraphed red circles under you) and deploys two sentry drones.
  - **Phase 3:** fires faster, adds a ground-slam shockwave ring that you must jump, and its orbit rings spin harder.
- Six quick hits stagger it. It sinks within katana reach and takes 50% more damage. Deflected bolts deal triple damage.
- It has a boss health bar with phase ticks, an objective marker, a radar blip and camera framing. Later sectors have tougher Wardens (24 to 54 HP).

## Wall-running
- Jump at a tall wall while moving along it to run across it for up to 1.25 s.
- Space kicks off in a wall jump, which refunds your double jump.
- New neon billboard walls span some unbridged gaps between rooftops, so you can cross them by wall-running.
- New lean-away wall-run pose, added to the hangar and the pose data.

## Ghost replays
- Each City Ops run is recorded at 10 Hz: position, facing and pose.
- Your fastest clear per sector is saved on the device and replayed as a translucent cyan operative you can race. The "Race my ghost" checkbox turns it on or off.
- The results screen shows a new record, or your split against your best time.

## Online leaderboard
- After a clear, enter a callsign and post your time. You see the top 10 with your rank highlighted, and each sector brief shows the top three.
- Scores are stored on your server in a persistent Docker volume (`cyber-ninja-leaderboard`), so they survive upgrades and rollbacks. See INSTALL.md section 5b.
- Server-side checks:
  - callsign cleaning
  - range checks
  - minimum plausible time per sector
  - each callsign keeps only its best time
  - rate limit
- Validation is basic, so a determined player could still post a forged time.

## Fixes
- A data shard placed beside a rooftop prop could float out of reach. Shards now sit on the prop itself.

## Compatibility
- Same save key. Returning players see only the three new training cards.
- Host port 8099 and `/healthz` are unchanged. The manifest reports 4.1.0.

## Validation
- `npm test` passes 19 checks.
- Lint and typecheck are clean.
- The leaderboard API was exercised against the production server build: it accepts, ranks, rejects an impossible run and persists to disk.
- A headless browser playthrough confirmed: wall-run triggers, the Warden wakes, a katana swing damages it, sentries deploy in phase 2, defeating it lights the beacon, the run completes, the ghost is saved and replays on the next run, and the leaderboard renders.
- Real-GPU performance and the Docker volume on the server still need checking after installation.
