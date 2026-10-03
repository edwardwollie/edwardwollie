# Healthy Hero v2.0.0 — 3D Learning Edition

## New
- Full 3D game built with three.js (served locally; no external scripts or fonts).
- Four playable heroes from the cover art: Pip, Mia, Leo and Ginger the fox, with run, dash, cheer, wave, calm and gentle stumble animations. A buddy runs alongside.
- Six 3D biome worlds. Because every gate has a different topic, the world morphs to the next topic with a sparkling wave and a "Welcome to…" arch.
- 3D Power Gates carry the answer text on their panels, a lane badge (number + shape + color) and the topic emblem. Gates fly in, wait behind a shield while the question is read, then glide closer during the answer window.
- Wellness Island hub: six worlds, 30 mission stones on a spiral path with stars and locks, a Heart Tower whose badge orbs light up, and tappable world statues that read facts aloud.
- Power Facts: after every gate the explanation is shown and read in full before the next gate (in 1.3.1 the next question cut it off). "Keep running" skips ahead.
- Power Journal with all 72 facts (discovered / mastered) by topic.
- Blueprint Lab: view every model from the front, back, left, right, top or in 3D, as blueprint line art or in color, with real dimensions and a build animation. Download link for the blueprint book.
- Move Break now has a 3D hero demonstrating six moves (with seated/easier options). New Bubble Breathing activity.
- Mission celebration with confetti, animated stars and a 3D badge medal.
- Synthesized sound effects and gentle music that ducks under narration; music and effects toggles.
- Grown-up View: per-topic mastery bars and settings for narration, music, sound, reduced motion and 3D quality.
- 21-sheet blueprint book (PDF) generated from the same specs the game uses.

## Kept from 1.3.1
- 72 encounters, mission mixing, five tiers, narration + 7-second grace + 30/28/26/24/22-second windows, READ restarts, scoring, stars, badges, family activities, and the `healthy-hero-save-v1` save key.

## Fixes
- Narration is spoken in short chunks with a safety timer, so long questions are not cut off and the timer can never hang waiting for speech.
- Leaving and returning to the tab restarts the read/think/answer cycle instead of letting the timer run unseen.
- The 1.3.1 page set some styles with inline `style` attributes, which the server's CSP blocks; v2 sets them through the CSSOM. The same fix is applied to Classic mode.
- Fonts are self-hosted, so text and canvas signs look right offline.

## Compatibility
- Same Docker image layout, port 8121, health check and Cloudflare route. Cache version 2.0.0.
- Devices without WebGL are offered Healthy Hero Classic (the 1.3.1 2D game) at `/classic/`.
