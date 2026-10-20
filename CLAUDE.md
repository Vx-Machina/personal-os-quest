# CLAUDE.md: brief for Claude working on Personal OS Quest

## What this is
A personal-development RPG. You level up a hero by doing real-life quests across 9 life domains: Health, Family, Social, Love, Career, Finance, Fun, Personal Dev (`growth`), Environment. There are two modules: the **Quest board** (dailies, habits, to-dos, XP/HP/gold, shop, wheel of life) and **Life goals** (season → month → week goals, trackers, reviews, frameworks).

## Stack and running it
- A TypeScript npm-workspaces monorepo: `packages/core` (pure game rules), `server` (HTTP API, built-in `node:sqlite`), `web` (React + Vite), `bot` (discord.js v14), `sprites` (generated pixel sprites).
- **Node 22.13+ is required** (built-in SQLite). See `.nvmrc`.
- `cp .env.example .env` → `npm install` → `npm run dev` (API + web) · `npm test` (89 tests should pass) · `npm run bot` (Discord, needs a token).

## What's already built (v0.1–v0.2, see CHANGELOG.md)
- Core: XP and levels, HP damage from missed dailies at a daily reset (forgiving dailies cost no HP), streaks, gold, a shop with equipment, the 9-domain wheel, and an event log.
- Goals: season/month/week goals with RPM, WOOP, if-then and identity fields; 80/20 tasks; trackers (smoking, wake, gym 48h, run, sunlight, pomodoro, meals); progress roll-up; two-way quest sync; rewards and badges.
- Web: quest board, HUD, shop, wheel, log, task editor, settings; goals Today, Dashboard, Review, Toolkit and goal editor; Pomodoro; mobile layout.
- API: REST endpoints for players, tasks, goals, logs and journal, with schema migrations.
- Discord bot: `/quest`, `/habit`, `/stats`, `/shop`, `/buy`, `/goal`, `/today`, `/review`, `/log`.

## Who does what (avoid overlap)
Our own Claude built v0.1 to v0.2 and is still finishing a **v0.3 Discord bot polish pass**, which lands after 21:40 Paris time on 20 Oct 2026. **You work on the WEB APP side only** (`packages/web`, plus web-facing API changes in `packages/server`). **Leave `packages/bot` alone.** Pull or rebase onto v0.3 once it lands. If you need a core or server change, keep it small and additive.

## Known gaps
- There's no auth. The API is localhost-only and there are no per-player tokens.
- The web UI is functional but not yet a polished "game"; the art is placeholder generated sprites.
- There's no deploy config, and SQLite is a local file (Cloudflare will need D1 or another backend).
- HP balance with many dailies is harsh (see the CHANGELOG, "Before you use it daily").

## Web app priorities
1. **A clean, playable web UI first.** It should feel like a game: a hero scene, satisfying feedback on quest complete or level-up, and clear navigation between the Quest board and Life goals. It must be responsive and mobile-first.
2. **Auth and login.** Add per-player accounts and sessions, and replace the localhost-only assumption.
3. **Deploy readiness for Cloudflare Pages**, with the app behind Cloudflare Access (private) for now. Do the static build plus an API plan (Workers/D1 or a separate host). Don't deploy publicly.

## Art direction
Detailed, atmospheric pixel art in the style of Pixilart's "Emergency Landing 2" (https://www.pixilart.com/art/emergency-landing-2-edc7bb378fbffe7): rich scenes, moody lighting, a limited but deep palette, and crisp pixels (`image-rendering: pixelated`). Use it for hero sprites, domain scenes and backgrounds.

## Rules
- **No real personal data in the repo.** The seed is EXAMPLE DATA only. Don't add names, finances, accounts, emails or links to private docs.
- **Secrets live in `.env` only** (gitignored). Update `.env.example` with blank or example values.
- **Use small, PR-sized commits**, one concern each, with tests passing (`npm test`). Use a branch for each feature.
