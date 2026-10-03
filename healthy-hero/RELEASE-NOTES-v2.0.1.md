# Healthy Hero v2.0.1 — Private Blueprint Lab

- The Blueprint Lab no longer appears on the public site. The title-screen **Blueprint Lab** button and the **See blueprint** button on the hero screen are hidden unless the game is opened from `localhost` (for example after `npm start` on your own computer).
- The blueprint book PDF is no longer served. The Docker image leaves out the whole `blueprints/` folder, and in production the server answers `404` for `/blueprints/`, `/tools/`, `/scripts/` and `.md` files even if they are present.
- The game's description in the portal metadata no longer mentions the Blueprint Lab.
- No gameplay or save changes. Saves still use `healthy-hero-save-v1`. The service worker cache is now `healthy-hero-v2.0.1-3d`, so returning players pick up the change on their next visit.
