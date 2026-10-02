# Suggestions for the next releases

Ordered by impact on players for the effort involved.

1. **Online leaderboard and daily rift.** Add a seeded "daily sector" that everyone plays, plus a small authenticated score API next to the static container. The sector generator is already deterministic per seed.
2. **Commander customisation in the hangar.** The blueprint palette system already supports variants (the guardian has four). Unlocking armour colours and visor colours with credits gives a reason to keep playing and needs no new meshes.
3. **New drone specialists as blueprints.** A Sniper (long rail, slow) and an EMP drone (stuns shields) would add depth. Each is one recipe, one rig function and one line in `DRONE_ROLES`.
4. **Boss mechanics per guardian variant.** Give the HEX TYRANT a jammer aura, the NULL COLOSSUS a shield phase and the OMEGA REGENT a ground slam with telegraphed rings. The renderer already has ring, shield and flash layers for the telegraphs.
5. **Gamepad support and remappable keys.** The Gamepad API maps cleanly to the move vector, NOVA and FORMATION.
6. **Adaptive music.** Layer the synthesized ambience by combat intensity and add a boss theme. No audio files are needed.
7. **Photo mode.** Pause, free-orbit the camera and export a PNG, reusing the hangar's orbit controls. It's good for sharing on the portal.
8. **Performance telemetry (opt-in).** Report the tier and average frame time that AUTO settles on, so defaults can be tuned for real players' phones.
9. **Accessibility.** Add a colour-blind palette option for Legion and gate colours (theme tokens already exist), and a hold-to-fire alternative to auto-fire for players who want control.
10. **Account sync.** Move saves from localStorage to an optional Flexzonic account (authenticated API, never a database exposed to the browser) so progress follows players across devices.
