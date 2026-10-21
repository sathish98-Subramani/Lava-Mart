# Lava Mart implementation notes

The current source includes the broad feature set requested by the user and a basic implementation for each area. It should not be described as a fully production-verified release: the environment could not download npm dependencies, so a real Vite build and live network testing still need to be run.

## Current implementation architecture

- `shared/games.js`: canonical 46-mode catalogue plus sample question/prompt banks.
- `client/`: React + Vite interface, QR invites, online lobby, game controls, room chat, WebRTC peer mesh, profile/social pages, creator/AI generator, admin page, and service worker.
- `server/index.js`: Express, Socket.IO room state, reconnection grace period, room moderation, matchmaking/round flow, voice signalling, social events, custom games, admin events, leaderboard API, and question generation API.
- `server/game-engine.js`: server-side round creation/scoring for the different game kinds, board winners, and tournament bracket helper.
- `server/store.js`: file-based persistence for profiles, friend lists/requests, DMs, custom games, tournaments, and moderation log.
- `server/test/`: Node's built-in test runner tests for catalogue count, privacy redaction, scoring, word-chain constraints, board winners, and brackets.

## Hardening steps recommended after installation

1. Install packages and run the production client build and automated tests.
2. Replace JSON storage with PostgreSQL or another durable database before multiple server instances or public scale.
3. Add proper sign-in/identity verification, permissions, and secure account recovery if profiles/DMs are public-facing.
4. Use a TURN service with short-lived credentials for voice; a media SFU is recommended for larger rooms.
5. Add broad end-to-end tests for every game type, browser compatibility, reconnects, tournament byes, and bot combinations.
6. Expand Tamil localization to questions, game prompts, error strings, and social/admin views.
7. Apply strong request/socket quotas, monitoring, backups, abuse reporting, and security review before a public launch.

## Configuration reference

See `.env.example` and `README.md` for the full local, Render, and Vercel setup.
