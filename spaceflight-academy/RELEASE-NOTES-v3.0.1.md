# Spaceflight Academy v3.0.1 · High graphics fix

## Fixed

* **High graphics was far too bright.** On High (which "Auto" picks on most PCs) the glow
  effect was applied to the whole picture before brightness was balanced, so sunlit buildings,
  the hangar, white suits and the answers on the Space Rush gates bloomed into white.
  High now draws exactly the same picture as Medium and then adds a soft glow only to things
  that are meant to glow: light strips, door rings, gate rings, engine flames, sparks, the Sun
  and route lines. Text and labels never glow.
* The glow is drawn at half resolution, so High is also a little faster than before.
* Space Rush gate glow is tighter, so the answers stay easy to read.

## Unchanged

Learning rules, questions, missions, saves, Classic edition, port 8119 and the health check.
