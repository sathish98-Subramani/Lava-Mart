import express from 'express';
import cors from 'cors';
import http from 'node:http';
import { randomInt, randomUUID } from 'node:crypto';
import { Server } from 'socket.io';
import { games as builtInGames, sampleQuestions } from '../shared/games.js';
import { createRound, publicRound, getPrivateRound, scoreAnswer, resolveCompetitiveRound, checkBoardWinner, createBracket, getGame } from './game-engine.js';
import { getStore, saveStore, ensureProfile, addXp, patchProfile, publicProfile, normaliseUsername } from './store.js';

const app = express();
const server = http.createServer(app);
const store = getStore();
const port = Number(process.env.PORT) || 4000;
const allowedOrigins = (process.env.CORS_ORIGIN || '').split(',').map((v) => v.trim()).filter(Boolean);
const corsOrigin = allowedOrigins.length ? allowedOrigins : true;
app.use(cors({ origin: corsOrigin, credentials: false }));
app.use(express.json({ limit: '40kb' }));
app.disable('x-powered-by');
const io = new Server(server, {
  cors: { origin: corsOrigin, methods: ['GET', 'POST'] },
  maxHttpBufferSize: 1e6,
  pingInterval: 25000,
  pingTimeout: 20000,
  connectionStateRecovery: { maxDisconnectionDuration: 120000, skipMiddlewares: true },
});

const rooms = new Map();
const onlineByPlayer = new Map();
const rateBuckets = new Map();
const MAX_PLAYERS = 12;
const ROOM_TTL_MS = 45_000;
const clean = (v, max = 300) => String(v ?? '').normalize('NFKC').trim().replace(/[<>\u0000-\u001F]/g, '').slice(0, max);
const safeCode = (v) => clean(v, 8).toUpperCase().replace(/[^A-Z0-9]/g, '');
const isSafeId = (v) => /^[\w-]{8,80}$/.test(String(v || ''));
const clamp = (n, min, max) => Math.max(min, Math.min(max, Number(n) || 0));
const randomPick = (a) => a[randomInt(a.length)];

