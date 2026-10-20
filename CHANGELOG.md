# Changelog

## 0.2.0 · 2026-10-20 · Life goals module

A second module in the same app. It shares the core, the database, the nine domains and the hero. Switch between **Quest board** and **Life goals** under the hero.

### In this release

- **Goals core** (`packages/core/src/goals`):
  - **Goal levels.** Season (90 days), month milestone and week target, each with a domain and an RPM block, "easy" note, WOOP, if-then plans and identity line.
  - **Tasks.** Tasks have 80/20 flags, due dates, top 3 and pomodoro counts.
  - **Trackers.** Smoking (smoke-free days, cigarettes/day, cravings, money only once prices are set), wake (on-time streak, weekly averages), gym (rolling 48h with ok/due/overdue), run, sunlight (minutes after waking), pomodoros and meals (on-time window plus healthy).
  - **Progress roll-up.** Measured by the tracker, or by averaging children and tasks, with a pace estimate.
  - **Quest sync.** Push a task and it becomes a to-do with two-way ticks; tracker logs complete their quest, and ticking the quest adds a log.
  - **Rewards.** Pomodoros, protocols, rituals and reviews pay once per period, and badges once ever.
  - **Validation and seed.** Validation for every input, plus the seed.
- **Frameworks**, each with a tooltip:
  - Robbins RPM and yearly wheel of life review.
  - Ferriss 80/20, "what if it were easy?", fear-setting and lead domino.
  - Ikigai, kaizen, hansei and Ichigo ichie.
  - Huberman-style protocol checks, labelled "general wellbeing habits, not medical advice".
  - If-then plans, habit stacking, WOOP, identity statement, and a mood/energy check-in.
- **API**: a GoalService on the same transaction, lazy reset and event log. Schema migration v2 adds goals, goal tasks, logs, journal and `tasks.forgiving`. New endpoints cover goals, goal tasks, logs and journal (see README).
- **Web**:
  - **Today:** top 3, lead domino, Pomodoro timer that survives reloads, check-in, notes, seven tracker cards, protocols, recent entries with undo.
  - **Goals:** season ring, streak tiles, goal cards, and a 12-week wheel history as small multiples.
  - **Review:** week numbers, hansei, 80/20, lead domino, next week's targets, yearly review.
  - **Toolkit:** identity and stacks, ikigai map, fear-setting, settings.
  - **Goal editor.** Mobile layout throughout.
  - Quest cards show their goal and the gym alert.
- **Discord**: `/goal list`, `/goal progress <id>`, `/today`, `/review` (hansei notes optional), and `/log` with wake, sun, run, gym, meal, craving, smoke, pomodoro and mood.
- **RPG changes**:
  - **Forgiving dailies:** a miss breaks the streak but costs no HP. They're used for "Smoke-free today", and a slip shows "reset and keep going".
  - Goal rewards appear in the adventure log.
- **Seed**: seven example season goals (EXAMPLE DATA) with month and week children, and linked quests: 6 dailies and the gym habit. Purpose, WOOP and identity are left blank for you.
- **Tests**: 89 (core 57, API 19, bot 13). New ones cover roll-up, quest sync both ways, trackers, rewards and refunds, and validation.

### Decisions you may want to change

These are defaults, not facts about you. All of them are editable in the app.

- **Seeded values.**
  - Domains: everything is Health except pomodoros (Career).
  - Defaults: pomodoro target 4/day, wake grace 15 min, bedtime 00:00 for the sleep-window check, meals 09:00 / 12:30 / 19:30 ± 60 min.
- **Smoking counter.**
  - The counter starts from your first smoke-free log or tick. It does not start from install day.
  - Money saved stays hidden until you enter cigarettes/day, pack price and pack size. No price is assumed.
- **Pushed tasks.** Deleting a pushed goal task also deletes its quest. Ticking an unpushed task pays no XP.
- **`/log`.** You didn't ask for the `/log` command. It's there so trackers can be filled from the phone.

### Before you use it daily

- **HP balance.** The schedule and goal quests together make 19 dailies. Missing all of them costs 44 of 50 HP; missing a third costs about 15 HP a day. Options: make more of them forgiving, lower some difficulties, or merge overlaps.
- **Overlaps.**
  - "Gym or work" (schedule) and the "Gym session" habit both track the gym.
  - "Training / sports" and "Run" both track training.
  - Suggest keeping one of each pair.

### Verification notes (build environment)

The npm registry was still unreachable, so the same limits as 0.1.0 apply:

