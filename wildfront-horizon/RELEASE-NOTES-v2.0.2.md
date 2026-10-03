# Wildfront Horizon 2.0.2 — Reliable Hit Registration

- Fixes the chest-shot raycast problem where the torso mesh could hide the internal chest mesh.
- Visible upper torso + shoulder now count as the intended vital center-mass zone.
- Removes the random placement-failure roll after a confirmed vital contact.
- Any registered body hit immediately stops normal walking and plays a strong stagger before fleeing.
- Vital hits stop the animal immediately and keep the knockdown visible for about one second before cleanup.
- Updates tutorial language to match the visible target area.
