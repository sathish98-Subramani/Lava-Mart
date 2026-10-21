# QA checklist

## Automated checks completed in this delivery

- [x] `node --check server/index.js`
- [x] `node --check server/game-engine.js`
- [x] `node --check server/store.js`
- [x] JSX syntax/transpile check with the TypeScript JSX transpiler (not a Vite production build)
- [x] `npm test`: 6 passing backend unit tests
- [x] Catalogue smoke check: all 46 game-round builders return prompts and public rounds omit answer keys/private role containers
- [x] ZIP archive integrity checked after packaging

## Not completed in this environment

- [ ] `npm install` and Vite production build (npm registry request failed due network/DNS timeout)
- [ ] Live Socket.IO test with two clients
- [ ] Real browser tests on Android / desktop
- [ ] End-to-end WebRTC tests across different networks with TURN credentials
- [ ] Render persistent-disk test and restart persistence verification
- [ ] Provider-backed AI generation with a real API key
- [ ] Full security review / real account authentication

## Manual release gates

1. Install dependencies and run `npm test` and `npm run build`.
2. Test room create/join, duplicate answer rejection, reconnect, kick/mute, and room cleanup.
3. Test each board game by making valid and invalid moves. Try bots as opponents.
4. Test social requests/DMs with two unique browser profiles.
5. Test AI fallback and provider mode separately; verify secrets remain backend-only.
6. Verify admin endpoints reject missing/wrong keys.
7. Disable network after one online visit and confirm the app shell plus Offline Practice load.
8. Configure exact `CORS_ORIGIN`, a persistent `DATA_DIR`, HTTPS, and ICE/TURN before inviting real users.