function rateLimit(key, max = 30, windowMs = 10_000) {
  const now = Date.now(); const current = rateBuckets.get(key);
  if (!current || now - current.start > windowMs) { rateBuckets.set(key, { start: now, count: 1 }); return true; }
  current.count += 1; return current.count <= max;
}
function createCode() {
  let code;
  do { code = randomInt(36 ** 6).toString(36).toUpperCase().padStart(6, '0'); } while (rooms.has(code));
  return code;
}
function getPlayer(socket) {
  const id = socket.data.playerId;
  const code = socket.data.room;
  const room = rooms.get(code);
  const player = room?.players.get(id);
  return player ? { room, player } : null;
}
function onlinePlayers(room) {
  return [...room.players.values()].filter((p) => p.isBot || p.online);
}
function activeCount(room) { return onlinePlayers(room).length; }
function publicRoom(room) {
  const tournament = room.tournament ? {
    id: room.tournament.id,
    round: room.tournament.round,
    matches: room.tournament.matches,
    champion: room.tournament.champion,
    teamBattle: room.settings.teamBattle,
  } : null;
  return {
    code: room.code, hostId: room.hostId, gameId: room.gameId, started: room.started,
    round: room.round, roundData: publicRound(room.currentRound),
    players: [...room.players.values()].map((p) => ({ id: p.id, name: p.name, avatar: p.avatar || '🙂', isBot: p.isBot, online: Boolean(p.online), team: p.team || null, muted: Boolean(p.muted), isHost: p.id === room.hostId })),
    scores: room.scores, answerCount: room.answers.size,
    answers: room.showAnswers ? [...room.answers.values()] : [],
    settings: room.settings, resultMessage: room.resultMessage || '',
    tournament,
  };
}
function updateRoom(room) { io.to(room.code).emit('room:update', publicRoom(room)); }
function errorTo(socket, message) { socket.emit('room:error', message); }
function findSocketForPlayer(id) { const socketId = onlineByPlayer.get(id); return socketId ? io.sockets.sockets.get(socketId) : null; }
function emitPrivateRounds(room) {
  for (const player of room.players.values()) {
    if (!player.isBot && player.online && player.socketId) {
      const personal = getPrivateRound(room.currentRound, player.id);
      if (personal) io.to(player.socketId).emit('game:private', personal);
      else io.to(player.socketId).emit('game:private', null);
    }
  }
}
function leaveRoom(socket, code, immediate = true) {
  const room = rooms.get(code); if (!room) return;
  const playerId = socket.data.playerId;
  const player = room.players.get(playerId);
  if (player && (player.socketId === socket.id || immediate)) {
    room.players.delete(playerId); delete room.scores[playerId]; room.answers.delete(playerId);
    if (onlineByPlayer.get(playerId) === socket.id) onlineByPlayer.delete(playerId);
  }
  socket.leave(code);
  if (socket.data.room === code) delete socket.data.room;
  if (![...room.players.values()].some((p) => !p.isBot)) { rooms.delete(code); return; }
  if (room.hostId === playerId) room.hostId = [...room.players.values()].find((p) => !p.isBot && p.online)?.id || [...room.players.values()].find((p) => !p.isBot)?.id || null;
  updateRoom(room);
}
function joinRoom(socket, { code, name, playerId }, resume = false) {
  code = safeCode(code);
  const room = rooms.get(code);
  if (!room) return errorTo(socket, 'Room not found. Check the room code or create a new room.');
  playerId = isSafeId(playerId) ? String(playerId) : (isSafeId(socket.data.playerId) ? socket.data.playerId : randomUUID());
  const displayName = clean(name, 24) || 'Player';
  const oldRoomCode = socket.data.room;
  if (oldRoomCode && oldRoomCode !== code) leaveRoom(socket, oldRoomCode);
  if (!room.players.has(playerId) && room.players.size >= MAX_PLAYERS) return errorTo(socket, `This room is full (${MAX_PLAYERS} players maximum).`);
  const previous = room.players.get(playerId);
  if (previous?.socketId && previous.socketId !== socket.id) {
    const oldSocket = io.sockets.sockets.get(previous.socketId);
    if (oldSocket) { oldSocket.leave(code); delete oldSocket.data.room; }
  }
  const profile = ensureProfile(playerId, displayName);
  room.players.set(playerId, {
    id: playerId, name: clean(profile.name || displayName, 24), avatar: profile.avatar || '🙂',
    isBot: false, online: true, socketId: socket.id, muted: previous?.muted || false,
    team: previous?.team || (room.settings.teamBattle ? (room.players.size % 2 ? 'A' : 'B') : null),
  });
  room.scores[playerId] ??= 0;
  room.profileCoins[playerId] = profile.coins ?? 50;
  socket.data.playerId = playerId; socket.data.room = code; socket.join(code); onlineByPlayer.set(playerId, socket.id);
  socket.emit('profile:loaded', { profile: publicProfile(profile), friends: friendList(playerId), requests: incomingRequests(playerId) });
  socket.emit('room:update', publicRoom(room));
  if (room.started && room.currentRound) {
    socket.emit('game:round', { ...publicRound(room.currentRound), roomCode: code });
    const privateData = getPrivateRound(room.currentRound, playerId); if (privateData) socket.emit('game:private', privateData);
  }
  updateRoom(room);
  if (resume) socket.emit('room:notice', 'Reconnected to your previous room.');
  return true;
}
function createRoom(socket, payload = {}) {
  if (socket.data.room) leaveRoom(socket, socket.data.room);
  const playerId = isSafeId(payload.playerId) ? String(payload.playerId) : (isSafeId(socket.data.playerId) ? socket.data.playerId : randomUUID());
  const name = clean(payload.name, 24) || 'Player';
  const profile = ensureProfile(playerId, name);
  const code = createCode();
  const settings = {
    chaos: Boolean(payload.chaos), marathon: Boolean(payload.marathon), teamBattle: Boolean(payload.teamBattle),
    language: payload.language === 'ta' ? 'ta' : 'en', maxPlayers: MAX_PLAYERS,
  };
  const room = {
    code, hostId: playerId, gameId: String(payload.gameId || 1), started: false, round: 0,
    players: new Map(), scores: {}, answers: new Map(), showAnswers: false, currentRound: null,
    resultMessage: '', profileCoins: {}, settings, previousStory: 'Once', tournament: null, createdAt: Date.now(),
  };
  room.players.set(playerId, { id: playerId, name: clean(profile.name || name, 24), avatar: profile.avatar || '🙂', isBot: false, online: true, socketId: socket.id, muted: false, team: settings.teamBattle ? 'A' : null });
  room.scores[playerId] = 0; room.profileCoins[playerId] = profile.coins ?? 50;
  const botNames = ['Bot Nova', 'Bot Pixel', 'Bot Mango', 'Bot Comet', 'Bot Echo', 'Bot Mochi'];
  const botCount = clamp(payload.botCount, 0, 6);
  for (let i = 0; i < botCount && room.players.size < MAX_PLAYERS; i++) {
    const id = `bot-${code}-${i + 1}`;
    room.players.set(id, { id, name: botNames[i], avatar: '🤖', isBot: true, online: true, socketId: null, muted: false, team: settings.teamBattle ? (room.players.size % 2 ? 'B' : 'A') : null });
    room.scores[id] = 0; room.profileCoins[id] = 50;
  }
  rooms.set(code, room);
  socket.data.playerId = playerId; socket.data.room = code; socket.join(code); onlineByPlayer.set(playerId, socket.id);
  socket.emit('profile:loaded', { profile: publicProfile(profile), friends: friendList(playerId), requests: incomingRequests(playerId) });
  socket.emit('room:update', publicRoom(room)); updateRoom(room);
  return room;
}
function getCurrentGame(room) { return getGame(room.gameId, store.customGames); }
function getRoundNeededCount(room) { return activeCount(room); }
function finishRound(room) {
  if (!room.currentRound || room.showAnswers) return;
  room.showAnswers = true;
  room.resultMessage = resolveCompetitiveRound(room.currentRound, room);
  const kind = room.currentRound.kind;
  if (['vote', 'mafia', 'spyfall', 'impostor', 'character'].includes(kind)) {
    const counts = new Map();
    for (const a of room.answers.values()) counts.set(String(a.answer), (counts.get(String(a.answer)) || 0) + 1);
    const winner = [...counts.entries()].sort((a, b) => b[1] - a[1])[0];
    if (winner) room.resultMessage += ` Most votes: ${room.players.get(winner[0])?.name || winner[0]}.`;
  }
  if (room.currentRound.kind === 'number-guess' && room.currentRound.meta.solved) room.resultMessage += ' The number was guessed!';
  if (room.currentRound.kind === 'codebreaker') room.resultMessage += ` Code: ${room.currentRound.meta.secretCode}.`;
  if (room.currentRound.kind === 'number-guess') room.resultMessage += ` Secret number: ${room.currentRound.meta.secretNumber}.`;
  if (room.currentRound.answerKey && ['trivia','puzzle','escape','emoji','song','logo','riddle','sound-clue','math','scramble','typing','custom-trivia','detective','treasure','drawing'].includes(room.currentRound.kind)) room.resultMessage += ` Answer: ${room.currentRound.answerKey}.`;
  const answered = [...room.answers.values()];
  const maximum = Math.max(0, ...answered.map((a) => Number(a.points) || 0));
  const roundLeaders = maximum > 0 ? answered.filter((a) => (Number(a.points) || 0) === maximum).map((a) => a.id) : [];
  for (const p of room.players.values()) {
    if (p.isBot || !room.answers.has(p.id)) continue;
    const won = roundLeaders.includes(p.id) && room.players.size > 1;
    const { profile, newAchievements } = addXp(p.id, won ? 20 : 10);
    if (won) profile.wins += 1;
    room.profileCoins[p.id] = profile.coins;
    const sock = p.socketId ? io.sockets.sockets.get(p.socketId) : null;
    if (sock) sock.emit('profile:updated', { profile: publicProfile(profile), newAchievements });
  }
  saveStore();
  io.to(room.code).emit('game:result', {
    room: publicRoom(room), resultMessage: room.resultMessage, answerKey: room.currentRound.answerKey || null,
    scores: room.scores, answers: [...room.answers.values()], round: room.round,
  });
  updateRoom(room);
}
function maybeFinish(room) {
  if (!room.currentRound || room.showAnswers) return;
  const kind = room.currentRound.kind;
  if (['tic-tac-toe', 'connect-four'].includes(kind)) return;
  if (room.answers.size >= getRoundNeededCount(room)) finishRound(room);
  else updateRoom(room);
}
function sendGameFeedback(socket, feedback) { socket.emit('game:feedback', feedback); }
function submitAnswer(socket, rawValue) {
  const context = getPlayer(socket); if (!context) return errorTo(socket, 'Join a room before answering.');
  const { room, player } = context;
  if (!room.started || !room.currentRound) return errorTo(socket, 'Start a round before submitting.');
  if (room.showAnswers) return errorTo(socket, 'This round is finished. Start the next round.');
  if (player.muted) return errorTo(socket, 'You are currently muted by the room host.');
  const kind = room.currentRound.kind;
  if (['tic-tac-toe', 'connect-four'].includes(kind)) return makeBoardMove(socket, room, player, rawValue);
  const feedback = scoreAnswer(room.currentRound, player, rawValue, room);
  if (kind !== 'number-guess') sendGameFeedback(socket, feedback);
  if (!feedback.ok) return;
  if (kind === 'story') room.previousStory = room.currentRound.meta.story;
  if (kind === 'number-guess' && !feedback.correct) {
    room.answers.delete(player.id);
    room.currentRound.meta.guesses ??= {};
    room.currentRound.meta.guesses[player.id] = (room.currentRound.meta.guesses[player.id] || 0) + 1;
    const attempts = room.currentRound.meta.guesses[player.id];
    if (attempts >= 5) room.answers.set(player.id, { id: player.id, name: player.name, answer: `${rawValue} (attempt limit reached)`, points: 0 });
    socket.emit('game:feedback', { ...feedback, message: `${feedback.hint} (${attempts}/5 guesses)` });
    maybeFinish(room); return;
  }
  if (kind === 'codebreaker' && feedback.hint && !feedback.correct) socket.emit('game:feedback', { ...feedback, message: feedback.hint });
  if (kind === 'codebreaker' && !feedback.correct) {
    // Allow up to five attempts by removing this attempt from the turn barrier.
    room.answers.delete(player.id);
    room.currentRound.meta.guesses ??= {};
    room.currentRound.meta.guesses[player.id] = (room.currentRound.meta.guesses[player.id] || 0) + 1;
    if (room.currentRound.meta.guesses[player.id] >= 5) room.answers.set(player.id, { id: player.id, name: player.name, answer: `${rawValue} (out of attempts)`, points: 0 });
    maybeFinish(room); return;
  }
  maybeFinish(room);
}
function awardBoardRound(room, winnerId) {
  for (const p of room.players.values()) {
    if (p.isBot || !roundHasMark(room.currentRound, p.id)) continue;
    const won = Boolean(winnerId && winnerId === p.id);
    const { profile, newAchievements } = addXp(p.id, won ? 20 : 10);
    if (won) profile.wins += 1;
    room.profileCoins[p.id] = profile.coins;
    const sock = p.socketId ? io.sockets.sockets.get(p.socketId) : null;
    if (sock) sock.emit('profile:updated', { profile: publicProfile(profile), newAchievements });
  }
  saveStore();
}
function makeBoardMove(socket, room, player, rawValue) {
  const round = room.currentRound; const kind = round.kind;
  if (round.meta.turn !== player.id) return errorTo(socket, 'It is not your turn.');
  if (room.answers.has(player.id)) return errorTo(socket, 'Your move for this turn is already recorded.');
  let mark = round.meta.marks[player.id];
  if (!mark) return errorTo(socket, 'No game mark assigned to this player.');
  if (kind === 'tic-tac-toe') {
    const cell = Number(rawValue);
    if (!Number.isInteger(cell) || cell < 0 || cell > 8 || round.board[cell]) return errorTo(socket, 'Choose an empty board square.');
    round.board[cell] = mark;
    const winner = checkBoardWinner(round.board);
    round.meta.lastMove = { id: player.id, cell, mark };
    if (winner) {
      round.meta.winner = winner === 'draw' ? null : player.id;
      if (winner !== 'draw') room.scores[player.id] = (room.scores[player.id] || 0) + 5;
      room.showAnswers = true; room.resultMessage = winner === 'draw' ? 'The board is a draw!' : `${player.name} wins Tic-Tac-Toe!`;
      room.answers.set(player.id, { id: player.id, name: player.name, answer: `Placed ${mark}`, points: winner === 'draw' ? 0 : 5 });
      awardBoardRound(room, round.meta.winner);
      io.to(room.code).emit('game:result', { room: publicRoom(room), resultMessage: room.resultMessage, scores: room.scores, answers: [...room.answers.values()] });
    } else round.meta.turn = nextPlayerId(room, player.id);
  } else {
    const column = Number(rawValue);
    if (!Number.isInteger(column) || column < 0 || column > 6) return errorTo(socket, 'Choose a column from 1 to 7.');
    let row = -1;
    for (let r = 5; r >= 0; r--) if (!round.board[r][column]) { round.board[r][column] = mark; row = r; break; }
    if (row < 0) return errorTo(socket, 'That column is full. Choose another.');
    const winner = checkBoardWinner(round.board, true);
    if (winner) {
      round.meta.winner = winner === 'draw' ? null : player.id;
      if (winner !== 'draw') room.scores[player.id] = (room.scores[player.id] || 0) + 5;
      room.showAnswers = true; room.resultMessage = winner === 'draw' ? 'Connect Four is a draw!' : `${player.name} wins Connect Four!`;
      room.answers.set(player.id, { id: player.id, name: player.name, answer: `Column ${column + 1}`, points: winner === 'draw' ? 0 : 5 });
      awardBoardRound(room, round.meta.winner);
      io.to(room.code).emit('game:result', { room: publicRoom(room), resultMessage: room.resultMessage, scores: room.scores, answers: [...room.answers.values()] });
    } else round.meta.turn = nextPlayerId(room, player.id);
    round.meta.lastMove = { id: player.id, column, row, mark };
  }
  if (room.showAnswers) { updateRoom(room); return; }
  updateRoom(room);
  const next = room.players.get(round.meta.turn);
  if (next?.isBot) setTimeout(() => makeBotBoardMove(room, next), 650);
}
function nextPlayerId(room, currentId) {
  const list = onlinePlayers(room); if (!list.length) return currentId;
  const current = list.findIndex((p) => p.id === currentId);
  for (let i = 1; i <= list.length; i++) {
    const p = list[(current + i) % list.length];
    if (p && roundHasMark(room.currentRound, p.id)) return p.id;
  }
  return list[(current + 1) % list.length]?.id || currentId;
}
function roundHasMark(round, id) { return Boolean(round?.meta?.marks?.[id]); }
function makeBotBoardMove(room, bot) {
  if (!rooms.has(room.code) || room.showAnswers || room.currentRound?.meta.turn !== bot.id) return;
  const r = room.currentRound;
  if (r.kind === 'tic-tac-toe') {
    const empty = r.board.map((v, i) => v ? -1 : i).filter((v) => v >= 0); if (empty.length) {
      const cell = randomPick(empty); r.board[cell] = r.meta.marks[bot.id]; const winner = checkBoardWinner(r.board);
      if (winner) { r.meta.winner = winner === 'draw' ? null : bot.id; if (winner !== 'draw') room.scores[bot.id] = (room.scores[bot.id] || 0) + 5; room.showAnswers = true; room.resultMessage = winner === 'draw' ? 'The board is a draw!' : `${bot.name} wins Tic-Tac-Toe!`; }
      else r.meta.turn = nextPlayerId(room, bot.id);
    }
  } else {
    const cols = Array.from({ length: 7 }, (_, i) => i).filter((col) => r.board[0][col] === '');
    if (cols.length) {
      const column = randomPick(cols); let row = -1;
      for (let rr=5; rr>=0; rr--) if (!r.board[rr][column]) { r.board[rr][column] = r.meta.marks[bot.id]; row = rr; break; }
      const winner = checkBoardWinner(r.board, true);
      if (winner) { r.meta.winner = winner === 'draw' ? null : bot.id; if (winner !== 'draw') room.scores[bot.id] = (room.scores[bot.id] || 0) + 5; room.showAnswers = true; room.resultMessage = winner === 'draw' ? 'Connect Four is a draw!' : `${bot.name} wins Connect Four!`; }
      else r.meta.turn = nextPlayerId(room, bot.id);
    }
  }
  if (room.showAnswers) { awardBoardRound(room, r.meta.winner); io.to(room.code).emit('game:result', { room: publicRoom(room), resultMessage: room.resultMessage, scores: room.scores }); }
  updateRoom(room);
  const next = room.players.get(r.meta.turn); if (!room.showAnswers && next?.isBot) setTimeout(() => makeBotBoardMove(room, next), 700);
}
function chooseBotAnswer(room, player) {
  const r = room.currentRound; if (!r) return '';
  if (['trivia', 'puzzle', 'escape', 'emoji', 'song', 'logo', 'riddle', 'sound-clue', 'math', 'scramble', 'typing', 'custom-trivia', 'detective'].includes(r.kind)) return r.answerKey || randomPick(r.options || ['Interesting!']);
  if (r.kind === 'memory') return (r.meta.sequence || []).join('');
  if (r.kind === 'rps') return randomPick(['rock', 'paper', 'scissors']);
  if (r.kind === 'choice' || r.kind === 'truth-dare' || r.kind === 'never' || r.kind === 'character' || r.kind === 'target' || r.kind === 'obstacle' || r.kind === 'pong') return randomPick(r.options || ['Option 1']);
  if (r.kind === 'vote' || r.kind === 'mafia' || r.kind === 'spyfall') return randomPick(r.meta.optionIds || room.players.keys());
  if (r.kind === 'math') return r.answerKey;
  if (r.kind === 'number-guess') return String(r.meta.secretNumber);
  if (r.kind === 'codebreaker') return r.meta.secretCode;
  if (r.kind === 'auction') return String(randomInt(30));
  if (r.kind === 'word-chain') return ({ s: 'sun', n: 'night', t: 'tree', e: 'earth', h: 'house', r: 'river', a: 'apple' })[String(r.meta.lastLetter).toLowerCase()] || 'tree';
  if (r.kind === 'story') return randomPick(['laughed', 'together', 'suddenly', 'today']);
  if (r.kind === 'association') return randomPick(['wave', 'blue', 'salt', 'boat', 'beach']);
  if (r.kind === 'forbidden') return 'A baked round meal with sauce and toppings';
  if (r.kind === 'typing') return r.prompt;
  if (r.kind === 'reaction' || r.kind === 'reaction-duel') return 'tap';
  if (r.kind === 'balloon') return (r.meta.sequence || []).join('');
  if (r.kind === 'impostor') return 'I think it is something you use daily';
  if (r.kind === 'secret-agent') return 'done';
  if (r.kind === 'treasure' || r.kind === 'drawing') return r.answerKey;
  if (r.kind === 'drawing' || r.kind === 'caption' || r.kind === 'fake-answer' || r.kind === 'ideas') return randomPick(['A remarkably suspicious toaster.', 'Because Tuesdays are secretly purple.', 'An invention that sorts socks.']);
  if (r.kind === 'snake') return randomPick(['Up', 'Down', 'Left', 'Right']);
  return 'I choose this one!';
}
function runBotAnswers(room, roundNumber) {
  for (const player of room.players.values()) {
    if (!player.isBot) continue;
    const delay = 700 + randomInt(2200);
    setTimeout(() => {
      if (!rooms.has(room.code) || room.round !== roundNumber || room.showAnswers || !room.currentRound) return;
      if (['tic-tac-toe', 'connect-four'].includes(room.currentRound.kind)) {
        if (room.currentRound.meta.turn === player.id) makeBotBoardMove(room, player);
        return;
      }
      if (room.answers.has(player.id)) return;
      if ((room.currentRound.kind === 'reaction' || room.currentRound.kind === 'reaction-duel') && Date.now() < room.currentRound.meta.goAt) {
        setTimeout(() => { if (rooms.has(room.code) && room.round === roundNumber && !room.showAnswers && !room.answers.has(player.id)) submitBotAnswer(room, player); }, Math.max(0, room.currentRound.meta.goAt - Date.now()) + randomInt(500));
      } else submitBotAnswer(room, player);
    }, delay);
  }
}
function submitBotAnswer(room, bot) {
  if (room.showAnswers || !room.currentRound || room.answers.has(bot.id)) return;
  const answer = chooseBotAnswer(room, bot);
  const feedback = scoreAnswer(room.currentRound, bot, answer, room);
  if (feedback.ok) {
    if (room.currentRound.kind === 'story') room.previousStory = room.currentRound.meta.story;
    maybeFinish(room);
  }
}

