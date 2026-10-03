# Wildfront Horizon 3.0.2 — Private Blueprint Studio

- The Blueprint Studio no longer appears on the public site. Production builds leave out its lodge menu entry and screen, so the engineering drawings (every side with dimension lines, exploded assemblies, parts lists and sheet export) are not shipped to players. The Studio still works when you run `npm run dev` on your own computer.
- The Studio-only "Draughtsman" achievement is hidden on the public site and left out of the achievement count. Players who already earned it keep it in their save.
- The intro card and the portal manifest no longer mention the Studio.
- Unchanged: the Field Guide, Trophy Lodge, Gear Locker drawings and the shot x-ray card, which are part of the game. Gameplay, saves (`wildfront-save-v1`), port 8096 and `/healthz` are unchanged. The manifest reports 3.0.2.
- The blueprint book tooling in `tools/` was never served by the site and is unchanged.
