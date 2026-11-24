# Decisions

Deviations from `docs/PLAN.md` and the reason for each. Newest last.

| Date | PLAN reference | Deviation | Reason |
|---|---|---|---|
| 2026-11-25 | §25 M0, "deployed skeleton on the VPS" | M0 is verified in a local browser. No VPS, Docker Compose or Caddy config is built yet | No host has been chosen (PLAN §27 open item 4), deploys to a public host need Andy's go-ahead, and Docker is not installed on the build machine, so a compose file could not be tested. It is built when a host exists |
| 2026-11-25 | §19 repository layout | Packages are added when they get real content | Empty placeholder packages add noise and drift |