function friendList(id) {
  const friendIds = store.friendships[id] || [];
  return friendIds.map((friendId) => publicProfile(store.profiles[friendId])).filter(Boolean);
}
function incomingRequests(id) {
  return (store.friendRequests[id] || []).map((fromId) => publicProfile(store.profiles[fromId])).filter(Boolean);
}
function sendSocialData(socket) {
  const id = socket.data.playerId; if (!id) return;
  socket.emit('social:data', {
    friends: friendList(id), requests: incomingRequests(id),
    messages: store.messages.filter((m) => m.fromId === id || m.toId === id).slice(-150),
    leaderboard: Object.values(store.profiles).map(publicProfile).sort((a, b) => b.xp - a.xp).slice(0, 20),
    customGames: store.customGames,
  });
}
function adminOverview() {
  return {
    rooms: [...rooms.values()].map((r) => ({
      code: r.code, gameId: r.gameId, players: r.players.size, round: r.round, started: r.started,
      playerList: [...r.players.values()].map((p) => ({ id: p.id, name: p.name, isBot: p.isBot, muted: Boolean(p.muted) })),
    })),
    onlinePlayers: onlineByPlayer.size, profiles: Object.keys(store.profiles).length,
    messages: store.messages.length, customGames: store.customGames.length,
    moderationLog: store.moderationLog.slice(-100),
  };
}

