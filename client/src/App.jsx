import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { io } from 'socket.io-client';
import { QRCodeSVG } from 'qrcode.react';
import { games, sampleQuestions, promptBank, typingPhrases, words } from '../../shared/games.js';

const API = (import.meta.env.VITE_SOCKET_URL || 'http://localhost:4000').replace(/\/$/, '');
const PLAYER_KEY = 'lava-mart-player-id';
const NAME_KEY = 'lava-mart-player-name';
const ROOM_KEY = 'lava-mart-room-code';
const AVATARS = ['🙂', '😎', '🦊', '🐼', '🐸', '🦄', '🤖', '🐯', '🐙', '🐨'];
const ICE_SERVERS = (() => {
  try { return JSON.parse(import.meta.env.VITE_ICE_SERVERS || '[{"urls":"stun:stun.l.google.com:19302"}]'); }
  catch { return [{ urls: 'stun:stun.l.google.com:19302' }]; }
})();
const translations = {
  en: {
    online: 'Online', connecting: 'Connecting', gameNight: 'Game night', setup: 'Start or join a room', nickname: 'Your nickname', create: '＋ Create room', bots: '🤖 Play with bots', roomCode: 'Room code', join: 'Join with code', scan: 'Scan to join', copyLink: 'Copy invite link', chooseGame: 'Choose your game', search: 'Search games…', all: 'All', roomChat: 'Room chat', send: 'Send', message: 'Say something…', offline: 'Offline practice', friends: 'Friends & DMs', profile: 'Profile & leaderboard', admin: 'Admin dashboard', voice: 'Join voice', leaveVoice: 'Leave voice', startRound: 'Start / next round', leaveRoom: 'Leave room', answer: 'Your answer', submit: 'Submit answer', roundAnswers: 'Round answers', chaos: 'Chaos Mode', marathon: 'Party Marathon', teams: 'Team battle', botPlayers: 'Bot players', save: 'Save profile', bio: 'Bio', username: 'Nickname / username', friendRequest: 'Send friend request', accept: 'Accept', privateMessage: 'Private message', sendDM: 'Send DM', tournament: 'Start tournament', custom: 'Create custom game', generateAI: 'Generate questions', createGame: 'Save custom game', topic: 'Question topic', correctAnswer: 'Correct answer', adminKey: 'Admin key', loadAdmin: 'Load dashboard', closeRoom: 'Close room', achievements: 'Achievements', level: 'Level', xp: 'XP', coins: 'Coins', leaderboard: 'Leaderboard', offlineTitle: 'Practice solo without internet', offlineText: 'Offline practice runs in this browser. Multiplayer, voice, AI provider calls, friends, and server-saved progress need a connection.', roundDone: 'Round complete!', noRoom: 'Join or create a room to play with friends.', settings: 'Room settings', result: 'Result', yourRole: 'Your private role / clue', chooseOne: 'Choose an answer', yourSubmission: 'Your submission', language: 'Language', english: 'English', tamil: 'தமிழ்', go: 'GO! TAP NOW', wait: 'Wait for GO…', privateMessages: 'Messages', drawing: 'Draw here', reveal: 'The memory sequence has been hidden.', botNote: 'Bots use built-in sample strategies, not a live AI model.'
  },
  ta: {
    online: 'ஆன்லைன்', connecting: 'இணைக்கிறது', gameNight: 'விளையாட்டு இரவு', setup: 'அறையை உருவாக்கு அல்லது சேர்', nickname: 'உங்கள் பெயர்', create: '＋ அறை உருவாக்கு', bots: '🤖 பாட்டுகளுடன் விளையாடு', roomCode: 'அறை குறியீடு', join: 'குறியீட்டுடன் சேர்', scan: 'ஸ்கேன் செய்து சேர்', copyLink: 'அழைப்பு இணைப்பை நகலெடு', chooseGame: 'விளையாட்டைத் தேர்வு செய்', search: 'விளையாட்டைத் தேடு…', all: 'அனைத்தும்', roomChat: 'அறை உரையாடல்', send: 'அனுப்பு', message: 'செய்தி எழுது…', offline: 'ஆஃப்லைன் பயிற்சி', friends: 'நண்பர்கள் & தனிச்செய்தி', profile: 'சுயவிவரம் & தரவரிசை', admin: 'நிர்வாகம்', voice: 'குரலில் சேர்', leaveVoice: 'குரலை நிறுத்து', startRound: 'சுற்றைத் தொடங்கு / அடுத்து', leaveRoom: 'அறையை விட்டு வெளியேறு', answer: 'உங்கள் பதில்', submit: 'பதிலை அனுப்பு', roundAnswers: 'சுற்றுப் பதில்கள்', chaos: 'குழப்ப முறை', marathon: 'விளையாட்டு மரத்தான்', teams: 'அணி போட்டி', botPlayers: 'பாட் வீரர்கள்', save: 'சுயவிவரத்தை சேமி', bio: 'என்னைப் பற்றி', username: 'பெயர் / பயனர் பெயர்', friendRequest: 'நண்பர் கோரிக்கை அனுப்பு', accept: 'ஏற்று', privateMessage: 'தனிச்செய்தி', sendDM: 'தனிச்செய்தி அனுப்பு', tournament: 'போட்டியைத் தொடங்கு', custom: 'சொந்த விளையாட்டு', generateAI: 'கேள்விகளை உருவாக்கு', createGame: 'விளையாட்டைச் சேமி', topic: 'கேள்வி தலைப்பு', correctAnswer: 'சரியான பதில்', adminKey: 'நிர்வாக விசை', loadAdmin: 'பலகையைத் திற', closeRoom: 'அறையை மூடு', achievements: 'சாதனைகள்', level: 'நிலை', xp: 'XP', coins: 'நாணயங்கள்', leaderboard: 'தரவரிசை', offlineTitle: 'இணையமின்றி பயிற்சி செய்', offlineText: 'இந்த உலாவியில் ஆஃப்லைன் பயிற்சி இயங்கும். பலர் விளையாட்டு, குரல், AI சேவை, நண்பர்கள் மற்றும் சேமித்த முன்னேற்றத்திற்கு இணையம் தேவை.', roundDone: 'சுற்று முடிந்தது!', noRoom: 'நண்பர்களுடன் விளையாட அறையை உருவாக்கு அல்லது சேர்.', settings: 'அறை அமைப்புகள்', result: 'முடிவு', yourRole: 'உங்கள் தனிப்பட்ட பங்கு / குறிப்பு', chooseOne: 'ஒரு பதிலைத் தேர்வு செய்', yourSubmission: 'உங்கள் பதில்', adminKey: 'நிர்வாக விசை', language: 'மொழி', english: 'English', tamil: 'தமிழ்', go: 'GO! இப்போது தட்டு', wait: 'GO வரும்வரை காத்திரு…', privateMessages: 'செய்திகள்', drawing: 'இங்கே வரை', reveal: 'நினைவுத் தொடர் மறைக்கப்பட்டது.', botNote: 'பாட்கள் முன் அமைக்கப்பட்ட பதில்களைப் பயன்படுத்தும்; நேரடி AI அல்ல.'
  }
};
const tFrom = (lang, key) => translations[lang]?.[key] || translations.en[key] || key;
function getPlayerId() {
  let id = localStorage.getItem(PLAYER_KEY);
  if (!id) { id = globalThis.crypto?.randomUUID?.() || `player-${Math.random().toString(36).slice(2)}-${Date.now()}`; localStorage.setItem(PLAYER_KEY, id); }
  return id;
}
const normalise = (value) => String(value ?? '').trim().toLowerCase().replace(/[^\p{L}\p{N}\s'-]/gu, '').replace(/\s+/g, ' ');
const rand = (arr) => arr[Math.floor(Math.random() * arr.length)];

function RemoteAudio({ stream, name }) {
  const ref = useRef(null);
  useEffect(() => { if (ref.current && stream) { ref.current.srcObject = stream; ref.current.play().catch(() => {}); } }, [stream]);
  return <div className="voice-peer"><span>🔊 {name}</span><audio ref={ref} autoPlay playsInline /> </div>;
}

function OfflineRound({ game, onBack, lang }) {
  const [round, setRound] = useState(null);
  const [value, setValue] = useState('');
  const [feedback, setFeedback] = useState('');
  const [score, setScore] = useState(Number(localStorage.getItem('lava-offline-xp') || 0));
  const [seen, setSeen] = useState(true);
  useEffect(() => { start(); }, [game.id]);
  function start() {
    const q = sampleQuestions[Math.floor(Math.random() * sampleQuestions.length)];
    const word = rand(words);
    const options = q.options;
    const data = game.kind === 'math' ? (() => { const a = 2 + Math.floor(Math.random() * 18), b = 2 + Math.floor(Math.random() * 9); return { kind: 'math', prompt: `Solve: ${a} × ${b} = ?`, answer: String(a * b), options: [] }; })()
      : game.kind === 'memory' ? (() => { const sequence = ['🍋', '🚀', '🐱', rand(['🌈','🎸','🍕'])]; return { kind: 'memory', prompt: 'Memorise these emojis, then enter them in the same order.', sequence, answer: sequence.join('') }; })() 
      : game.kind === 'scramble' ? { kind: 'scramble', prompt: `Unscramble: ${word.split('').sort(() => Math.random() - 0.5).join('')}`, answer: word.toLowerCase() }
      : game.kind === 'typing' ? (() => { const prompt = rand(typingPhrases); return { kind: 'typing', prompt, answer: normalise(prompt) }; })()
      : game.kind === 'riddle' ? (() => { const riddle = rand([{ prompt: 'What has keys but no locks?', answer: 'piano' }, { prompt: 'What gets wetter the more it dries?', answer: 'towel' }]); return { kind: 'riddle', prompt: riddle.prompt, answer: riddle.answer }; })()
      : ['trivia', 'emoji', 'puzzle', 'escape', 'sound-clue', 'logo', 'song'].includes(game.kind) ? { kind: game.kind, prompt: q.prompt, answer: normalise(q.answer), options }
      : game.kind === 'number-guess' ? { kind: 'number-guess', prompt: 'Guess a number between 1 and 20.', answer: String(1 + Math.floor(Math.random() * 20)) }
      : game.kind === 'word-chain' ? { kind: 'word-chain', prompt: 'Type a word starting with S.', answer: 's' }
      : game.kind === 'forbidden' ? { kind: 'forbidden', prompt: 'Describe a pizza without using pizza, cheese, or tomato.', answer: '' }
      : game.kind === 'reaction' || game.kind === 'reaction-duel' ? { kind: 'reaction', prompt: 'Tap the button when you are ready (offline practice does not measure network reaction time).', answer: 'tap' }
      : { kind: game.kind, prompt: game.kind === 'rps' ? 'Choose Rock, Paper, or Scissors.' : game.description, answer: '' };
    setRound(data); setValue(''); setFeedback(''); setSeen(true);
    if (data.kind === 'memory') setTimeout(() => setSeen(false), 4000);
  }
  function submit(override) {
    const submitted = override ?? value;
    if (!String(submitted).trim()) return setFeedback('Enter your answer first.');
    let correct = false; let pts = 1; let note = 'Good try! Practice rounds earn 1 XP for a completed answer.';
    if (round.kind === 'memory') { correct = String(submitted).replace(/\s/g, '') === round.sequence.join(''); pts = correct ? 5 : 0; note = correct ? 'Perfect memory! +5 XP.' : 'Not quite. Try another sequence.'; }
    else if (round.answer) { correct = normalise(submitted) === normalise(round.answer); pts = correct ? 3 : 0; note = correct ? 'Correct! +3 XP.' : `Not correct. Expected: ${round.answer}`; }
    else if (round.kind === 'forbidden') { const banned = ['pizza', 'cheese', 'tomato']; const hits = banned.filter((w) => new RegExp(`\\b${w}\\b`, 'i').test(submitted)); correct = !hits.length; pts = correct ? 2 : 0; note = correct ? 'Great description! +2 XP.' : `Forbidden word used: ${hits.join(', ')}`; }
    else if (round.kind === 'word-chain') { correct = normalise(submitted).startsWith('s') && !String(submitted).includes(' '); pts = correct ? 2 : 0; note = correct ? 'Valid word! +2 XP.' : 'Word must begin with S.'; }
    else if (round.kind === 'reaction') { correct = true; pts = 1; note = 'Practice tap recorded. Real reaction timing requires an online room.'; }
    setFeedback(note);
    if (pts > 0) { const total = score + pts; setScore(total); localStorage.setItem('lava-offline-xp', String(total)); }
  }
  if (!round) return null;
  return <div className="offline-stage panel">
    <div className="section-head"><div><span className="eyebrow">OFFLINE PRACTICE</span><h2>{game.name}</h2><p>{tFrom(lang, 'offlineText')}</p></div><button className="secondary" onClick={onBack}>← Back</button></div>
    <div className="offline-score">⭐ {score} practice XP</div><div className="round-card"><p>{round.prompt}</p>
      {round.kind === 'memory' && seen && <div className="memory-sequence">{round.sequence.join(' ')}</div>}
      {round.kind === 'memory' && !seen && <p className="muted">{tFrom(lang, 'reveal')}</p>}
      {round.options?.length > 0 && <div className="option-grid">{round.options.map((option) => <button key={option} className="secondary option" onClick={() => { setValue(option); submit(option); }}>{option}</button>)}</div>}
      {(!round.options?.length || ['memory', 'math', 'scramble', 'typing', 'riddle', 'number-guess', 'word-chain', 'forbidden'].includes(round.kind)) && <form onSubmit={(e) => { e.preventDefault(); submit(); }} className="answer-box"><label>{tFrom(lang, 'answer')}<input value={value} onChange={(e) => setValue(e.target.value)} maxLength={300} placeholder="Type your answer…" /></label><button className="primary">{tFrom(lang, 'submit')}</button></form>}
      {round.kind === 'reaction' && <button className="primary wide" onClick={() => submit('tap')}>⚡ TAP!</button>}
      {feedback && <p className="notice">{feedback}</p>}
    </div><div className="split"><button className="primary" onClick={start}>Next practice round ↻</button><button className="secondary" onClick={onBack}>Back to game list</button></div>
  </div>;
}

function App() {
  const [playerId] = useState(getPlayerId);
  const [socket, setSocket] = useState(null);
  const [connected, setConnected] = useState(false);
  const [name, setName] = useState(localStorage.getItem(NAME_KEY) || 'Player');
  const [lang, setLang] = useState(localStorage.getItem('lava-language') || 'en');
  const t = (key) => tFrom(lang, key);
  const [room, setRoom] = useState(localStorage.getItem(ROOM_KEY) || '');
  const [roomInfo, setRoomInfo] = useState(null);
  const [selected, setSelected] = useState(games[0]);
  const [customGames, setCustomGames] = useState([]);
  const allGames = useMemo(() => [...games, ...customGames], [customGames]);
  const [category, setCategory] = useState('all');
  const [search, setSearch] = useState('');
  const [message, setMessage] = useState('');
  const [messages, setMessages] = useState([]);
  const [answer, setAnswer] = useState('');
  const [notice, setNotice] = useState('');
  const [bots, setBots] = useState(3);
  const [chaos, setChaos] = useState(false);
  const [marathon, setMarathon] = useState(false);
  const [teamBattle, setTeamBattle] = useState(false);
  const [privateClue, setPrivateClue] = useState(null);
  const [feedback, setFeedback] = useState(null);
  const [profile, setProfile] = useState(null);
  const [friends, setFriends] = useState([]);
  const [requests, setRequests] = useState([]);
  const [leaderboard, setLeaderboard] = useState([]);
  const [dmHistory, setDmHistory] = useState([]);
  const [friendTarget, setFriendTarget] = useState('');
  const [activeFriend, setActiveFriend] = useState(null);
  const [dmText, setDmText] = useState('');
  const [bio, setBio] = useState('');
  const [avatar, setAvatar] = useState('🙂');
  const [tab, setTab] = useState('games');
  const [customName, setCustomName] = useState('My Quiz');
  const [customPrompt, setCustomPrompt] = useState('Which planet is known as the Red Planet?');
  const [customOptions, setCustomOptions] = useState('Venus, Mars, Jupiter, Mercury');
  const [customAnswer, setCustomAnswer] = useState('Mars');
  const [customExplanation, setCustomExplanation] = useState('Mars appears red because of iron oxide on its surface.');
  const [aiTopic, setAiTopic] = useState('general knowledge');
  const [aiQuestions, setAiQuestions] = useState([]);
  const [adminKey, setAdminKey] = useState('');
  const [adminData, setAdminData] = useState(null);
  const [voiceEnabled, setVoiceEnabled] = useState(false);
  const [remoteStreams, setRemoteStreams] = useState({});
  const [offlineGame, setOfflineGame] = useState(null);
  const [drawingUrl, setDrawingUrl] = useState('');
  const [isGo, setIsGo] = useState(false);
  const [hiddenMemory, setHiddenMemory] = useState(false);
  const [chatMuted, setChatMuted] = useState(false);
  const drawingCanvas = useRef(null);
  const drawingActive = useRef(false);
  const localStreamRef = useRef(null);
  const peerConnections = useRef(new Map());
  const remoteStreamsRef = useRef({});
  const audioContextRef = useRef(null);
  const joinUrl = useMemo(() => room && typeof window !== 'undefined' ? `${window.location.origin}/?room=${encodeURIComponent(room)}` : '', [room]);
  const roundData = roomInfo?.roundData || null;
  const currentPlayer = roomInfo?.players?.find((p) => p.id === playerId);
  const isHost = Boolean(currentPlayer?.isHost);
  const filtered = allGames.filter((g) => (category === 'all' || g.category === category) && g.name.toLowerCase().includes(search.toLowerCase()));

  useEffect(() => {
    localStorage.setItem('lava-language', lang);
    const s = io(API, { transports: ['websocket', 'polling'], reconnection: true, reconnectionAttempts: Infinity, reconnectionDelay: 800, reconnectionDelayMax: 5000, timeout: 12_000 });
    setSocket(s);
    s.on('connect', () => {
      setConnected(true); setNotice('Connected');
      s.emit('profile:load', { playerId, name: localStorage.getItem(NAME_KEY) || name });
      const inviteCode = new URLSearchParams(location.search).get('room');
      const savedCode = inviteCode ? null : localStorage.getItem(ROOM_KEY);
      if (inviteCode) setRoom(inviteCode.toUpperCase());
      if (savedCode) { const code = savedCode.toUpperCase(); setRoom(code); s.emit('room:resume', { code, name: localStorage.getItem(NAME_KEY) || name, playerId }); }
    });
    s.on('disconnect', () => { setConnected(false); setNotice('Disconnected. Reconnecting…'); });
    s.on('connect_error', () => setNotice('Server connection failed. Check VITE_SOCKET_URL and your backend deployment.'));
    s.on('room:update', (data) => { setRoomInfo(data); setRoom(data.code || ''); if (data.code) localStorage.setItem(ROOM_KEY, data.code); setMessages((old) => old.filter((m) => m.code === data.code)); if (data.gameId) { const found = [...games, ...customGames].find((g) => String(g.id) === String(data.gameId)); if (found) setSelected(found); } });
    s.on('room:error', (m) => setNotice(m));
    s.on('room:notice', setNotice);
    s.on('room:moderation-result', (r) => setNotice(r.message));
    s.on('game:round', (data) => { setFeedback(null); setPrivateClue(null); setAnswer(''); setHiddenMemory(false); setIsGo(false); setDrawingUrl(''); if (data.gameId) { const found = [...games, ...customGames].find((g) => String(g.id) === String(data.gameId)); if (found) setSelected(found); } if (data.kind === 'memory') setTimeout(() => setHiddenMemory(true), data.meta?.showForMs || 4500); });
    s.on('game:private', setPrivateClue);
    s.on('game:feedback', setFeedback);
    s.on('game:go', () => { setIsGo(true); setNotice('GO! Tap now!'); });
    s.on('game:result', (data) => { setRoomInfo((old) => old ? { ...old, ...(data.room || {}), scores: data.scores || old.scores, answers: data.answers || data.room?.answers || [], resultMessage: data.resultMessage || old.resultMessage } : old); setFeedback({ message: data.resultMessage || tFrom(lang, 'roundDone'), correct: true }); });
    s.on('chat:message', (m) => setMessages((old) => [...old.slice(-149), m]));
    s.on('game:draw', ({ dataUrl }) => setDrawingUrl(dataUrl));
    s.on('profile:loaded', (data) => { setProfile(data.profile); setName(data.profile?.name || name); setBio(data.profile?.bio || ''); setAvatar(data.profile?.avatar || '🙂'); setFriends(data.friends || []); setRequests(data.requests || []); });
    s.on('profile:updated', ({ profile: p, newAchievements = [] }) => { if (p) { setProfile(p); setName(p.name); setBio(p.bio || ''); setAvatar(p.avatar || '🙂'); localStorage.setItem(NAME_KEY, p.name); } if (newAchievements.length) setNotice(`Achievement unlocked: ${newAchievements.map((a) => a.title).join(', ')}`); });
    s.on('custom:list', setCustomGames); s.on('custom:created', (g) => { setCustomGames((old) => [g, ...old.filter((x) => x.id !== g.id)]); setSelected(g); setTab('games'); setNotice(`Custom game “${g.name}” saved.`); });
    s.on('ai:generated', (d) => { if (d.questions) { setAiQuestions(d.questions); setCustomPrompt(d.questions[0]?.prompt || customPrompt); setCustomOptions((d.questions[0]?.options || []).join(', ')); setCustomAnswer(d.questions[0]?.answer || ''); setCustomExplanation(d.questions[0]?.explanation || ''); setNotice(d.source === 'ai' ? 'AI provider generated questions.' : d.message || 'Generated using the local sample fallback.'); } else setNotice(d.error || 'Could not generate questions.'); });
    s.on('social:data', (data) => { setFriends(data.friends || []); setRequests(data.requests || []); setDmHistory(data.messages || []); setLeaderboard(data.leaderboard || []); setCustomGames(data.customGames || customGames); });
    s.on('social:request', (p) => { setRequests((old) => old.some((x) => x.id === p.id) ? old : [...old, p]); setNotice(`New friend request from ${p.name}.`); });
    s.on('social:notice', setNotice); s.on('dm:message', (m) => setDmHistory((old) => [...old.slice(-299), m]));
    s.on('admin:overview', setAdminData); s.on('admin:notice', setNotice); s.on('tournament:notice', setNotice);
    s.on('session:replaced', setNotice);
    s.emit('custom:list');
    const q = new URLSearchParams(location.search).get('room'); if (q) setRoom(q.toUpperCase());
    return () => { s.disconnect(); for (const pc of peerConnections.current.values()) pc.close(); localStreamRef.current?.getTracks().forEach((track) => track.stop()); };
  // This is a single socket lifetime; room resumption uses persisted identity values.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!roomInfo?.gameId) return;
    const activeGame = allGames.find((game) => String(game.id) === String(roomInfo.gameId));
    if (activeGame) setSelected(activeGame);
  }, [roomInfo?.gameId, allGames]);

  const updateProfileName = (nextName) => { setName(nextName); localStorage.setItem(NAME_KEY, nextName); };
  const createRoom = (withBots = false) => {
    if (!socket?.connected) return setNotice('Backend is not connected. Start the server or check VITE_SOCKET_URL.');
    localStorage.setItem(NAME_KEY, name.trim() || 'Player');
    socket.emit('room:create', { name: name.trim() || 'Player', playerId, gameId: selected.id, botCount: withBots ? bots : 0, chaos, marathon, teamBattle, language: lang });
  };
  const joinRoom = () => {
    if (!socket?.connected) return setNotice('Backend is not connected.');
    if (!room.trim()) return setNotice('Enter a room code or scan the room QR code.');
    localStorage.setItem(NAME_KEY, name.trim() || 'Player');
    socket.emit('room:join', { code: room.trim().toUpperCase(), name: name.trim() || 'Player', playerId });
  };
  const startGame = () => { setFeedback(null); socket?.emit('game:start', { code: room, gameId: selected.id }); };
  const submit = (value = answer) => { if (offlineGame) return; if (value === '' || value === undefined || value === null) return; socket?.emit('game:answer', { code: room, value, playerId }); setAnswer(''); };
  const sendChat = (e) => { e.preventDefault(); if (!message.trim()) return; socket?.emit('chat:send', { code: room, text: message.trim() }); setMessage(''); };
  const copyInvite = async () => { try { await navigator.clipboard.writeText(joinUrl); setNotice('Room link copied!'); } catch { setNotice('Copy the link from your browser address bar.'); } };
  const leaveRoom = () => { socket?.emit('room:leave', { code: room }); setRoomInfo(null); setRoom(''); setMessages([]); localStorage.removeItem(ROOM_KEY); setDrawingUrl(''); };
  const changeRoomSetting = (key, value) => { if (key === 'chaos') setChaos(value); if (key === 'marathon') setMarathon(value); if (key === 'teamBattle') setTeamBattle(value); if (roomInfo) socket?.emit('room:settings', { [key]: value }); };
  const makeCustomGame = () => { const options = customOptions.split(',').map((x) => x.trim()).filter(Boolean); socket?.emit('custom:create', { name: customName, prompt: customPrompt, options, answer: customAnswer, explanation: customExplanation }); };
  const generateQuestions = async () => {
    setNotice('Generating question ideas…');
    try {
      const response = await fetch(`${API}/api/generate-questions`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ topic: aiTopic, count: 5 }) });
      const data = await response.json();
      if (data.questions?.length) { setAiQuestions(data.questions); setCustomPrompt(data.questions[0].prompt); setCustomOptions(data.questions[0].options.join(', ')); setCustomAnswer(data.questions[0].answer); setCustomExplanation(data.questions[0].explanation || ''); setNotice(data.source === 'ai' ? 'AI-generated questions loaded.' : data.message || 'Sample questions loaded; no AI provider is configured.'); }
      else setNotice(data.error || 'Question generation failed.');
    } catch { socket?.emit('ai:generate', { topic: aiTopic, count: 5 }); setNotice('Trying server-side question generation…'); }
  };
  const loadAdmin = () => { setAdminData(null); socket?.emit('admin:overview', { key: adminKey }); };
  const moderate = (targetId, action) => socket?.emit('room:moderate', { targetId, action });
  const createTournament = () => socket?.emit('tournament:start');
  const sendDm = (e) => { e.preventDefault(); if (!activeFriend || !dmText.trim()) return; socket?.emit('dm:send', { toId: activeFriend.id, text: dmText.trim() }); setDmText(''); };
  const playerLabel = (id) => roomInfo?.players?.find((p) => p.id === id)?.name || profile?.name || 'Player';

  async function turnVoiceOn() {
    try {
      if (!navigator.mediaDevices?.getUserMedia) throw new Error('Microphone access requires HTTPS or localhost and a supported browser.');
      const stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true }, video: false });
      localStreamRef.current = stream; setVoiceEnabled(true); setNotice('Microphone enabled. Connecting to room members…');
    } catch (error) { setNotice(`Voice unavailable: ${error.message || 'microphone permission denied'}`); }
  }
  const turnVoiceOff = useCallback(() => {
    setVoiceEnabled(false);
    for (const pc of peerConnections.current.values()) pc.close();
    peerConnections.current.clear();
    localStreamRef.current?.getTracks().forEach((track) => track.stop()); localStreamRef.current = null;
    remoteStreamsRef.current = {}; setRemoteStreams({});
  }, []);

  useEffect(() => {
    if (!voiceEnabled || !socket || !roomInfo?.players) return undefined;
    let cancelled = false;
    const createPeer = (peerId) => {
      if (peerConnections.current.has(peerId)) return peerConnections.current.get(peerId);
      const pc = new RTCPeerConnection({ iceServers: ICE_SERVERS, iceCandidatePoolSize: 4 });
      localStreamRef.current?.getTracks().forEach((track) => pc.addTrack(track, localStreamRef.current));
      pc.onicecandidate = (event) => { if (event.candidate) socket.emit('voice:signal', { targetId: peerId, signal: { type: 'candidate', candidate: event.candidate } }); };
      pc.ontrack = (event) => {
        const stream = event.streams[0]; remoteStreamsRef.current = { ...remoteStreamsRef.current, [peerId]: stream }; setRemoteStreams({ ...remoteStreamsRef.current });
      };
      pc.onconnectionstatechange = () => {
        if (['failed', 'closed'].includes(pc.connectionState)) { pc.close(); peerConnections.current.delete(peerId); }
      };
      peerConnections.current.set(peerId, pc); return pc;
    };
    const onSignal = async ({ fromId, signal }) => {
      if (cancelled || fromId === playerId || !signal) return;
      try {
        const pc = createPeer(fromId);
        if (signal.type === 'offer') {
          await pc.setRemoteDescription(new RTCSessionDescription(signal.sdp));
          const answerSdp = await pc.createAnswer(); await pc.setLocalDescription(answerSdp);
          socket.emit('voice:signal', { targetId: fromId, signal: { type: 'answer', sdp: pc.localDescription } });
        } else if (signal.type === 'answer') {
          if (pc.signalingState === 'have-local-offer') await pc.setRemoteDescription(new RTCSessionDescription(signal.sdp));
        } else if (signal.type === 'candidate' && signal.candidate) {
          await pc.addIceCandidate(new RTCIceCandidate(signal.candidate));
        }
      } catch (error) { setNotice(`Voice connection issue: ${error.message || 'signalling failed'}`); }
    };
    socket.on('voice:signal', onSignal);
    const peers = roomInfo.players.filter((p) => !p.isBot && p.online && p.id !== playerId && String(playerId) < String(p.id));
    (async () => {
      for (const p of peers) {
        if (cancelled || peerConnections.current.has(p.id)) continue;
        try { const pc = createPeer(p.id); const offer = await pc.createOffer(); await pc.setLocalDescription(offer); socket.emit('voice:signal', { targetId: p.id, signal: { type: 'offer', sdp: pc.localDescription } }); }
        catch (error) { setNotice(`Could not start voice with ${p.name}: ${error.message || 'connection failed'}`); }
      }
    })();
    return () => { cancelled = true; socket.off('voice:signal', onSignal); };
  }, [voiceEnabled, socket, roomInfo?.players, playerId]);

  useEffect(() => {
    if (!roundData) return;
    if (roundData.kind === 'memory') { setHiddenMemory(false); const timer = setTimeout(() => setHiddenMemory(true), roundData.meta?.showForMs || 4500); return () => clearTimeout(timer); }
    if (roundData.kind === 'reaction' || roundData.kind === 'reaction-duel') { setIsGo(false); const timer = setTimeout(() => setIsGo(true), Math.max(0, (roundData.meta?.goAt || Date.now() + 2500) - Date.now())); return () => clearTimeout(timer); }
  }, [roomInfo?.round, roundData?.kind]);

  const handleDrawPointer = (event, type) => {
    const canvas = drawingCanvas.current; if (!canvas) return;
    const ctx = canvas.getContext('2d'); const bounds = canvas.getBoundingClientRect();
    const point = { x: (event.clientX - bounds.left) * (canvas.width / bounds.width), y: (event.clientY - bounds.top) * (canvas.height / bounds.height) };
    if (type === 'down') { drawingActive.current = true; ctx.beginPath(); ctx.moveTo(point.x, point.y); event.currentTarget.setPointerCapture?.(event.pointerId); }
    else if (type === 'move' && drawingActive.current) { ctx.lineWidth = 5; ctx.lineCap = 'round'; ctx.strokeStyle = '#7c3aed'; ctx.lineTo(point.x, point.y); ctx.stroke(); }
    else if (type === 'up') { drawingActive.current = false; try { socket?.emit('game:draw', { code: room, dataUrl: canvas.toDataURL('image/png') }); } catch { setNotice('Could not send drawing; try a smaller sketch.'); } }
  };
  const clearDrawing = () => { const canvas = drawingCanvas.current; if (!canvas) return; canvas.getContext('2d').clearRect(0, 0, canvas.width, canvas.height); setDrawingUrl(''); };

  if (offlineGame) return <main><Header connected={connected} lang={lang} setLang={setLang} t={t} /><OfflineRound game={offlineGame} lang={lang} onBack={() => setOfflineGame(null)} /></main>;

  return <main>
    <Header connected={connected} lang={lang} setLang={setLang} t={t} />
    <section className="hero"><p className="eyebrow">YOUR FRIEND GROUP, YOUR GAME NIGHT</p><h1>46 games. One room.<br /><span>Unlimited chaos.</span></h1><p>Play with friends, practise offline, or fill the room with bots when everyone’s busy.</p><div className="hero-chips"><span>🔗 QR invites</span><span>🎙️ Voice rooms</span><span>🏆 XP & tournaments</span><span>🌐 English / தமிழ்</span></div></section>
    <nav className="main-tabs" aria-label="Main navigation">
      {[['games', t('gameNight'), '🎮'], ['friends', t('friends'), '💬'], ['profile', t('profile'), '🏅'], ['custom', t('custom'), '🧪'], ['admin', t('admin'), '🛠️']].map(([id, label, emoji]) => <button key={id} className={tab === id ? 'active' : ''} onClick={() => setTab(id)}>{emoji} {label}</button>)}
    </nav>
    {notice && <div className="global-notice" role="status"><span>{notice}</span><button aria-label="Dismiss notice" onClick={() => setNotice('')}>×</button></div>}

    {tab === 'games' && <div className="layout">
      <section className="panel setup-panel"><h2>{t('setup')}</h2>
        <label>{t('nickname')}<input value={name} maxLength={24} onChange={(e) => updateProfileName(e.target.value)} placeholder="Enter nickname" /></label>
        <div className="split"><button className="primary" onClick={() => createRoom(false)}>{t('create')}</button><button className="secondary" onClick={() => createRoom(true)}>{t('bots')}</button></div>
        <div className="option-toggles"><label className="checkline"><input type="checkbox" checked={chaos} onChange={(e) => changeRoomSetting('chaos', e.target.checked)} /> 🌪️ {t('chaos')}</label><label className="checkline"><input type="checkbox" checked={marathon} onChange={(e) => changeRoomSetting('marathon', e.target.checked)} /> 🏃 {t('marathon')}</label><label className="checkline"><input type="checkbox" checked={teamBattle} onChange={(e) => changeRoomSetting('teamBattle', e.target.checked)} /> 🧑‍🤝‍🧑 {t('teams')}</label></div>
        <label>{t('roomCode')}<input value={room} maxLength={8} onChange={(e) => setRoom(e.target.value.toUpperCase())} placeholder="e.g. A7K2PQ" /></label><button className="primary wide" onClick={joinRoom}>{t('join')}</button>
        {room && <div className="qr"><QRCodeSVG value={joinUrl || room} size={132} level="M" /><div><b>{t('scan')}</b><p>Friends open the invite URL, enter their nickname, and tap Join with code.</p><button className="secondary" onClick={copyInvite}>{t('copyLink')}</button></div></div>}
        {roomInfo && <div className="room-summary"><div><small>ROOM CODE</small><strong>{room}</strong></div><div><small>PLAYERS</small><strong>{roomInfo.players?.length || 0}/12</strong></div><div><small>ROUND</small><strong>{roomInfo.round || 0}</strong></div></div>}
        <div className="offline-box"><span>📵</span><div><b>{t('offlineTitle')}</b><p>{t('offlineText')}</p><button className="secondary" onClick={() => setOfflineGame(selected)}>{t('offline')}</button></div></div>
      </section>

      <section className="panel lobby"><div className="section-head"><div><h2>{roomInfo ? `Room ${room || ''}` : t('chooseGame')}</h2><p>{roomInfo ? 'Share the code or QR with friends. Room settings are controlled by the host.' : 'Select a game, then create a room or start offline practice.'}</p></div><span className="count">{allGames.length} GAMES</span></div>
        <input className="game-search" value={search} onChange={(e) => setSearch(e.target.value)} placeholder={t('search')} aria-label={t('search')} />
        <div className="filters"><button className={category === 'all' ? 'active' : ''} onClick={() => setCategory('all')}>{t('all')}</button>{['quiz','party','arcade','puzzle','social','word','creative','skill','strategy','custom'].map((c) => <button key={c} className={category === c ? 'active' : ''} onClick={() => setCategory(c)}>{c}</button>)}</div>
        <div className="game-grid">{filtered.map((g) => <button key={g.id} className={`game ${String(selected.id) === String(g.id) ? 'chosen' : ''}`} onClick={() => setSelected(g)}><span className="game-icon">{['🎯','🕵️','🎉','🎨','🤔','🔐','⚡','🧠','🎬','🎵','🏷️','🧩'][Number(g.id) % 12] || '✨'}</span><b>{g.name}</b><small>{g.description}</small><span className="kind-pill">{g.category}</span></button>)}</div>
        {roomInfo && <GameRoom socket={socket} roomInfo={roomInfo} selected={selected} roundData={roundData} privateClue={privateClue} currentPlayer={currentPlayer} isHost={isHost} playerId={playerId} answer={answer} setAnswer={setAnswer} submit={submit} startGame={startGame} leaveRoom={leaveRoom} feedback={feedback} hiddenMemory={hiddenMemory} isGo={isGo} isOnline={connected} voiceEnabled={voiceEnabled} turnVoiceOn={turnVoiceOn} turnVoiceOff={turnVoiceOff} remoteStreams={remoteStreams} moderate={moderate} createTournament={createTournament} onSelectGame={setSelected} drawingCanvas={drawingCanvas} drawingUrl={drawingUrl} handleDrawPointer={handleDrawPointer} clearDrawing={clearDrawing} room={room} t={t} />}
      </section>

      <aside className="panel chat"><div className="section-head"><div><h2>{t('roomChat')}</h2><p>{roomInfo ? 'Keep chat friendly. The host can mute or remove players.' : t('noRoom')}</p></div><span className={`mini-status ${connected ? 'green' : ''}`}>{connected ? 'LIVE' : 'OFFLINE'}</span></div>
        <div className="chat-list" aria-live="polite">{messages.filter((m) => !room || m.code === room).map((m) => <p className="chat-message" key={m.id || `${m.at}-${m.name}`}><b>{m.name}</b> <span>{m.text}</span><small>{new Date(m.at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</small></p>)}{!messages.length && <p className="muted">Chat messages appear here when you join a room.</p>}</div>
        <form onSubmit={sendChat} className="chat-form"><input value={message} maxLength={300} onChange={(e) => setMessage(e.target.value)} placeholder={t('message')} disabled={!roomInfo} /><button className="primary" type="submit" disabled={!roomInfo}>{t('send')}</button></form>
        <div className="bot-card"><span>🤖</span><div><b>No friends online?</b><p>{t('botNote')}</p><label>{t('botPlayers')}<select value={bots} onChange={(e) => setBots(Number(e.target.value))}>{[1,2,3,4,5,6].map((n) => <option key={n} value={n}>{n} bots</option>)}</select></label></div></div>
      </aside>
    </div>}

    {tab === 'friends' && <section className="wide-tab panel"><div className="section-head"><div><h2>{t('friends')}</h2><p>Send requests by nickname. Users must open Lava Mart once to become discoverable.</p></div><button className="secondary" onClick={() => socket?.emit('social:refresh')}>↻ Refresh</button></div>
      <form className="inline-form" onSubmit={(e) => { e.preventDefault(); socket?.emit('friend:request', { target: friendTarget }); setFriendTarget(''); }}><input value={friendTarget} onChange={(e) => setFriendTarget(e.target.value)} placeholder={t('username')} /><button className="primary">{t('friendRequest')}</button></form>
      {requests.length > 0 && <div className="subsection"><h3>Incoming requests</h3><div className="profile-list">{requests.map((p) => <div className="profile-row" key={p.id}><span className="avatar">{p.avatar || '🙂'}</span><div><b>{p.name}</b><small>@{p.username}</small></div><button className="primary" onClick={() => socket?.emit('friend:accept', { fromId: p.id })}>{t('accept')}</button></div>)}</div></div>}
      <div className="social-grid"><div className="subsection"><h3>Friends ({friends.length})</h3>{!friends.length && <p className="muted">No friends yet. Send a friend request above.</p>}<div className="profile-list">{friends.map((p) => <button className={`profile-row selectable ${activeFriend?.id === p.id ? 'selected' : ''}`} key={p.id} onClick={() => setActiveFriend(p)}><span className="avatar">{p.avatar || '🙂'}</span><div><b>{p.name}</b><small>@{p.username} · Lv {p.level || 1}</small></div><span>✉️</span></button>)}</div></div>
        <div className="subsection dm-box"><h3>{activeFriend ? `${t('privateMessage')}: ${activeFriend.name}` : t('privateMessages')}</h3>{activeFriend ? <><div className="dm-list">{dmHistory.filter((m) => (m.fromId === playerId && m.toId === activeFriend.id) || (m.toId === playerId && m.fromId === activeFriend.id)).map((m) => <div className={`dm-message ${m.fromId === playerId ? 'mine' : ''}`} key={m.id}><small>{m.fromId === playerId ? 'You' : activeFriend.name} · {new Date(m.at).toLocaleString()}</small><p>{m.text}</p></div>)}</div><form className="inline-form" onSubmit={sendDm}><input value={dmText} onChange={(e) => setDmText(e.target.value)} maxLength={500} placeholder="Write a private message…" /><button className="primary">{t('sendDM')}</button></form></> : <p className="muted">Choose a friend to open the conversation. Private messages are stored by the backend.</p>}</div></div>
    </section>}

    {tab === 'profile' && <section className="wide-tab panel"><div className="section-head"><div><h2>{t('profile')}</h2><p>Your profile, achievements, XP, coins and the community leaderboard.</p></div><button className="secondary" onClick={() => socket?.emit('social:refresh')}>↻ Refresh</button></div>
      <div className="profile-dashboard"><div className="profile-editor"><div className="profile-avatar">{avatar}</div><label>{t('nickname')}<input value={name} onChange={(e) => updateProfileName(e.target.value)} maxLength={24} /></label><label>{t('bio')}<textarea value={bio} onChange={(e) => setBio(e.target.value)} maxLength={160} rows={3} placeholder="One line about you…" /></label><label>Avatar<select value={avatar} onChange={(e) => setAvatar(e.target.value)}>{AVATARS.map((a) => <option key={a} value={a}>{a}</option>)}</select></label><button className="primary wide" onClick={() => socket?.emit('profile:update', { name, bio, avatar })}>{t('save')}</button></div>
        <div className="profile-stats"><div className="stat-card"><small>{t('level')}</small><strong>{profile?.level || 1}</strong><p>{profile?.xp || 0} {t('xp')}</p><div className="xp-bar"><span style={{ width: `${(profile?.xp || 0) % 100}%` }} /></div></div><div className="stat-card"><small>{t('coins')}</small><strong>🪙 {profile?.coins ?? 50}</strong><p>Earn coins from rounds.</p></div><div className="stat-card"><small>Games played</small><strong>{profile?.gamesPlayed || 0}</strong><p>Wins: {profile?.wins || 0}</p></div><div className="stat-card"><small>{t('achievements')}</small><strong>{profile?.achievements?.length || 0}</strong><p>Unlock new badges through play.</p></div>
          <div className="subsection"><h3>{t('achievements')}</h3><div className="achievement-grid">{(profile?.achievements || []).map((a) => <div className="achievement" key={a.id}><span>🏅</span><b>{a.title}</b><small>{a.description}</small></div>)}{!profile?.achievements?.length && <p className="muted">Complete online rounds to unlock achievements.</p>}</div></div></div>
      </div>
      <div className="subsection"><h3>{t('leaderboard')}</h3><div className="leaderboard">{leaderboard.map((p, i) => <div key={p.id} className="leader-row"><span className="rank">{i + 1}</span><span className="avatar">{p.avatar || '🙂'}</span><b>{p.name}</b><span>Lv {p.level || 1}</span><strong>{p.xp} XP</strong></div>)}{!leaderboard.length && <p className="muted">Leaderboard will fill as profiles earn XP.</p>}</div></div>
    </section>}

    {tab === 'custom' && <section className="wide-tab panel"><div className="section-head"><div><h2>Custom Game Creator & AI Questions</h2><p>Create your own multiple-choice games, or generate question ideas with an optional AI provider.</p></div></div>
      <div className="custom-layout"><div className="custom-form"><label>Game name<input value={customName} onChange={(e) => setCustomName(e.target.value)} maxLength={50} /></label><label>Question / prompt<textarea value={customPrompt} onChange={(e) => setCustomPrompt(e.target.value)} maxLength={240} rows={3} /></label><label>Options (comma separated)<input value={customOptions} onChange={(e) => setCustomOptions(e.target.value)} placeholder="Option A, Option B, Option C, Option D" /></label><label>{t('correctAnswer')}<input value={customAnswer} onChange={(e) => setCustomAnswer(e.target.value)} /></label><label>Explanation (optional)<input value={customExplanation} onChange={(e) => setCustomExplanation(e.target.value)} maxLength={240} /></label><button className="primary wide" onClick={makeCustomGame} disabled={!connected}>＋ {t('createGame')}</button></div>
        <div className="ai-form"><div className="ai-icon">✨</div><h3>Question generator</h3><p>The server calls an AI provider only when an API key is configured. Otherwise it uses a clearly labelled built-in sample fallback.</p><label>{t('topic')}<input value={aiTopic} onChange={(e) => setAiTopic(e.target.value)} maxLength={90} /></label><button className="secondary wide" onClick={generateQuestions}>{t('generateAI')}</button>{aiQuestions.length > 0 && <div className="generated-list"><b>Generated choices</b>{aiQuestions.map((q, i) => <button key={`${q.prompt}-${i}`} className="generated-question" onClick={() => { setCustomPrompt(q.prompt); setCustomOptions(q.options.join(', ')); setCustomAnswer(q.answer); setCustomExplanation(q.explanation || ''); setCustomName(`${aiTopic} Quiz`); }}><span>{i + 1}.</span>{q.prompt}</button>)}</div>}</div></div>
      <div className="subsection"><h3>Saved custom games ({customGames.length})</h3><div className="custom-list">{customGames.map((g) => <button key={g.id} className="custom-row" onClick={() => { setSelected(g); setTab('games'); }}>{g.name}<small>{g.description}</small></button>)}{!customGames.length && <p className="muted">Your saved games appear here after creation.</p>}</div></div>
    </section>}

    {tab === 'admin' && <section className="wide-tab panel"><div className="section-head"><div><h2>{t('admin')}</h2><p>Optional server administration. Set ADMIN_KEY on the backend; never put it in a VITE_ variable or client source.</p></div></div><div className="inline-form admin-form"><input type="password" value={adminKey} onChange={(e) => setAdminKey(e.target.value)} placeholder={t('adminKey')} /><button className="primary" onClick={loadAdmin}>{t('loadAdmin')}</button></div>{adminData ? <><div className="stats-strip"><div><small>Live rooms</small><strong>{adminData.rooms?.length || 0}</strong></div><div><small>Online players</small><strong>{adminData.onlinePlayers || 0}</strong></div><div><small>Profiles</small><strong>{adminData.profiles || 0}</strong></div><div><small>Custom games</small><strong>{adminData.customGames || 0}</strong></div></div><div className="subsection"><h3>Live room moderation</h3><div className="admin-room-list">{(adminData.rooms || []).map((r) => <div className="admin-room admin-room-expanded" key={r.code}><div className="admin-room-heading"><div><b>{r.code}</b><small>{r.players} players · Round {r.round} · Game {r.gameId} · {r.started ? 'In progress' : 'Waiting'}</small></div><button className="danger" onClick={() => socket?.emit('admin:act', { key: adminKey, code: r.code, action: 'close-room' })}>{t('closeRoom')}</button></div><div className="admin-player-list">{(r.playerList || []).map((p) => <div className="admin-player" key={p.id}><span>{p.name}{p.isBot ? ' · Bot' : ''}{p.muted ? ' · Muted' : ''}</span>{!p.isBot && <div className="button-row"><button className="small-button" onClick={() => socket?.emit('admin:act', { key: adminKey, code: r.code, targetId: p.id, action: p.muted ? 'unmute' : 'mute' })}>{p.muted ? 'Unmute' : 'Mute'}</button><button className="small-button danger-outline" onClick={() => { if (window.confirm(`Remove ${p.name} from room ${r.code}?`)) socket?.emit('admin:act', { key: adminKey, code: r.code, targetId: p.id, action: 'kick' }); }}>Kick</button></div>}</div>)}</div></div>)}{!adminData.rooms?.length && <p className="muted">No live rooms.</p>}</div></div><div className="subsection"><h3>Recent moderation events</h3>{(adminData.moderationLog || []).slice().reverse().map((m, i) => <p key={`${m.at}-${i}`} className="audit-entry">{new Date(m.at).toLocaleString()} — {m.action} — room {m.code}</p>)}</div></> : <p className="muted">Enter the server-side admin key to view live rooms, close rooms, and inspect the recent moderation log.</p>}</section>}

    <footer>🌋 Lava Mart · Be kind, play fair, have fun. · <a href={`${API}/health`} target="_blank" rel="noreferrer">Backend health</a></footer>
  </main>;
}

function Header({ connected, lang, setLang, t }) {
  return <header><div className="brand">🌋 <span>Lava Mart</span></div><div className="header-right"><label className="language-label">🌐 <select value={lang} onChange={(e) => setLang(e.target.value)} aria-label={t('language')}><option value="en">{t('english')}</option><option value="ta">{t('tamil')}</option></select></label><span className={`status ${connected ? 'online' : ''}`}>{connected ? `● ${t('online')}` : `○ ${t('connecting')}`}</span></div></header>;
}

function GameRoom(props) {
  const { roomInfo, selected, roundData, privateClue, currentPlayer, isHost, playerId, answer, setAnswer, submit, startGame, leaveRoom, feedback, hiddenMemory, isGo, voiceEnabled, turnVoiceOn, turnVoiceOff, remoteStreams, moderate, createTournament, onSelectGame, drawingCanvas, drawingUrl, handleDrawPointer, clearDrawing, room, t } = props;
  const players = roomInfo.players || [];
  const [reactionLocalTime, setReactionLocalTime] = useState(null);
  const isDrawer = roundData?.kind === 'drawing' && privateClue?.role === 'Drawer';
  const canAnswer = roomInfo.started && !roomInfo.answers?.length;
  const renderOption = (option, index) => {
    const value = roundData?.meta?.optionIds?.[index] || option;
    return <button className="secondary option" key={`${option}-${index}`} onClick={() => submit(value)}>{option}</button>;
  };
  const drawGame = roundData?.kind === 'drawing';
  const boardGame = roundData?.kind === 'tic-tac-toe' || roundData?.kind === 'connect-four';
  return <div className="play-area">
    <div className="round-heading"><div><span className="round-label">ROUND {roomInfo.round || 0}</span><h3>{roundData?.gameName || selected.name}</h3></div><div className="round-actions"><button className={voiceEnabled ? 'danger' : 'secondary'} onClick={voiceEnabled ? turnVoiceOff : turnVoiceOn}>{voiceEnabled ? `🎙️ ${t('leaveVoice')}` : `🎙️ ${t('voice')}`}</button>{isHost && <button className="secondary" onClick={createTournament}>🏆 {t('tournament')}</button>}</div></div>
    <div className="players">{players.map((p) => <div className={`player ${p.id === playerId ? 'me' : ''}`} key={p.id}><span>{p.avatar || (p.isBot ? '🤖' : '🙂')}</span><b>{p.name}{p.id === playerId ? ' (you)' : ''}</b><small>{roomInfo.scores?.[p.id] ?? 0} pts {p.team ? `· Team ${p.team}` : ''}{!p.online && !p.isBot ? ' · reconnecting' : ''}</small>{isHost && !p.isBot && p.id !== playerId && <div className="moderation-buttons"><button title="Mute/unmute" onClick={() => moderate(p.id, p.muted ? 'unmute' : 'mute')}>{p.muted ? '🔈' : '🔇'}</button><button title="Remove player" onClick={() => moderate(p.id, 'kick')}>✕</button></div>}</div>)}</div>
    {roomInfo.settings?.teamBattle && <div className="team-score-strip"><span>🟣 Team A: {players.filter((p) => p.team === 'A').reduce((sum, p) => sum + (roomInfo.scores?.[p.id] || 0), 0)} pts</span><span>🔵 Team B: {players.filter((p) => p.team === 'B').reduce((sum, p) => sum + (roomInfo.scores?.[p.id] || 0), 0)} pts</span></div>}
    {roomInfo.settings && <div className="active-modifiers">{roomInfo.settings.chaos && <span>🌪️ Chaos Mode</span>}{roomInfo.settings.marathon && <span>🏃 Party Marathon</span>}{roomInfo.settings.teamBattle && <span>👥 Team Battle</span>}</div>}
    {!roundData && <div className="waiting-card"><div className="waiting-orb">🎲</div><h4>Ready to play?</h4><p>Select a game from the catalogue. {isHost ? 'Start a round when everyone is ready.' : 'The host will start the round.'}</p></div>}
    {roundData && <div className="round-card"><p className="round-prompt">{roundData.prompt}</p>
      {privateClue?.secret && <div className="private-clue"><small>{t('yourRole')}</small><b>{privateClue.role || 'Private clue'}</b><p>{privateClue.secret}</p></div>}
      {roundData.kind === 'memory' && <div className="memory-sequence">{hiddenMemory ? '❔ ❔ ❔ ❔ ❔' : (roundData.meta?.sequence || []).join(' ')}</div>}
      {roundData.kind === 'tic-tac-toe' && <div className="ttt-board">{(roundData.board || Array(9).fill('')).map((cell, i) => <button key={i} disabled={Boolean(cell) || roundData.meta?.turn !== playerId || roomInfo.answers?.length > 0} onClick={() => submit(i)}>{cell || '·'}</button>)}</div>}
      {roundData.kind === 'connect-four' && <div className="connect-board"><div className="connect-columns">{Array.from({ length: 7 }, (_, i) => <button key={i} disabled={roundData.meta?.turn !== playerId || roomInfo.answers?.length > 0} onClick={() => submit(i)}>{i + 1}</button>)}</div><div className="connect-grid">{(roundData.board || Array.from({ length: 6 }, () => Array(7).fill(''))).flatMap((row, ri) => row.map((cell, ci) => <span key={`${ri}-${ci}`} className={`connect-cell ${cell === '🔴' ? 'red' : cell === '🟡' ? 'yellow' : ''}`} />))}</div></div>}
      {drawGame && <div className="drawing-zone">{isDrawer ? <><canvas ref={drawingCanvas} width={540} height={300} onPointerDown={(e) => handleDrawPointer(e, 'down')} onPointerMove={(e) => handleDrawPointer(e, 'move')} onPointerUp={(e) => handleDrawPointer(e, 'up')} onPointerCancel={(e) => handleDrawPointer(e, 'up')} aria-label={t('drawing')} /><div className="split"><button className="secondary" onClick={clearDrawing}>Clear drawing</button><span className="muted">Your sketch is broadcast to room members.</span></div></> : <>{drawingUrl ? <img className="remote-drawing" src={drawingUrl} alt="Live drawing shared by the drawer" /> : <div className="empty-drawing">🖍️ Waiting for the drawer’s sketch…</div>}{!roomInfo.answers?.some((a) => a.id === playerId) && <form className="answer-box" onSubmit={(e) => { e.preventDefault(); submit(); }}><label>Guess the drawing<input value={answer} onChange={(e) => setAnswer(e.target.value)} placeholder="What is being drawn?" maxLength={80} /></label><button className="primary">Guess</button></form>}</>}</div>}
      {roundData.kind === 'reaction' || roundData.kind === 'reaction-duel' ? <button className={`reaction-button ${isGo ? 'go' : ''}`} disabled={!isGo || Boolean(roomInfo.answers?.some((a) => a.id === playerId))} onClick={() => { setReactionLocalTime(Date.now()); submit('tap'); }}>{isGo ? `⚡ ${t('go')}` : t('wait')}</button> : null}
      {roundData.options?.length > 0 && !['tic-tac-toe', 'connect-four', 'memory', 'reaction', 'reaction-duel', 'drawing'].includes(roundData.kind) && <div className="option-grid">{roundData.options.map(renderOption)}</div>}
      {!['tic-tac-toe', 'connect-four', 'memory', 'reaction', 'reaction-duel', 'drawing'].includes(roundData.kind) && <form className="answer-box" onSubmit={(e) => { e.preventDefault(); submit(); }}><label>{t('answer')}<input value={answer} onChange={(e) => setAnswer(e.target.value)} maxLength={600} placeholder={roundData.inputHint || 'Type your answer…'} disabled={Boolean(roomInfo.answers?.some((a) => a.id === playerId))} /></label><button className="primary" type="submit" disabled={Boolean(roomInfo.answers?.some((a) => a.id === playerId))}>{t('submit')}</button></form>}
      {feedback && <p className={`feedback ${feedback.correct ? 'positive' : ''}`} role="status">{feedback.message || (feedback.correct ? 'Correct!' : feedback.points !== undefined ? `${feedback.points} points` : 'Answer recorded.')}{feedback.hint ? ` · ${feedback.hint}` : ''}{feedback.reaction ? ` · ${feedback.reaction} ms` : ''}</p>}
      {roomInfo.resultMessage && <div className="result-message"><b>🏁 {t('result')}</b><p>{roomInfo.resultMessage}</p></div>}
      {roomInfo.answers?.length > 0 && <div className="answers"><b>{t('roundAnswers')}</b>{roomInfo.answers.map((a, i) => <p key={a.id || i}><strong>{a.name}:</strong> {a.answer} {a.points !== undefined ? <span className="answer-points">+{a.points}</span> : ''}</p>)}</div>}
    </div>}
    {roomInfo.tournament && <div className="tournament-card"><div className="section-head"><div><h4>🏆 Tournament — Round {roomInfo.tournament.round}</h4><p>{roomInfo.tournament.champion ? `Champion: ${playerLabelById(players, roomInfo.tournament.champion)}` : 'Host: select the winner for each match to advance.'}</p></div></div><div className="tournament-matches">{roomInfo.tournament.matches.map((m) => <div className="tournament-match" key={m.id}><span>{m.a?.name || 'TBD'} vs {m.b?.name || 'TBD'}</span>{m.winner ? <b>Winner: {playerLabelById(players, m.winner)}</b> : isHost ? <div><button className="primary" onClick={() => props.socket?.emit('tournament:advance', { matchId: m.id, winnerId: m.a?.id })}>{m.a?.name} wins</button>{m.b?.id && <button className="secondary" onClick={() => props.socket?.emit('tournament:advance', { matchId: m.id, winnerId: m.b?.id })}>{m.b?.name} wins</button>}</div> : null}</div>)}</div></div>}
    <div className="split room-bottom-actions">{isHost && <button className="primary" onClick={startGame}>{t('startRound')}</button>}<button className="secondary" onClick={leaveRoom}>{t('leaveRoom')}</button></div>
    {remoteStreams && Object.entries(remoteStreams).length > 0 && <div className="remote-audio-list">{Object.entries(remoteStreams).map(([id, stream]) => <RemoteAudio key={id} stream={stream} name={playerLabelById(players, id)} />)}</div>}
  </div>;
}
function playerLabelById(players, id) { return players?.find((p) => p.id === id)?.name || 'Player'; }

export default App;
