import test from 'node:test';
import assert from 'node:assert/strict';
import { games, sampleQuestions } from '../../shared/games.js';
import { createRound, publicRound, scoreAnswer, checkBoardWinner, createBracket } from '../game-engine.js';

function fakeRoom() {
  return { answers: new Map(), scores: { p1: 0, p2: 0 }, profileCoins: { p1: 50, p2: 50 }, players: new Map([['p1', { id: 'p1', name: 'Ada' }], ['p2', { id: 'p2', name: 'Bo' }]]) };
}

test('catalogue has 46 uniquely identified games with rules', () => {
  assert.equal(games.length, 46);
  assert.equal(new Set(games.map((game) => game.id)).size, 46);
  assert.ok(games.every((game) => game.name && game.kind && game.description));
  assert.ok(new Set(games.map((game) => game.kind)).size >= 30);
});

test('public round does not leak answer keys, spy roles, code, or private player clues', () => {
  const players = [{ id: 'p1', name: 'Ada' }, { id: 'p2', name: 'Bo' }];
  const round = createRound({ id: 41, name: 'Spyfall', kind: 'spyfall' }, players, 1);
  const safe = publicRound(round);
  assert.equal(Object.hasOwn(safe, 'answerKey'), false);
  assert.equal(Object.hasOwn(safe, 'privateByPlayer'), false);
  assert.equal(Object.hasOwn(safe.meta, 'spyId'), false);
  assert.equal(Object.hasOwn(safe.meta, 'secretCode'), false);
  assert.equal(Object.hasOwn(safe.meta, 'secretNumber'), false);
});

test('trivia scores correct answer and rejects duplicate submissions', () => {
  const room = fakeRoom();
  const game = games.find((item) => item.kind === 'trivia');
  const round = createRound(game, [...room.players.values()], 1);
  assert.ok(sampleQuestions.some((question) => question.answer === round.answerKey));
  const player = room.players.get('p1');
  const correct = scoreAnswer(round, player, round.answerKey, room);
  assert.equal(correct.ok, true);
  assert.equal(correct.points, 3);
  assert.equal(room.scores.p1, 3);
  const duplicate = scoreAnswer(round, player, round.answerKey, room);
  assert.equal(duplicate.ok, false);
});

test('word chain rejects wrong initial letter and repeated words', () => {
  const room = fakeRoom();
  const round = { kind: 'word-chain', meta: { lastLetter: 'S', usedWords: [] }, answerKey: null };
  assert.equal(scoreAnswer(round, room.players.get('p1'), 'tree', room).ok, false);
  assert.equal(scoreAnswer(round, room.players.get('p1'), 'sun', room).ok, true);
  room.answers.clear();
  assert.equal(scoreAnswer(round, room.players.get('p2'), 'sun', room).ok, false);
});

test('board winner checks correctly identify Tic-Tac-Toe and Connect Four', () => {
  assert.equal(checkBoardWinner(['X','X','X','O','','','O','','']), 'X');
  assert.equal(checkBoardWinner(['X','O','X','X','O','O','O','X','X']), 'draw');
  const board = Array.from({ length: 6 }, () => Array(7).fill(''));
  board[5][0] = board[5][1] = board[5][2] = board[5][3] = '🔴';
  assert.equal(checkBoardWinner(board, true), '🔴');
});

test('tournament bracket includes every entrant and handles byes', () => {
  const bracket = createBracket([{ id: 'a', name: 'Ada' }, { id: 'b', name: 'Bo' }, { id: 'c', name: 'Cy' }]);
  assert.equal(bracket.matches.length, 2);
  assert.equal(bracket.matches.flatMap((match) => [match.a, match.b]).filter((entrant) => entrant?.id).length, 3);
  assert.ok(bracket.matches.some((match) => match.winner));
});
