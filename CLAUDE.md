# 과고키우기

A browser pixel-art online RPG. `docs/PLAN.md` is the source of truth: read the sections your task names before writing code. Any deviation from it gets an entry in `docs/DECISIONS.md` with the reason.

## Layout
- `apps/client` Phaser 4 + Vite. `apps/server` Colyseus rooms, simulation, persistence, HTTP API. `apps/admin` web admin.
- `packages/shared` formulas, simulation step, message types, constants. `packages/content` typed game data. `packages/art` sprite and tile sources, palette, build script, contact sheet. `packages/audio` tracker songs and effect parameter sets.
- `tools/balance-sim`, `tools/loadtest`.
- A package is created when it gets real content, never as an empty placeholder.

## Commands
- `pnpm typecheck`, `pnpm lint`, `pnpm format`, `pnpm test`
- `pnpm dev` builds the art, then runs the game server on :2567 and the client on http://localhost:5173. `pnpm build` builds the art and the client into `apps/client/dist`. The server has no build step: Node runs its TypeScript directly (`pnpm --filter @guago/server start`)
- `pnpm art:build` compiles and checks all art into `packages/art/dist`. `pnpm art:sheet` serves the contact sheet; `pnpm art:sheet --png <dir>` writes it as PNGs

## Art
- Palette, swap slots and themes live in `packages/art/src/palette.ts`; the source format (`sprite`, `variant`, `rig`, `part`, `terrain`) is documented in `packages/art/src/format.ts`. Sources go in `packages/art/src/sprites/`.
- The build fails on any check problem (palette, orphan pixels, outlines, frame jumps) and names the file, frame and pixel. Fix the art, not the check.
- `pnpm art:sheet` is the art review surface. Look at every change there at ×1 and ×4 before calling it done.

## Engineering rules
- Build order inside every feature: shared formulas and content data, then server behaviour, then client presentation.
- The server decides everything. Clients send inputs only and play instant cosmetic feedback. Positions, damage, drops and currency from a client are never trusted.
- A formula or a content definition exists once, in `shared` or `content`, and is imported by both sides.
- Phaser 4.2, Colyseus 0.18 and `@colyseus/schema` 5 are recent. Read the installed package's types and the official docs before using an API. Do not write from memory of Phaser 3 or older Colyseus.
- Tests go only where PLAN section 26 puts them: shared formulas, economic operations against a real Postgres, the deterministic replay, the load test and the balance sim. No blanket UI or smoke tests. Delete one-off tests before committing.
- Budgets in PLAN section 19 are hard. If one cannot be met, stop and report instead of building on top of it.

## No AI feel (hard rules for anything a player sees)
- No placeholder text, lorem, TODO strings, emoji, or generic web UI (rounded cards, gradients, system fonts). Everything is pixel art drawn to the 해솔 64 palette, with the Galmuri pixel font.
- No hint text, explanatory captions, disclaimers, debug labels or "Powered by" anywhere in the UI.
- All Korean copy is written in character, one register per speaker, never mixing 반말 and 존댓말, and funny where the PLAN says so.
- Every action has feedback at the values in PLAN section 6: hitstop, flash, knockback, shake, sound and particles.
- Menus open with motion and sound. Nothing pops in.
- Reference bar: Stardew Valley for movement, tiles and readability; Vampire Survivors and Brotato for hordes, hit feel and evolutions; MapleStory for town, social life and job advancement. These are quality bars, never sources: all names, art, music and levels here are original.

## Git
- Each feature is built on its own `feat/<name>` or `fix/<name>` branch in its own worktree. The orchestrator reviews it and merges it into `main`. A pull request is optional.
- Commit messages are one full sentence saying what was added or fixed. No attribution trailers, no co-author lines, no tool credits in commits or PRs.
- Work a player can see is handed over with real browser screenshots; animation or feel work with a short screen recording. Never mocks.
- If a PR is opened, its body has bullets for what was missing or broken and what was added, then a short summary of the diff.
- Never deploy to a public host or spend money.
