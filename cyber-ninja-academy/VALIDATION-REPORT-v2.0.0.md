# Cyber Ninja Academy 2.0.0 — Validation Report

## Passed source checks

- 7/7 Combat 2.0 source tests passed.
- TypeScript/TSX transpile diagnostics passed for `ninja-engine.ts`, `CyberNinja.tsx`, and `layout.tsx`.
- CSS parsed successfully with PostCSS.
- Portal metadata parses as JSON and reports version 2.0.0.
- Health endpoint remains `cyber-ninja-ok`.
- Package-lock dependency graph matches the original known-good release exactly after normalizing only the application version fields.
- Babylon.js remains 9.19.1, Vite remains 8.0.13, and Vinext remains 0.0.50.

## Obstacle pacing audit

The old build attempted an encounter every 13 meters. Combat 2.0 replaces that with mission-scaled spacing. Approximate base encounter spacing/reaction time before small deterministic variation:

| Mission | Spacing | Approx. reaction time |
|---|---:|---:|
| 1 | 32.8 m | 2.56 s |
| 2 | 34.9 m | 2.64 s |
| 3 | 32.7 m | 2.39 s |
| 4 | 32.7 m | 2.33 s |
| 5 | 31.4 m | 2.17 s |
| 6 | 30.7 m | 2.06 s |
| 7 | 29.9 m | 1.95 s |
| 8 | 29.4 m | 1.87 s |
| 9 | 28.5 m | 1.77 s |
| 10 | 28.0 m | 1.69 s |
| 11 | 27.0 m | 1.59 s |
| 12 | 26.7 m | 1.53 s |

The course adds only small deterministic jitter to avoid robotic spacing.

## Strike readability checks

Verified in source:

- concentric strike ring
- outer rotating ring
- crossed slash emblem
- violet idle target state
- orange lock-on state
- cyan ready-to-strike state
- `TARGET LEFT/RIGHT` lane guidance
- `LOCKING TARGET` warning
- `STRIKE NOW` attack-window prompt
- oversized mobile sword/STRIKE control

## Strike animation checks

Verified in source:

- 620 ms multi-stage attack window
- Photon Edge blade-pivot sweep
- body turn and attacking arm motion
- forward dash
- three energy blade afterimages
- camera FOV punch
- hit-stop on successful drone strike
- camera impact shake
- cyan/magenta spark bursts
- procedural strike/impact audio

## Environment limitation

The isolated packaging environment did not complete a fresh `npm ci` within the bounded network window, so the final Vinext production build is intentionally left to the included Docker deployment on the Ubuntu game server. The dependency lock itself was verified against the original known-good lockfile to avoid the lock corruption issue encountered in an earlier game release.
