# Lava Mart — Multiplayer Party Games (updated project)

React + Vite frontend, Node.js + Express + Socket.IO backend, and a shared catalogue of 46 party-game modes. This package upgrades the earlier starter into a more complete feature build. It has automated backend unit tests; a production browser build and live network/device test still need to be run after dependencies are installed in your own environment.

## Features included in this source

### Rooms and playing
- 46 named game modes with separate round types for trivia, multiple choice, word chain, memory sequence, math, scrambled words, typing, forbidden words, reactions, Tic-Tac-Toe, Rock Paper Scissors, Connect Four, number guessing, codebreaker, drawing/guessing, secret roles, treasure clues, auctions, obstacle lanes, target taps, and more.
- Six-character room codes; QR codes and shareable invite URLs; a guest enters a nickname then joins from the invite.
- Host-controlled rounds, a 12-player room limit, answer validation, room chat, scores, and simulated bot players.
- Reconnect/resume by browser profile ID and room code, with a grace window for brief connection loss.
- Chaos Mode, Party Marathon (rotates through the catalogue), and team-score display.
- Two-player-turn-based Tic-Tac-Toe and Connect Four board modes.
- Admin overview and close-room control, plus host mute/kick actions.

### Voice
- Browser microphone permission, Socket.IO signalling, and WebRTC peer-to-peer audio for online room members.
- STUN configuration by default and optional `VITE_ICE_SERVERS` configuration for a TURN service.
- Voice is mesh peer-to-peer, so it is intended for small groups; a TURN service is important for users behind restrictive NAT/firewalls. Reliable cross-network voice is not guaranteed until it is tested with your real deployment and TURN configuration.

### Profiles and social features
- Browser-ID profiles with display name, avatar, bio, XP, coins, levels, games played, wins, and achievements.
- Server-backed leaderboard and achievement tracking.
- Friend requests by nickname, friend list, and private messages between accepted friends.
- JSON file persistence in `server/data/store.json` by default. Mount persistent storage for production hosting; see the limitations section.

### Custom games and AI question generator
- Create and save custom multiple-choice games, shared through the server.
- Question-generator endpoint supports an OpenAI-compatible Chat Completions API when server credentials are configured.
- Without an AI API key, the generator clearly reports that it is using a built-in sample-question fallback. That fallback is not AI-generated.

### Offline and language support
- Offline practice for all catalogue selections with browser-local practice XP; a service worker caches the application shell and same-origin assets after the first successful online visit.
- Main navigation, setup, actions, and many labels are available in English and Tamil. The content/prompts are not yet fully translated into Tamil.
- Responsive mobile layout.

## Important limitations before a public launch

This delivery was produced in an environment where `npm install` could not reach the npm registry, so **a Vite production build and live multiplayer test could not be completed here**. The server-side unit tests and JSX syntax-transpilation checks pass, but that is not the same as validating a production deployment. Run the checks below before sharing a public URL.

Other real deployment limits:
- Voice uses WebRTC mesh. Set up TURN credentials with a provider if you need more dependable voice connections across different networks. Do not use long-lived TURN secrets in a public frontend build; prefer provider-issued temporary credentials where available.
- Profiles, friends, messages, and custom games use a JSON store. It is suitable for a small demo/single backend instance, not a horizontally scaled public service. Render's local filesystem is ephemeral unless you attach a persistent disk and set `DATA_DIR` to its mount path. Back up the data file.
- Browser-ID profiles are not a full login/authentication system. Do not store sensitive user data or rely on them as verified identities.
- A subset of party games are lightweight prompt/vote modes rather than production-polished, fully animated standalone games. Bots use predefined sample strategies and are not live AI opponents.
- The AI generator calls a provider only when `OPENAI_API_KEY` is configured. Without it, the endpoint intentionally falls back to sample questions.
- Rate limits and input validation are basic protections. Before a large public launch, add proper account authentication, persistent database storage, monitoring, stronger abuse controls, and a security review.

