import { games, sampleQuestions, promptBank, words, typingPhrases } from '../shared/games.js';

const choiceBank = [
  { prompt: 'Would you rather explore the ocean or outer space?', options: ['Ocean', 'Outer space'] },
  { prompt: 'Pick your team power-up:', options: ['Double points', 'One extra life', 'Steal a clue', 'Freeze the timer'] },
  { prompt: 'Which would make the better pet?', options: ['Tiny dragon', 'Giant hamster', 'Robot dog', 'Invisible cat'] },
];
const riddleBank = [
  { prompt: 'I speak without a mouth and hear without ears. I have nobody, but I come alive with wind. What am I?', answer: 'echo', hint: 'You hear it bounce back.' },
  { prompt: 'What has keys but cannot open locks?', answer: 'piano', hint: 'It makes music.' },
  { prompt: 'What gets wetter the more it dries?', answer: 'towel', hint: 'You might use it after a shower.' },
];
const emojiBank = [
  { prompt: 'Guess the movie: 🦁👑', answer: 'the lion king', options: ['The Lion King', 'Madagascar', 'Tarzan', 'Zootopia'] },
  { prompt: 'Guess the movie: 🚢🧊❤️', answer: 'titanic', options: ['Titanic', 'Frozen', 'Moana', 'Jaws'] },
  { prompt: 'Guess the movie: 🕷️👨🏙️', answer: 'spider-man', options: ['Spider-Man', 'Batman', 'Superman', 'Iron Man'] },
];
const songBank = [
  { prompt: 'Song clue: A famous ABBA hit about a dancing queen. Name the song.', answer: 'dancing queen' },
  { prompt: 'Song clue: Queen’s stadium anthem with the line “We will, we will…”', answer: 'we will rock you' },
  { prompt: 'Song clue: A Beatles song with a yellow underwater vehicle.', answer: 'yellow submarine' },
];
const logoBank = [
  { prompt: 'Logo clue: A bitten piece of fruit is the symbol of this technology company.', answer: 'apple' },
  { prompt: 'Logo clue: Three parallel stripes are strongly associated with this sportswear brand.', answer: 'adidas' },
  { prompt: 'Logo clue: A swoosh mark is used by this sports brand.', answer: 'nike' },
];
const soundBank = [
  { prompt: 'Sound clue: “Ding-dong!” What object most likely made the sound?', answer: 'doorbell', options: ['Doorbell', 'Kettle', 'Drum', 'Car horn'] },
  { prompt: 'Sound clue: “Tick-tock, tick-tock.” What are you hearing?', answer: 'clock', options: ['Clock', 'Rain', 'Footsteps', 'Bird'] },
];
const items = ['a golden key', 'a hidden map', 'a tiny robot', 'a lost crown', 'a mystery sandwich'];
const locations = ['space station', 'beach resort', 'ancient library', 'football stadium', 'mountain cabin', 'airport'];
const agents = ['Protect the secret word', 'Make two players say the same word', 'Get someone to choose the left option', 'Convince the group to vote for you'];
const random = (max) => Math.floor(Math.random() * max);
const pick = (array) => array[random(array.length)];
const shuffle = (array) => [...array].sort(() => Math.random() - 0.5);
const normalise = (value) => String(value ?? '').trim().toLocaleLowerCase().replace(/[^\p{L}\p{N}\s'-]/gu, '').replace(/\s+/g, ' ');

export function getGame(id, customGames = []) {
  const standard = games.find((game) => String(game.id) === String(id));
  if (standard) return standard;
  return customGames.find((game) => String(game.id) === String(id)) || null;
}

export function createRound(game, players, roundNumber = 1, options = {}) {
  const kind = game?.kind || 'prompt';
  const humanPlayers = players.filter((player) => !player.isBot);
  const round = {
    kind, gameId: game.id, gameName: game.name, round: roundNumber,
    prompt: '', options: [], inputHint: 'Enter your answer…', board: null,
    answerKey: null, privateByPlayer: {}, meta: {}, explain: '',
  };
  const names = players.map((player) => player.name);
  if (kind === 'custom-trivia') { round.prompt = String(game.prompt || 'Custom question'); round.options = Array.isArray(game.options) ? game.options.slice(0, 6) : []; round.answerKey = game.answer || null; round.explain = game.explanation || ''; if (options.chaos) { round.meta.chaos = 'DOUBLE POINTS'; round.prompt = `🌪️ CHAOS: DOUBLE POINTS. ${round.prompt}`; } return round; }

  if (kind === 'prompt') round.prompt = pick(promptBank.prompt);
  else if (kind === 'truth-dare') {
    round.prompt = pick(['Choose one: Truth, Dare, or Friendly Roast.', ...promptBank.truth, ...promptBank.dare, ...promptBank.roast]);
    round.options = ['Truth', 'Dare', 'Friendly Roast'];
    round.meta.stage = 'choose';
  } else if (kind === 'choice') {
    const item = pick(choiceBank); round.prompt = item.prompt; round.options = item.options;
  } else if (kind === 'trivia' || kind === 'puzzle' || kind === 'escape') {
    const q = pick(sampleQuestions); round.prompt = kind === 'escape' ? `Escape Room — clue ${((roundNumber - 1) % 3) + 1}: ${q.prompt}` : q.prompt;
    round.options = q.options; round.answerKey = q.answer; round.explain = q.explanation;
  } else if (kind === 'emoji') {
    const q = pick(emojiBank); round.prompt = q.prompt; round.options = q.options; round.answerKey = q.answer;
  } else if (kind === 'song') { const q = pick(songBank); round.prompt = q.prompt; round.answerKey = q.answer; }
  else if (kind === 'logo') { const q = pick(logoBank); round.prompt = q.prompt; round.answerKey = q.answer; }
  else if (kind === 'riddle') { const q = pick(riddleBank); round.prompt = q.prompt; round.answerKey = q.answer; round.meta.hint = q.hint; }
  else if (kind === 'word-chain') { round.prompt = 'Start the chain with a word beginning with S. The next valid word must begin with the previous word’s last letter.'; round.meta.lastLetter = 'S'; round.meta.usedWords = []; round.inputHint = 'A word starting with S…'; }
  else if (kind === 'memory') { const pool = ['🍋', '🚀', '🐱', '🌈', '🎸', '🍕', '⚽', '🌻', '🦊', '🎲']; const sequence = Array.from({ length: Math.min(7, 3 + Math.floor(roundNumber / 2)) }, () => pick(pool)); round.prompt = 'Memorise this sequence, then enter the emojis in the same order (separate with spaces).'; round.meta.sequence = sequence; round.meta.showForMs = 4500; round.inputHint = 'Repeat the emoji sequence…'; }
  else if (kind === 'math') { const a = 2 + random(19); const b = 2 + random(12); const op = pick(['+', '−', '×']); const answer = op === '+' ? a + b : op === '−' ? Math.max(a, b) - Math.min(a, b) : a * b; round.prompt = `Solve quickly: ${op === '−' ? `${Math.max(a, b)} − ${Math.min(a, b)}` : `${a} ${op} ${b}`} = ?`; round.answerKey = String(answer); round.inputHint = 'Numeric answer…'; }
  else if (kind === 'scramble') { const word = pick(words); const scrambled = word.split('').sort(() => Math.random() - 0.5).join(''); round.prompt = `Unscramble this word: ${scrambled}`; round.answerKey = word.toLowerCase(); }
  else if (kind === 'lie-vote') { round.prompt = 'Write three short statements about yourself: two true and one lie. For this demo round, submit the statement number you think is the lie after the host reveals the statements in chat.'; round.options = ['Statement 1 is the lie', 'Statement 2 is the lie', 'Statement 3 is the lie']; round.meta.stage = 'vote'; }
  else if (kind === 'never') { round.prompt = pick(promptBank.never); round.options = ['I have', 'Never have I']; }
  else if (kind === 'vote') { round.prompt = pick(promptBank.likely); round.options = humanPlayers.map((p) => p.name); round.meta.optionIds = humanPlayers.map((p) => p.id); }
  else if (kind === 'caption') { round.prompt = 'Caption challenge: submit one short, funny caption. After everyone submits, the host can start the next round and the room votes using the answers shown.'; round.inputHint = 'Your funniest caption…'; }
  else if (kind === 'fake-answer') { round.prompt = 'Invent a believable but completely fake answer: Why do flamingos stand on one leg?'; round.answerKey = null; }
  else if (kind === 'story') { round.prompt = 'Build a group story. Each player adds exactly one word per turn.'; round.meta.story = options.previousStory || 'Once'; round.inputHint = 'Add one word…'; }
  else if (kind === 'forbidden') { round.prompt = 'Describe a pizza without using any of these words: pizza, cheese, tomato. Your text is checked for the forbidden words.'; round.meta.forbidden = ['pizza', 'cheese', 'tomato']; }
  else if (kind === 'typing') { round.prompt = pick(typingPhrases); round.answerKey = normalise(round.prompt); round.inputHint = 'Type the phrase exactly…'; }
  else if (kind === 'sound-clue') { const q = pick(soundBank); round.prompt = q.prompt; round.options = q.options; round.answerKey = q.answer; }
  else if (kind === 'reaction' || kind === 'reaction-duel') { round.prompt = 'Wait for the GO cue, then tap the button as fast as possible. Early taps do not count.'; round.meta.goAt = Date.now() + 2200 + random(2200); }
  else if (kind === 'tic-tac-toe') { round.prompt = 'Tic-Tac-Toe: X goes first. The first two room players take turns. Tap an empty square; first line of three wins.'; round.board = Array(9).fill(''); const participants = players.slice(0, 2); round.meta.turn = participants[0]?.id; round.meta.marks = {}; participants.forEach((p, i) => { round.meta.marks[p.id] = i === 0 ? 'X' : 'O'; }); }
  else if (kind === 'rps') { round.prompt = 'Choose Rock, Paper, or Scissors. Scores are awarded by the usual rules.'; round.options = ['Rock', 'Paper', 'Scissors']; }
  else if (kind === 'connect-four') { round.prompt = 'Connect Four: the first two room players take turns. Choose a column 1–7; first player to connect four wins.'; round.board = Array.from({ length: 6 }, () => Array(7).fill('')); const participants = players.slice(0, 2); round.meta.turn = participants[0]?.id; round.meta.marks = {}; participants.forEach((p, i) => { round.meta.marks[p.id] = i === 0 ? '🔴' : '🟡'; }); }
  else if (kind === 'number-guess') { round.prompt = 'Guess a secret whole number between 1 and 100. You will receive a higher/lower hint.'; round.meta.secretNumber = 1 + random(100); round.inputHint = 'Number from 1 to 100…'; }
  else if (kind === 'snake') { round.prompt = 'Snake sprint: choose a direction. Avoid reversing into yourself; each safe move earns points.'; round.options = ['Up', 'Down', 'Left', 'Right']; round.meta.lastMove = {}; round.meta.moves = {}; }
  else if (kind === 'pong') { round.prompt = 'Pong duel: choose where to move your paddle for this rally.'; round.options = ['Left', 'Centre', 'Right']; }
  else if (kind === 'obstacle') { round.prompt = 'Obstacle Dash: choose a lane to dodge the incoming obstacle.'; round.options = ['Left', 'Centre', 'Right']; round.meta.obstacle = pick(['Left', 'Centre', 'Right']); }
  else if (kind === 'balloon') { round.meta.sequence = shuffle([1, 2, 3, 4, 5]); round.prompt = `Balloon Pop: repeat this sequence exactly: ${round.meta.sequence.join(' → ')}.`; round.inputHint = 'Enter the sequence, e.g. 3 1 5 2 4…'; }
  else if (kind === 'target') { round.prompt = 'Target Tap: choose TARGET for points. Avoid the DECOY.'; round.options = ['🎯 Target', '🪤 Decoy']; round.meta.target = random(2) === 0 ? '🎯 Target' : '🪤 Decoy'; }
  else if (kind === 'impostor') { const word = pick(['mango', 'volcano', 'guitar', 'library', 'bicycle', 'rainbow']); const impostor = pick(humanPlayers.length ? humanPlayers : players); round.prompt = 'Give a one-word clue about your secret word. Do not say the word directly. Then vote for the impostor.'; players.forEach((p) => { round.privateByPlayer[p.id] = { secret: p.id === impostor?.id ? 'IMPOSTOR — bluff using a related word.' : `Secret word: ${word}`, role: p.id === impostor?.id ? 'Impostor' : 'Player' }; }); round.meta.impostorId = impostor?.id; }
  else if (kind === 'secret-agent') { round.prompt = 'Complete your private objective subtly. After your turn, the group can guess who had which mission.'; players.forEach((p) => { round.privateByPlayer[p.id] = { secret: pick(agents), role: 'Secret Agent' }; }); }
  else if (kind === 'treasure') { round.prompt = pick(promptBank.treasure); round.answerKey = normalise(round.prompt.split('(A ')[1]?.replace(')', '') || 'piano'); round.meta.hint = 'Use the clue carefully; the answer is hidden in the host result.'; }
  else if (kind === 'detective') { round.prompt = 'Detective case: A window was open, a muddy footprint faced inward, and the umbrella was dry. Who is most suspicious?'; round.options = ['The person claiming they walked in the rain', 'The person who stayed indoors', 'The person carrying a book']; round.answerKey = round.options[0]; }
  else if (kind === 'mafia') { round.prompt = 'Hidden roles: discuss who seems suspicious, then vote. The role reveal appears after voting.'; const mafia = pick(humanPlayers.length ? humanPlayers : players); players.forEach((p) => { round.privateByPlayer[p.id] = { role: p.id === mafia?.id ? 'Mafia' : 'Villager', secret: p.id === mafia?.id ? 'You are Mafia. Blend in and avoid the vote.' : 'You are a Villager. Find the Mafia player.' }; }); round.meta.mafiaId = mafia?.id; round.options = humanPlayers.map((p) => p.name); round.meta.optionIds = humanPlayers.map((p) => p.id); }
  else if (kind === 'spyfall') { const location = pick(locations); const spy = pick(humanPlayers.length ? humanPlayers : players); players.forEach((p) => { round.privateByPlayer[p.id] = { role: p.id === spy?.id ? 'Spy' : 'Agent', secret: p.id === spy?.id ? 'You are the SPY. Work out the location without being discovered.' : `Location: ${location}` }; }); round.prompt = 'Ask each other questions about the location. Then vote on who the spy is.'; round.options = humanPlayers.map((p) => p.name); round.meta.optionIds = humanPlayers.map((p) => p.id); round.meta.spyId = spy?.id; }
  else if (kind === 'codebreaker') { const code = String(1000 + random(9000)); round.prompt = 'Crack the secret four-digit code. After each guess you receive a count of exact-position digits and digits present elsewhere.'; round.meta.secretCode = code; round.inputHint = 'Four-digit code…'; }
  else if (kind === 'association') { round.prompt = 'First word: OCEAN. Type the first related word that comes to mind; repeated words score nothing.'; round.meta.usedWords = ['ocean']; }
  else if (kind === 'character') { round.prompt = 'Vote on your shared character’s next trait.'; round.options = ['Brave', 'Sneaky', 'Kind', 'Chaotic', 'Inventive']; }
  else if (kind === 'ideas') { round.prompt = 'Pitch a tiny invention that solves an everyday problem in one or two sentences. The room votes on the best pitch.'; }
  else if (kind === 'auction') { round.prompt = `Mystery auction item: ${pick(['sealed crate', 'ancient compass', 'mystery gadget', 'golden ticket'])}. Make one bid with your virtual coins.`; round.meta.maxBid = 100; round.inputHint = 'Bid 0–100 coins…'; }
  else if (kind === 'drawing') { const secret = pick(items); const drawer = pick(humanPlayers.length ? humanPlayers : players); round.prompt = 'Draw the secret item on the drawing pad. Other players type guesses.'; round.privateByPlayer[drawer?.id] = { secret: `Draw this: ${secret}`, target: secret.toLowerCase(), role: 'Drawer' }; round.meta.drawerId = drawer?.id; round.meta.targetHint = 'An everyday object or treasure'; round.answerKey = secret.toLowerCase(); }
  else { round.prompt = pick(promptBank.prompt); }

  if (options.chaos) {
    round.meta.chaos = pick(['DOUBLE POINTS', 'EMOJI ONLY', 'ONE-WORD ANSWERS', 'NO SECOND CHANCES']);
    round.prompt = `🌪️ CHAOS: ${round.meta.chaos}. ${round.prompt}`;
  }
  return round;
}

export function publicRound(round) {
  if (!round) return null;
  const { answerKey, privateByPlayer, ...safe } = round;
  const meta = { ...(safe.meta || {}) };
  for (const key of ['impostorId', 'mafiaId', 'spyId', 'secretCode', 'secretNumber', 'drawerId']) delete meta[key];
  safe.meta = meta;
  return safe;
}

export function getPrivateRound(round, playerId) {
  if (!round) return null;
  return round.privateByPlayer?.[playerId] || null;
}

export function scoreAnswer(round, player, rawValue, room) {
  const value = typeof rawValue === 'string' ? rawValue.trim().slice(0, 600) : rawValue;
  const kind = round.kind;
  const chaos = round.meta?.chaos;
  const multiplier = chaos === 'DOUBLE POINTS' ? 2 : 1;
  if (chaos === 'ONE-WORD ANSWERS' && ['prompt','truth-dare','fake-answer','caption','ideas','secret-agent','impostor'].includes(kind) && typeof value === 'string' && value.trim().split(/\s+/).length !== 1) return { ok: false, message: 'Chaos rule: submit exactly one word.' };
  if (chaos === 'EMOJI ONLY' && ['prompt','truth-dare','fake-answer','caption','ideas','secret-agent','impostor'].includes(kind) && typeof value === 'string' && !/\p{Extended_Pictographic}/u.test(value)) return { ok: false, message: 'Chaos rule: include an emoji in your answer.' };
  if (value === undefined || value === null || (typeof value === 'string' && !value.trim())) return { ok: false, message: 'Enter an answer first.' };
  if (kind === 'tic-tac-toe' || kind === 'connect-four') return { ok: false, message: 'Use the board to make your move.' };
  if (kind === 'reaction' || kind === 'reaction-duel') {
    if (Date.now() < round.meta.goAt) return { ok: false, message: 'Too early! Wait for GO.' };
    if (room.answers.has(player.id)) return { ok: false, message: 'Your reaction is already recorded.' };
    const elapsed = Date.now() - round.meta.goAt;
    const points = Math.max(1, 5 - Math.floor(elapsed / 150));
    room.answers.set(player.id, { id: player.id, name: player.name, answer: `${elapsed} ms`, points });
    room.scores[player.id] = (room.scores[player.id] || 0) + points * multiplier;
    return { ok: true, points: points * multiplier, reaction: elapsed };
  }
  if (room.answers.has(player.id)) return { ok: false, message: 'You have already submitted this round.' };
  let points = 1; let answer = String(value); let result = {};
  if (['trivia', 'puzzle', 'escape', 'emoji', 'song', 'logo', 'riddle', 'sound-clue', 'math', 'scramble', 'detective', 'treasure'].includes(kind)) {
    const correct = normalise(value) === normalise(round.answerKey);
    points = correct ? 3 : 0; result.correct = correct;
    if (correct && round.explain) result.explain = round.explain;
  } else if (kind === 'memory') {
    const expected = (round.meta.sequence || []).join('');
    const got = String(value).replace(/\s/g, '');
    result.correct = got === expected;
    points = result.correct ? 4 : 0;
  } else if (kind === 'typing') {
    result.correct = normalise(value) === normalise(round.answerKey);
    points = result.correct ? 4 : 0;
  } else if (kind === 'drawing') {
    const guess = normalise(value); const target = normalise(round.answerKey);
    result.correct = Boolean(target && (guess === target || guess.includes(target) || target.includes(guess)));
    points = result.correct ? 3 : 0;
  } else if (kind === 'word-chain') {
    const word = normalise(value).replace(/\s/g, '');
    if (!/^[\p{L}]{2,20}$/u.test(word)) return { ok: false, message: 'Enter a single word with 2–20 letters.' };
    if (word[0] !== String(round.meta.lastLetter).toLowerCase()) return { ok: false, message: `Your word must start with “${round.meta.lastLetter}”.` };
    if (round.meta.usedWords.includes(word)) return { ok: false, message: 'That word was already used.' };
    round.meta.usedWords.push(word); round.meta.lastLetter = word.slice(-1).toUpperCase(); round.prompt = `Next word must start with ${round.meta.lastLetter}. Words used: ${round.meta.usedWords.join(', ')}`; points = 2; answer = word;
  } else if (kind === 'story') {
    const words = String(value).trim().split(/\s+/);
    if (words.length !== 1) return { ok: false, message: 'Add exactly one word.' };
    round.meta.story = `${round.meta.story} ${words[0]}`.slice(0, 1000); round.prompt = `Group story: ${round.meta.story}`; answer = words[0]; points = 1;
  } else if (kind === 'forbidden') {
    const text = normalise(value); const found = round.meta.forbidden.filter((word) => new RegExp(`\\b${word}\\b`, 'i').test(text));
    if (found.length) return { ok: false, message: `Forbidden word used: ${found.join(', ')}.` };
    points = 2;
  } else if (kind === 'number-guess') {
    const guess = Number(value);
    if (!Number.isInteger(guess) || guess < 1 || guess > 100) return { ok: false, message: 'Enter a whole number from 1 to 100.' };
    const secret = Number(round.meta.secretNumber);
    result.hint = guess === secret ? 'Correct!' : guess < secret ? 'Higher ⬆️' : 'Lower ⬇️';
    result.correct = guess === secret; points = result.correct ? 5 : 0;
    if (result.correct) round.meta.solved = true;
    answer = String(guess);
  } else if (kind === 'codebreaker') {
    const guess = String(value).trim();
    if (!/^\d{4}$/.test(guess)) return { ok: false, message: 'Enter exactly four digits.' };
    const code = round.meta.secretCode;
    result.exact = [...guess].filter((digit, index) => digit === code[index]).length;
    result.present = [...guess].filter((digit) => code.includes(digit)).length;
    result.correct = guess === code; points = result.correct ? 5 : 0;
    result.hint = `${result.exact} in the correct position; ${result.present} digit(s) present.`;
    answer = guess;
  } else if (kind === 'auction') {
    const bid = Number(value);
    if (!Number.isInteger(bid) || bid < 0 || bid > 100) return { ok: false, message: 'Bid must be a whole number from 0 to 100.' };
    const profileCoins = room.profileCoins?.[player.id] ?? 50;
    if (bid > profileCoins) return { ok: false, message: `You have only ${profileCoins} coins available.` };
    room.profileCoins[player.id] = profileCoins - bid; answer = String(bid); points = 0; result.bid = bid;
  } else if (kind === 'rps') {
    const move = String(value).toLowerCase();
    if (!['rock', 'paper', 'scissors'].includes(move)) return { ok: false, message: 'Choose rock, paper, or scissors.' };
    answer = move; points = 0;
  } else if (kind === 'vote' || kind === 'lie-vote' || kind === 'mafia' || kind === 'spyfall' || kind === 'character' || kind === 'never' || kind === 'choice' || kind === 'truth-dare' || kind === 'target' || kind === 'obstacle' || kind === 'pong' || kind === 'snake' || kind === 'balloon' || kind === 'caption' || kind === 'ideas' || kind === 'fake-answer' || kind === 'association' || kind === 'secret-agent' || kind === 'treasure' || kind === 'impostor') {
    if (kind === 'association') {
      const word = normalise(value).replace(/\s/g, '');
      if (!/^[\p{L}]{2,24}$/u.test(word)) return { ok: false, message: 'Enter one word with 2–24 letters.' };
      if ((round.meta.usedWords || []).includes(word)) return { ok: false, message: 'That word has already been used.' };
      round.meta.usedWords.push(word); answer = word; points = 2;
    } else if (kind === 'target') {
      points = String(value).toLowerCase().includes('target') ? 2 : 0;
    } else if (kind === 'obstacle') {
      points = String(value).toLowerCase() === String(round.meta.obstacle).toLowerCase() ? 0 : 2;
      result.obstacle = round.meta.obstacle;
    } else if (kind === 'balloon') {
      const guess = String(value).replace(/\s/g, ''); const expected = (round.meta.sequence || []).join('');
      result.correct = guess === expected; points = result.correct ? 5 : 0;
    } else if (kind === 'snake') points = 2;
    else if (kind === 'pong') points = 1;
    else if (kind === 'caption' || kind === 'ideas' || kind === 'fake-answer' || kind === 'impostor' || kind === 'secret-agent') points = 1;
    else points = 1;
  } else points = 1;

  room.answers.set(player.id, { id: player.id, name: player.name, answer, points, ...result });
  room.scores[player.id] = (room.scores[player.id] || 0) + points * multiplier;
  return { ok: true, points: points * multiplier, ...result };
}

export function resolveCompetitiveRound(round, room) {
  const kind = round.kind;
  const answers = [...room.answers.values()];
  let resultText = 'Round complete!';
  if (kind === 'rps') {
    const beats = { rock: 'scissors', paper: 'rock', scissors: 'paper' };
    for (const a of answers) for (const b of answers) if (a.id !== b.id && beats[a.answer] === b.answer) room.scores[a.id] = (room.scores[a.id] || 0) + 1;
    resultText = 'Rock beats scissors, scissors beat paper, paper beats rock.';
  } else if (kind === 'tic-tac-toe' || kind === 'connect-four') resultText = round.meta.winner ? `${room.players.get(round.meta.winner)?.name || 'Player'} wins!` : 'Board round complete.';
  else if (kind === 'impostor') resultText = `The impostor was ${room.players.get(round.meta.impostorId)?.name || 'unknown'}.`;
  else if (kind === 'mafia') resultText = `Mafia player: ${room.players.get(round.meta.mafiaId)?.name || 'unknown'}.`;
  else if (kind === 'spyfall') resultText = `Spy: ${room.players.get(round.meta.spyId)?.name || 'unknown'}.`;
  else if (kind === 'auction') {
    const winner = answers.slice().sort((a, b) => Number(b.answer) - Number(a.answer))[0];
    if (winner) { room.scores[winner.id] = (room.scores[winner.id] || 0) + 3; resultText = `${winner.name} won the auction (+3 points).`; }
  } else if (['caption', 'ideas'].includes(kind)) resultText = 'Vote in chat for your favourite submission, then start the next round.';
  return resultText;
}

export function checkBoardWinner(board, connectFour = false) {
  if (!Array.isArray(board)) return null;
  if (!connectFour) {
    const lines = [[0,1,2],[3,4,5],[6,7,8],[0,3,6],[1,4,7],[2,5,8],[0,4,8],[2,4,6]];
    for (const [a,b,c] of lines) if (board[a] && board[a] === board[b] && board[b] === board[c]) return board[a];
    return board.every(Boolean) ? 'draw' : null;
  }
  const rows = board.length, cols = board[0]?.length || 0;
  for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) {
    const mark = board[r][c]; if (!mark) continue;
    for (const [dr,dc] of [[1,0],[0,1],[1,1],[1,-1]]) {
      let count = 1;
      for (let k=1;k<4;k++) { const nr=r+dr*k,nc=c+dc*k; if (nr<0||nr>=rows||nc<0||nc>=cols||board[nr][nc]!==mark) break; count++; }
      if (count>=4) return mark;
    }
  }
  return board.every((row) => row.every(Boolean)) ? 'draw' : null;
}

export function createBracket(players) {
  const entrants = shuffle(players).map((p) => ({ id: p.id, name: p.name, seed: null }));
  const size = 2 ** Math.ceil(Math.log2(Math.max(2, entrants.length)));
  while (entrants.length < size) entrants.push({ id: null, name: 'BYE', seed: null });
  entrants.forEach((p, i) => { p.seed = i + 1; });
  const matches = [];
  for (let i = 0; i < entrants.length; i += 2) matches.push({ id: matches.length + 1, a: entrants[i], b: entrants[i + 1], winner: entrants[i + 1]?.id ? null : entrants[i].id });
  return { round: 1, matches, champion: entrants.length === 2 ? null : null };
}