- 89/89 tests pass on Node 22.22.
- `tsc` passes for every package against real Hono, React 19 and discord.js 14.27 typings.
- The web app was bundled with esbuild and driven end to end in headless Chromium, with no console errors. The flows covered were:
  - wake, run, craving, smoke counter, meals, a protocol and a pomodoro
  - push a task, then tick it on the quest board for XP
  - hansei, next week's targets, smoking prices, and the money shown
- Screenshots come from a simulated week (generated data).
- Not run here: Vite itself, a real `npm install`, or a live Discord connection.

## 0.1.0 · 2026-10-20 · MVP

### In this release

- **Shared core** (`packages/core`): XP and gold by difficulty with a capped streak bonus; level curve (100 × L^1.5); HP damage for missed dailies and `−` habits; fainting (−1 level, −50% gold, HP refill); exact undo; nine life-domain stats; time-zone aware game day with a configurable reset (default 04:00 Europe/Paris, DST-safe); day streak with a completion threshold; mercy rule for days away; rest mode; shop rules; input validation; seed templates.
- **API** (`packages/server`): Hono + built-in SQLite. Players, tasks, rewards and an event log. Lazy reset on every request plus a background tick each minute. Discord user → player mapping, owner link to the local hero. Avatar rendered as PNG. Serves the built web app on the same port.
- **Web** (`packages/web`): Vite + React SPA. HUD with layered pixel avatar, HP/XP bars, gold, day streak and reset countdown; dailies (time slots, weekdays, streaks), habits (+/−), to-dos; quick add and full editor; wheel of life (7 days / all time) with a stat table; rewards shop and gear (level-locked hats, weapons, pets, potions); adventure log; settings (name, time zone, reset time, streak threshold, rest mode, manual reset, players). Level-up / faint cards, toasts, new-day banner. Mobile layout with bottom tabs.
- **Discord** (`packages/bot`): discord.js v14 slash commands `/quest list|done|undo|add`, `/habit`, `/stats`, `/shop`, `/buy`, `/daily-reset`, with autocomplete. Token from `DISCORD_TOKEN` only. Private replies by default.
- **Sprites**: 16×16 art drawn as palette grids and encoded to PNG sheets in code (`npm run sprites`); generated outlines that sit under other layers so gear never covers the face.
- **Seed**: the 8-block daily schedule and 5 daily essentials, sample habits, to-dos and rewards.
- **Tests**: 55 (core 37, API 8, bot 10).

### Verification notes (build environment)

The npm registry was not reachable while this was built, so the exact dependency versions you will install were not run here:

- Core, API and bot logic: run and tested (55/55 passing on Node 22.22). The API ran against Hono 4.13.13 and @hono/node-server 2.1.5 built from their source.
- Type checks: all packages pass `tsc` (TypeScript 6.0). The web app was checked against React 19 types; the bot against discord.js 14.27 typings.
- Web app: bundled with esbuild (not Vite) and driven in headless Chromium, desktop and mobile; screenshots removed from the handoff (they showed real data). `vite.config.ts` itself was not executed.
- Discord: command JSON validated against Discord's documented limits and every handler tested against the real API in-process. The bot has not connected to Discord (no token, no network).

First thing to do on your machine: `npm install && npm test && npm run dev`, then `npm run bot`.

## Next (proposals, not built)

**Goals module**
- Reminders: a DM or browser notification for wake, meals, sunlight window and the 48h gym limit.
- Craving timer: a 5-minute guided breathing/walk screen started from "Log a craving".
- Export: CSV/JSON of logs and journal, for your own analysis or a coach.
- Trends: wake time and cigarettes/day over the whole season, not just 2 weeks.
- Goal templates for the other domains (Finance, Love, Family…) so the wheel isn't Health-heavy.

**Before using it with other people**
- Auth: an API key or per-player tokens, so the API can listen beyond localhost; a `/link` command to pair Discord and web without editing `.env`.
- Goals are personal: decide what (if anything) other players should see.

**Gameplay**
- Tune the numbers after a week of real use (damage vs. 19 dailies, gold prices, level pace).
- Dailies every N days or N times per week; due dates and checklists on to-dos; drag-and-drop ordering.
- Habit strength colours (Habitica-style task value drift).
- Weekly review: per-domain history chart and a "next week, focus on…" prompt from the weakest domains.
- Boss fights or party challenges for accountability with a community.

**Discord**
- Buttons on `/quest list` to check off without typing ids.
- Opt-in morning digest and time-slot reminders by DM (e.g. "Work block 10:00-12:00 starts now").
- Server leaderboard and shared quests for the community.

**Polish**
- More gear, hair and skin options, a few animation frames.
- Installable PWA with offline caching and notifications.
- Import from Habitica; calendar sync for the time-slot dailies.