function moderate(room, targetId, action, byId) {
  if (room.hostId !== byId) return { ok: false, message: 'Only the room host can moderate this room.' };
  const target = room.players.get(targetId); if (!target || target.isBot) return { ok: false, message: 'Player not found.' };
  if (action === 'mute' || action === 'unmute') { target.muted = action === 'mute'; updateRoom(room); return { ok: true, message: `${target.name} ${target.muted ? 'muted' : 'unmuted'}.` }; }
  if (action === 'kick') {
    const sock = target.socketId ? io.sockets.sockets.get(target.socketId) : null;
    if (sock) { sock.emit('room:error', 'You were removed from the room by the host.'); leaveRoom(sock, room.code); }
    else { room.players.delete(targetId); delete room.scores[targetId]; updateRoom(room); }
    return { ok: true, message: `${target.name} removed from room.` };
  }
  return { ok: false, message: 'Unknown moderation action.' };
}

app.get('/health', (_req, res) => res.json({ ok: true, service: 'lava-mart', rooms: rooms.size, onlinePlayers: onlineByPlayer.size, uptimeSeconds: Math.floor(process.uptime()) }));
app.get('/', (_req, res) => res.json({ service: 'Lava Mart multiplayer server', health: '/health', api: ['/api/games', '/api/leaderboard', '/api/generate-questions'] }));
app.get('/api/games', (_req, res) => res.json({ games: builtInGames, customGames: store.customGames }));
app.get('/api/leaderboard', (_req, res) => res.json(Object.values(store.profiles).map(publicProfile).sort((a, b) => b.xp - a.xp).slice(0, 50)));
app.post('/api/generate-questions', async (req, res) => {
  const ip = req.ip || req.socket.remoteAddress || 'unknown';
  if (!rateLimit(`ai:${ip}`, 8, 60_000)) return res.status(429).json({ error: 'Too many requests. Try again in one minute.' });
  const topic = clean(req.body?.topic, 90) || 'general knowledge';
  const count = clamp(req.body?.count, 1, 8) || 5;
  if (process.env.OPENAI_API_KEY) {
    try {
      const endpoint = process.env.AI_API_URL || 'https://api.openai.com/v1/chat/completions';
      const model = process.env.AI_MODEL || 'gpt-4o-mini';
      const response = await fetch(endpoint, { method: 'POST', headers: { Authorization: `Bearer ${process.env.OPENAI_API_KEY}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ model, temperature: 0.8, messages: [{ role: 'system', content: 'Return only valid JSON: an array of objects with prompt, options (array of four short strings), answer (one exact option), explanation. Make original, family-friendly party game questions.' }, { role: 'user', content: `Create ${count} multiple-choice questions about ${topic}.` }] }), signal: AbortSignal.timeout(18_000) });
      if (!response.ok) throw new Error(`AI provider returned HTTP ${response.status}`);
      const body = await response.json();
      const content = body.choices?.[0]?.message?.content || '[]';
      const parsedText = content.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '');
      const parsed = JSON.parse(parsedText);
      const questions = parsed.filter((q) => q && typeof q.prompt === 'string' && Array.isArray(q.options) && q.options.length >= 2 && q.answer).slice(0, count).map((q) => ({ prompt: clean(q.prompt, 220), options: q.options.slice(0, 6).map((o) => clean(o, 90)), answer: clean(q.answer, 90), explanation: clean(q.explanation || '', 250) }));
      if (!questions.length) throw new Error('AI provider returned no usable questions');
      return res.json({ questions, source: 'ai' });
    } catch (error) { console.warn('AI question generation fell back to local bank:', error.message); }
  }
  const questions = Array.from({ length: count }, (_, i) => {
    const base = sampleQuestions[(i + randomInt(sampleQuestions.length)) % sampleQuestions.length];
    return { ...base, prompt: `${base.prompt} [Topic: ${topic}]` };
  });
  return res.json({ questions, source: 'local-fallback', message: 'Configure OPENAI_API_KEY and AI_MODEL on the backend for provider-generated questions. The local fallback does not call an AI service.' });
});
app.get('/api/admin/overview', (req, res) => {
  if (!process.env.ADMIN_KEY || req.headers['x-admin-key'] !== process.env.ADMIN_KEY) return res.status(401).json({ error: 'Admin authentication required.' });
  return res.json(adminOverview());
});

io.on('connection', (socket) => {
  socket.on('profile:load', ({ playerId, name } = {}) => {
    if (!rateLimit(`profile:${socket.id}`, 20)) return;
    const id = isSafeId(playerId) ? String(playerId) : randomUUID();
    socket.data.playerId = id;
    const profile = ensureProfile(id, clean(name, 24) || 'Player');
    saveStore();
    if (onlineByPlayer.has(id) && onlineByPlayer.get(id) !== socket.id) {
      const old = io.sockets.sockets.get(onlineByPlayer.get(id));
      if (old && !old.data.room) old.emit('session:replaced', 'This profile was opened in another tab or device.');
    }
    onlineByPlayer.set(id, socket.id);
    socket.emit('profile:loaded', { profile: publicProfile(profile), friends: friendList(id), requests: incomingRequests(id) });
    sendSocialData(socket);
    socket.emit('custom:list', store.customGames);
  });
  socket.on('profile:update', async (patch = {}) => {
    const id = socket.data.playerId; if (!id) return errorTo(socket, 'Load a profile first.');
    if (!rateLimit(`profile-update:${id}`, 10, 60_000)) return errorTo(socket, 'Profile update limit reached. Try later.');
    const profile = await patchProfile(id, patch);
    const current = getPlayer(socket);
    if (current) { current.player.name = profile.name; current.player.avatar = profile.avatar; updateRoom(current.room); }
    socket.emit('profile:updated', { profile: publicProfile(profile), newAchievements: [] });
    sendSocialData(socket);
  });
  socket.on('room:create', (payload = {}) => {
    if (!rateLimit(`room-create:${socket.id}`, 5, 30_000)) return errorTo(socket, 'Please wait before creating another room.');
    createRoom(socket, payload);
  });
  socket.on('room:join', (payload = {}) => { if (!rateLimit(`room-join:${socket.id}`, 12, 15_000)) return errorTo(socket, 'Too many join attempts. Wait a moment and try again.'); joinRoom(socket, payload); });
  socket.on('room:resume', (payload = {}) => joinRoom(socket, payload, true));
  socket.on('room:leave', ({ code } = {}) => leaveRoom(socket, safeCode(code || socket.data.room)));
  socket.on('room:settings', (settings = {}) => {
    const ctx = getPlayer(socket); if (!ctx) return;
    if (ctx.room.hostId !== ctx.player.id) return errorTo(socket, 'Only the host can change room settings.');
    for (const key of ['chaos', 'marathon', 'teamBattle']) if (settings[key] !== undefined) ctx.room.settings[key] = Boolean(settings[key]);
    if (settings.teamBattle) {
      let i = 0; for (const player of ctx.room.players.values()) { player.team = i++ % 2 ? 'B' : 'A'; }
    } else for (const player of ctx.room.players.values()) player.team = null;
    updateRoom(ctx.room);
  });
  socket.on('game:start', ({ code, gameId } = {}) => {
    if (!rateLimit(`game-start:${socket.id}`, 10, 15_000)) return errorTo(socket, 'Please wait before starting another round.');
    const ctx = getPlayer(socket); if (!ctx) return errorTo(socket, 'Join a room before starting a game.');
    const room = ctx.room;
    if (room.hostId !== ctx.player.id) return errorTo(socket, 'Only the room host can start the next round.');
    const selectedId = String(gameId || room.gameId);
    const game = getGame(selectedId, store.customGames);
    if (!game) return errorTo(socket, 'That game could not be found. Refresh the game list.');
    if (['tic-tac-toe', 'connect-four'].includes(game.kind) && onlinePlayers(room).length < 2) return errorTo(socket, 'This board game needs at least two players. Create a bot room or invite a friend.');
    if (room.settings.marathon && room.round > 0) {
      const index = builtInGames.findIndex((g) => String(g.id) === String(room.gameId));
      room.gameId = String(builtInGames[(index + 1 + builtInGames.length) % builtInGames.length].id);
    } else room.gameId = selectedId;
    const currentGame = getCurrentGame(room) || game;
    room.round += 1; room.started = true; room.showAnswers = false; room.answers.clear(); room.resultMessage = '';
    room.currentRound = createRound(currentGame, onlinePlayers(room), room.round, { chaos: room.settings.chaos, previousStory: room.previousStory });
    room.currentRound.startedAt = Date.now();
    io.to(room.code).emit('game:round', { ...publicRound(room.currentRound), roomCode: room.code });
    emitPrivateRounds(room); updateRoom(room);
    if (room.currentRound.kind === 'reaction' || room.currentRound.kind === 'reaction-duel') {
      const delay = Math.max(0, room.currentRound.meta.goAt - Date.now());
      setTimeout(() => { if (rooms.has(room.code) && room.round === room.currentRound.round && !room.showAnswers) io.to(room.code).emit('game:go', { at: room.currentRound.meta.goAt }); }, delay);
    }
    runBotAnswers(room, room.round);
  });
  socket.on('game:answer', ({ code, value, answer } = {}) => {
    const requestedCode = safeCode(code || socket.data.room);
    if (requestedCode !== socket.data.room) return errorTo(socket, 'You are not joined to that room.');
    submitAnswer(socket, value ?? answer);
  });
  socket.on('game:draw', ({ code, dataUrl } = {}) => {
    const ctx = getPlayer(socket); if (!ctx || safeCode(code || ctx.room.code) !== ctx.room.code) return;
    if (ctx.room.currentRound?.kind !== 'drawing' || ctx.room.currentRound.meta.drawerId !== ctx.player.id) return errorTo(socket, 'Only the assigned drawer can send drawing updates.');
    if (typeof dataUrl !== 'string' || !dataUrl.startsWith('data:image/png;base64,') || dataUrl.length > 750_000) return errorTo(socket, 'Drawing update is invalid or too large.');
    socket.to(ctx.room.code).emit('game:draw', { dataUrl, from: ctx.player.name });
  });
  socket.on('chat:send', ({ code, text } = {}) => {
    const ctx = getPlayer(socket); if (!ctx) return errorTo(socket, 'Join a room to use chat.');
    if (safeCode(code || ctx.room.code) !== ctx.room.code) return errorTo(socket, 'You are not in this room.');
    if (ctx.player.muted) return errorTo(socket, 'You are muted by the host.');
    if (!rateLimit(`chat:${ctx.player.id}`, 12, 10_000)) return errorTo(socket, 'You are sending messages too quickly.');
    const message = clean(text, 300); if (!message) return;
    io.to(ctx.room.code).emit('chat:message', { code: ctx.room.code, id: randomUUID(), playerId: ctx.player.id, name: ctx.player.name, text: message, at: Date.now() });
  });
  socket.on('room:moderate', ({ targetId, action } = {}) => {
    const ctx = getPlayer(socket); if (!ctx) return;
    const result = moderate(ctx.room, String(targetId || ''), String(action || ''), ctx.player.id);
    socket.emit('room:moderation-result', result);
  });
  socket.on('custom:create', async (data = {}) => {
    const id = socket.data.playerId; if (!id) return errorTo(socket, 'Load your profile first.');
    if (!rateLimit(`custom:${id}`, 5, 60_000)) return errorTo(socket, 'Custom game creation limit reached. Try again later.');
    const name = clean(data.name, 50), prompt = clean(data.prompt, 240);
    const options = Array.isArray(data.options) ? data.options.slice(0, 6).map((o) => clean(o, 80)).filter(Boolean) : [];
    const answer = clean(data.answer, 80);
    if (!name || !prompt || options.length < 2 || !answer || !options.some((o) => o.toLowerCase() === answer.toLowerCase())) return errorTo(socket, 'Add a name, a question, at least two options, and choose the correct option from the list.');
    const profile = ensureProfile(id);
    const custom = { id: `custom-${randomUUID().slice(0, 8)}`, name, category: 'custom', kind: 'custom-trivia', description: `Created by ${profile.name}`, prompt, options, answer, explanation: clean(data.explanation, 240), createdBy: id, createdAt: Date.now() };
    store.customGames.unshift(custom); store.customGames = store.customGames.slice(0, 200); await saveStore();
    io.emit('custom:list', store.customGames); socket.emit('custom:created', custom);
  });
  socket.on('custom:list', () => socket.emit('custom:list', store.customGames));
  socket.on('ai:generate', async ({ topic, count } = {}) => {
    const ipKey = socket.handshake.address || socket.id;
    if (!rateLimit(`ai-socket:${ipKey}`, 8, 60_000)) return errorTo(socket, 'AI question limit reached. Try again in a minute.');
    try {
      const response = await fetch(`http://127.0.0.1:${port}/api/generate-questions`, { method: 'POST', headers: { 'Content-Type': 'application/json', 'x-forwarded-for': 'socket' }, body: JSON.stringify({ topic, count }) });
      const result = await response.json(); socket.emit('ai:generated', result);
    } catch { socket.emit('ai:generated', { error: 'Question generation failed. Please try again.' }); }
  });
  socket.on('tournament:start', () => {
    const ctx = getPlayer(socket); if (!ctx) return;
    if (ctx.room.hostId !== ctx.player.id) return errorTo(socket, 'Only the host can start a tournament.');
    const entrants = onlinePlayers(ctx.room).filter((p) => !p.isBot);
    if (entrants.length < 2) return errorTo(socket, 'A tournament needs at least two human players.');
    ctx.room.tournament = { id: randomUUID(), round: 1, matches: createBracket(entrants).matches, champion: null, createdAt: Date.now() };
    store.tournaments.unshift({ id: ctx.room.tournament.id, code: ctx.room.code, createdAt: Date.now(), status: 'active' });
    saveStore(); updateRoom(ctx.room); socket.emit('tournament:notice', 'Tournament bracket created. Host can advance each match after a round.');
  });
  socket.on('tournament:advance', ({ matchId, winnerId } = {}) => {
    const ctx = getPlayer(socket); if (!ctx) return;
    const tournament = ctx.room.tournament;
    if (!tournament || ctx.room.hostId !== ctx.player.id) return errorTo(socket, 'Only a tournament host can advance a bracket.');
    const match = tournament.matches.find((m) => m.id === Number(matchId));
    if (!match || ![match.a?.id, match.b?.id].includes(winnerId)) return errorTo(socket, 'That winner is not part of the selected match.');
    match.winner = winnerId;
    if (tournament.matches.every((m) => m.winner)) {
      const winners = tournament.matches.map((m) => ctx.room.players.get(m.winner) || { id: m.winner, name: m.winner });
      if (winners.length === 1) tournament.champion = winners[0].id;
      else {
        tournament.round += 1; tournament.matches = [];
        for (let i = 0; i < winners.length; i += 2) {
          const a = winners[i]; const b = winners[i + 1] || { id: null, name: 'BYE' };
          tournament.matches.push({ id: tournament.matches.length + 1, a: { id: a.id, name: a.name }, b: { id: b.id, name: b.name }, winner: b.id ? null : a.id });
        }
        if (tournament.matches.length === 1 && tournament.matches[0].winner) tournament.champion = tournament.matches[0].winner;
      }
    }
    updateRoom(ctx.room);
  });
  socket.on('voice:signal', ({ targetId, signal } = {}) => {
    const ctx = getPlayer(socket); if (!ctx) return;
    const target = ctx.room.players.get(String(targetId));
    if (!target || !target.online || !target.socketId) return;
    if (!signal || typeof signal !== 'object' || JSON.stringify(signal).length > 100_000) return;
    io.to(target.socketId).emit('voice:signal', { fromId: ctx.player.id, fromName: ctx.player.name, signal });
  });
  socket.on('friend:request', async ({ target } = {}) => {
    const id = socket.data.playerId; if (!id) return;
    if (!rateLimit(`friend-request:${id}`, 10, 60_000)) return errorTo(socket, 'Friend request limit reached. Try later.');
    const needle = normaliseUsername(target);
    if (!needle || needle === normaliseUsername(ensureProfile(id).name)) return errorTo(socket, 'Enter another player’s nickname or username.');
    const found = Object.values(store.profiles).find((p) => p.id !== id && (normaliseUsername(p.name) === needle || p.username === needle));
    if (!found) return errorTo(socket, 'Player not found. They need to open Lava Mart once before you can add them.');
    if ((store.friendships[id] || []).includes(found.id)) return errorTo(socket, 'You are already friends.');
    store.friendRequests[found.id] ||= [];
    if (!store.friendRequests[found.id].includes(id)) store.friendRequests[found.id].push(id);
    await saveStore();
    const targetSocket = findSocketForPlayer(found.id); if (targetSocket) targetSocket.emit('social:request', publicProfile(ensureProfile(id)));
    socket.emit('social:notice', `Friend request sent to ${found.name}.`); sendSocialData(socket);
  });
  socket.on('friend:accept', async ({ fromId } = {}) => {
    const id = socket.data.playerId; if (!id || !(store.friendRequests[id] || []).includes(fromId)) return errorTo(socket, 'Friend request not found.');
    store.friendRequests[id] = store.friendRequests[id].filter((v) => v !== fromId);
    store.friendships[id] ||= []; store.friendships[fromId] ||= [];
    if (!store.friendships[id].includes(fromId)) store.friendships[id].push(fromId);
    if (!store.friendships[fromId].includes(id)) store.friendships[fromId].push(id);
    await saveStore(); sendSocialData(socket);
    const other = findSocketForPlayer(fromId); if (other) sendSocialData(other);
    socket.emit('social:notice', 'You are now friends!');
  });
  socket.on('dm:send', async ({ toId, text } = {}) => {
    const id = socket.data.playerId; if (!id || !toId || !(store.friendships[id] || []).includes(toId)) return errorTo(socket, 'You can message friends only.');
    if (!rateLimit(`dm:${id}`, 30, 60_000)) return errorTo(socket, 'Message limit reached. Try later.');
    const content = clean(text, 500); if (!content) return;
    const message = { id: randomUUID(), fromId: id, toId: String(toId), text: content, at: Date.now() };
    store.messages.push(message); if (store.messages.length > 10_000) store.messages = store.messages.slice(-8_000);
    await saveStore();
    socket.emit('dm:message', message);
    const targetSocket = findSocketForPlayer(String(toId)); if (targetSocket) targetSocket.emit('dm:message', message);
  });
  socket.on('social:refresh', () => sendSocialData(socket));
  socket.on('admin:overview', ({ key } = {}) => {
    if (!process.env.ADMIN_KEY || key !== process.env.ADMIN_KEY) return errorTo(socket, 'Admin key is missing or invalid. Set ADMIN_KEY on the backend first.');
    socket.emit('admin:overview', adminOverview());
  });
  socket.on('admin:act', ({ key, action, code, targetId } = {}) => {
    if (!process.env.ADMIN_KEY || key !== process.env.ADMIN_KEY) return errorTo(socket, 'Admin key is missing or invalid.');
    const room = rooms.get(safeCode(code)); if (!room) return errorTo(socket, 'Room not found.');
    if (action === 'close-room') {
      for (const p of room.players.values()) { const s = p.socketId ? io.sockets.sockets.get(p.socketId) : null; if (s) { s.emit('room:error', 'This room was closed by an administrator.'); s.leave(room.code); delete s.data.room; } }
      rooms.delete(room.code);
      store.moderationLog.push({ at: Date.now(), action, code: room.code, by: socket.data.playerId || 'admin' }); saveStore();
      socket.emit('admin:notice', `Room ${room.code} closed.`); socket.emit('admin:overview', adminOverview()); return;
    }
    const result = moderate(room, String(targetId || ''), action, room.hostId);
    store.moderationLog.push({ at: Date.now(), action, code: room.code, targetId, by: 'admin' }); saveStore();
    socket.emit('admin:notice', result.message); socket.emit('admin:overview', adminOverview());
  });
  socket.on('disconnect', () => {
    const id = socket.data.playerId;
    if (id && onlineByPlayer.get(id) === socket.id) onlineByPlayer.delete(id);
    const code = socket.data.room; const room = rooms.get(code); const player = room?.players.get(id);
    if (room && player && player.socketId === socket.id) {
      player.online = false; player.socketId = null; updateRoom(room);
      const roomCode = room.code;
      setTimeout(() => {
        const currentRoom = rooms.get(roomCode); const currentPlayer = currentRoom?.players.get(id);
        if (currentRoom && currentPlayer && !currentPlayer.online && !currentPlayer.isBot) {
          currentRoom.players.delete(id); delete currentRoom.scores[id]; currentRoom.answers.delete(id);
          if (currentRoom.hostId === id) currentRoom.hostId = [...currentRoom.players.values()].find((p) => !p.isBot && p.online)?.id || [...currentRoom.players.values()].find((p) => !p.isBot)?.id || null;
          if (![...currentRoom.players.values()].some((p) => !p.isBot)) rooms.delete(roomCode); else updateRoom(currentRoom);
        }
      }, ROOM_TTL_MS);
    }
  });
});

server.listen(port, '0.0.0.0', () => console.log(`Lava Mart multiplayer server listening on port ${port}`));

export { app, server, io, rooms };
