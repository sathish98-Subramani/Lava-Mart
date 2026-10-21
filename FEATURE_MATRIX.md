# Lava Mart feature matrix

Status key: **Implemented in source** means code exists in this delivery; it does not mean a live production deployment was validated. **Needs external setup** means credentials, persistent hosting, or real-device verification are required.

| Requested feature | Current source status | Important caveat |
|---|---|---|
| QR room joining | Implemented in source | Invite opens the frontend with the room code prefilled; user joins. |
| Solo bot mode | Implemented in source | Predefined response strategies, not an AI model; board bots make simple random moves. |
| Real game rules | Implemented for many core types | 46 modes catalogue has varied mechanics; several social/creative modes are lightweight prompt/submission games. |
| Reliable voice chat | WebRTC mesh + signalling implemented | Needs TURN for restrictive networks; no SFU; test across networks/devices. |
| Reconnect/error handling | Implemented in source | Uses browser identity, room resume, and a short disconnect grace window. |
| Admin dashboard/moderation | Implemented in source | Set server-only `ADMIN_KEY`; host can mute/kick, admin can inspect/close rooms. |
| Offline practice | Implemented in source | Local practice and PWA cache; online rooms/social/provider features need internet. First visit must be online to cache assets. |
| Tamil/English support | Partial implementation | Core interface labels translated; all prompts/game content are not fully translated. |
| Chaos Mode / Party Marathon | Implemented in source | Chaos modifiers and catalogue rotation exist; further balancing is recommended. |
| Custom game creator | Implemented in source | Custom multiple-choice games persist in the JSON store. |
| AI-generated questions | Optional provider integration | Requires `OPENAI_API_KEY`; otherwise uses labelled sample fallback. |
| Tournaments/team battles | Implemented in source | Brackets and host advancement are basic; manually verify multi-round/bye scenarios. Team battle shows team scores. |
| XP/coins/achievements | Implemented in source | Backend profile records; JSON storage is not suitable for horizontally scaled services. |
| Friends/private messages | Implemented in source | Nickname discovery and JSON-backed DMs; not an authenticated account system. |
| Profiles/leaderboards | Implemented in source | Browser-ID profile; leaderboard uses XP. Use authentication/database before a public launch. |
| Production-ready, no bugs/lag | Not claimed | Dependency installation, production build, browser testing, network testing, and security review remain required. |
