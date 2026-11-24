# Decisions

Deviations from `docs/PLAN.md` and the reason for each. Newest last.

| Date | PLAN reference | Deviation | Reason |
|---|---|---|---|
| 2026-11-25 | §25 M0, "deployed skeleton on the VPS" | M0 is verified in a local browser. No VPS, Docker Compose or Caddy config is built yet | No host has been chosen (PLAN §27 open item 4), deploys to a public host need Andy's go-ahead, and Docker is not installed on the build machine, so a compose file could not be tested. It is built when a host exists |
| 2026-11-25 | §19 repository layout | Packages are added when they get real content | Empty placeholder packages add noise and drift |
| 2026-11-25 | §16 sprite source format example | `anim` takes `{ frames, fps }` per animation instead of one shared `fps` | Animations of one sprite run at different speeds (idle 3, hop 10, death 12) |
| 2026-11-25 | §16 characters, "hair and jacket colors use a palette lookup shader" | Slot pixels are written as reserved key colours and swapped when the client composites a look; hands are drawn in the sleeve pieces with the skin slot | Layers composite back to front, so a hand drawn in the body layer would be hidden by the uniform; key colours keep any recolouring method open for the client |
| 2026-11-25 | §16 outline rule | Outline pixels must be the darkest step of a ramp the sprite uses; the ground shadow layer and `lone` characters (eyes, sparkles, debris) skip the outline and orphan checks | A 1 px dark sole or pupil is correct pixel art and would otherwise fail |