## Requirements

- Node.js 20 or later
- npm
- Network access to install the npm dependencies the first time

## Local setup (Windows / macOS / Linux)

Open a terminal in the folder that contains this `package.json`, then run:

```bash
npm install
npm test
npm run dev
```

- Frontend: `http://localhost:5173`
- Backend health check: `http://localhost:4000/health`
- Backend API information: `http://localhost:4000/`

For a production frontend build:

```bash
npm run build
```

For the backend only:

```bash
npm start
```

Use a `.env` file or hosting environment variables for deployment settings. Start from `.env.example` and never commit real API keys or admin secrets.

## Deploy the backend to Render

1. Push the entire `lava-mart-updated` folder (including `shared/`) to a GitHub repository.
2. In Render, create a **Web Service** for that repository.
3. Set **Root Directory** to `server`, **Build Command** to `npm install`, and **Start Command** to `npm start`.
4. Set these backend environment variables:
   - `NODE_ENV=production`
   - `CORS_ORIGIN=https://YOUR-FRONTEND.vercel.app` (replace with the exact deployed frontend origin; comma-separate origins if you use more than one)
   - `ADMIN_KEY=` a long random secret, if you want to use the admin dashboard
   - `OPENAI_API_KEY=` optional, for provider-generated questions
   - `AI_MODEL=gpt-4o-mini` optional; change to a model supported by your provider
   - `DATA_DIR=/var/data` only if you have mounted a Render persistent disk at `/var/data`; otherwise leave it unset or use a directory in the service filesystem, knowing that free/ephemeral storage can be lost
5. Set health check path to `/health` if prompted.
6. Once deployed, visit `https://YOUR-RENDER-SERVICE.onrender.com/health`. It should return JSON containing `"ok": true`.

The backend imports the shared catalogue at `../shared/games.js`, so deploy from the **whole repository**; do not upload only the `server` subfolder without `shared/`.

## Deploy the frontend to Vercel

1. Import the same repository into Vercel.
2. Set **Root Directory** to `client` and Framework Preset to **Vite**.
3. Build Command: `npm run build`; Output Directory: `dist`.
4. Add this frontend environment variable:
   - `VITE_SOCKET_URL=https://YOUR-RENDER-SERVICE.onrender.com`
5. Optional voice ICE configuration: set `VITE_ICE_SERVERS` to valid JSON for your STUN/TURN provider, for example:

```json
[{"urls":"stun:stun.l.google.com:19302"}]
```

For more reliable voice, ask your voice/TURN provider for the exact ICE configuration, ideally using temporary TURN credentials. The sample STUN-only configuration is not enough for every network.

6. Deploy and copy the final Vercel origin into Render's `CORS_ORIGIN`, then redeploy the backend if you changed it. If you use a custom domain, set the exact custom-domain origin there too.

## Final smoke test (two devices recommended)

1. Visit the backend `/health` endpoint.
2. Open the frontend on two separate browsers/devices. Create a room on device A and join with its code on device B.
3. Start a trivia round, submit answers from both devices, and confirm results and scores update.
4. Create a bot room and try a few rounds.
5. Test Tic-Tac-Toe, Connect Four, Word Chain, Memory Match, codebreaker, and drawing.
6. Toggle Chaos Mode, Party Marathon, and Team Battle.
7. Test QR invite link in a private/incognito browser; make sure it joins the intended room.
8. Enable voice on two devices and test on different networks. If no audio connection forms, configure TURN and inspect browser console/network logs.
9. Create a custom game; test the AI generator both with and without a provider key.
10. Try a friend request, accept it from another profile, and exchange a private message.
11. Install/visit the app online once, then test Offline Practice with network disabled.
12. Run `npm test` and `npm run build` after installation before calling the release ready.

See `FEATURE_MATRIX.md` for the feature-by-feature status and `QA_CHECKLIST.md` for verification details.
