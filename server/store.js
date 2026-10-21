import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const dataDir = process.env.DATA_DIR ? path.resolve(process.env.DATA_DIR) : path.join(here, 'data');
const filePath = path.join(dataDir, 'store.json');
const emptyStore = () => ({ profiles: {}, friendships: {}, friendRequests: {}, messages: [], customGames: [], tournaments: [], moderationLog: [] });

fs.mkdirSync(dataDir, { recursive: true });
let store;
try {
  store = { ...emptyStore(), ...JSON.parse(fs.readFileSync(filePath, 'utf8')) };
} catch {
  store = emptyStore();
  try { fs.writeFileSync(filePath, JSON.stringify(store, null, 2)); } catch (error) { console.error('Could not initialise persistent store:', error.message); }
}

let pendingWrite = Promise.resolve();
export function getStore() { return store; }
export function saveStore() {
  const snapshot = JSON.stringify(store, null, 2);
  pendingWrite = pendingWrite.then(async () => {
    const temporary = `${filePath}.tmp`;
    await fs.promises.writeFile(temporary, snapshot, 'utf8');
    await fs.promises.rename(temporary, filePath);
  }).catch((error) => console.error('Store save failed:', error.message));
  return pendingWrite;
}

export function normaliseUsername(value) {
  return String(value || '').normalize('NFKC').trim().toLocaleLowerCase().replace(/[^\p{L}\p{N}_ -]/gu, '').replace(/\s+/g, ' ').slice(0, 32);
}

export function ensureProfile(id, name = 'Player') {
  if (!store.profiles[id]) {
    store.profiles[id] = {
      id, name: String(name || 'Player').trim().slice(0, 24) || 'Player', username: normaliseUsername(name) || `player-${String(id).slice(-4)}`,
      bio: '', avatar: '🙂', xp: 0, coins: 50, gamesPlayed: 0, wins: 0, achievements: [], createdAt: Date.now(), updatedAt: Date.now(),
    };
  } else if (name && store.profiles[id].name !== String(name).trim().slice(0, 24)) {
    store.profiles[id].name = String(name).trim().slice(0, 24) || store.profiles[id].name;
    store.profiles[id].username = normaliseUsername(store.profiles[id].name) || store.profiles[id].username;
    store.profiles[id].updatedAt = Date.now();
  }
  return store.profiles[id];
}

export function addXp(id, amount) {
  const profile = ensureProfile(id);
  profile.xp += Math.max(0, Math.floor(amount || 0));
  profile.coins += Math.max(0, Math.floor((amount || 0) / 2));
  profile.gamesPlayed += 1;
  profile.updatedAt = Date.now();
  const newAchievements = [];
  const achievementDefs = [
    ['first-game', 'First Game', 'Finish your first round', profile.gamesPlayed >= 1],
    ['getting-started', 'Getting Started', 'Earn 100 XP', profile.xp >= 100],
    ['party-regular', 'Party Regular', 'Play 10 rounds', profile.gamesPlayed >= 10],
    ['coin-collector', 'Coin Collector', 'Hold 100 coins', profile.coins >= 100],
    ['big-brain', 'Big Brain', 'Earn 500 XP', profile.xp >= 500],
  ];
  for (const [idKey, title, description, unlocked] of achievementDefs) {
    if (unlocked && !profile.achievements.some((a) => a.id === idKey)) {
      const achievement = { id: idKey, title, description, unlockedAt: Date.now() };
      profile.achievements.push(achievement); newAchievements.push(achievement);
    }
  }
  return { profile, newAchievements };
}

export async function patchProfile(id, patch) {
  const current = ensureProfile(id);
  if (patch.name !== undefined) current.name = String(patch.name).trim().slice(0, 24) || current.name;
  if (patch.bio !== undefined) current.bio = String(patch.bio).trim().slice(0, 160);
  if (patch.avatar !== undefined && ['🙂','😎','🦊','🐼','🐸','🦄','🤖','🐯','🐙','🐨'].includes(patch.avatar)) current.avatar = patch.avatar;
  current.username = normaliseUsername(current.name) || current.username;
  current.updatedAt = Date.now();
  await saveStore();
  return current;
}

export function publicProfile(profile) {
  if (!profile) return null;
  const { id, name, username, bio, avatar, xp, coins, gamesPlayed, wins, achievements, createdAt } = profile;
  return { id, name, username, bio, avatar, xp, coins, gamesPlayed, wins, achievements, createdAt, level: Math.floor((xp || 0) / 100) + 1 };
}
