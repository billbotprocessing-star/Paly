// Run: npm test   (Node's built-in test runner, no extra dependencies)
import assert from 'node:assert/strict';
import { test } from 'node:test';

import { buildQueue, intervalDays, retrievability, schedule, type QueueCandidate } from './scheduler.ts';

const DAY = 86_400_000;
const t0 = new Date('2026-10-12T09:00:00Z');
const daysAfter = (d: Date, n: number) => new Date(d.getTime() + n * DAY);
const daysBetween = (a: Date, b: Date) => (b.getTime() - a.getTime()) / DAY;

test('recall probability is 90% exactly one stability-length after review', () => {
  assert.ok(Math.abs(retrievability(7, 7) - 0.9) < 1e-9);
  assert.equal(retrievability(0, 3), 1);
  assert.ok(retrievability(30, 3) < retrievability(5, 3));
});

test('first review: better ratings give longer intervals', () => {
  const [again, hard, good, easy] = (['again', 'hard', 'good', 'easy'] as const).map((r) => schedule(null, r, t0));
  assert.equal(again.dueAt.getTime() - t0.getTime(), 10 * 60_000, 'again returns in 10 minutes');
  assert.ok(daysBetween(t0, hard.dueAt) >= 1);
  assert.ok(daysBetween(t0, hard.dueAt) <= daysBetween(t0, good.dueAt));
  assert.ok(daysBetween(t0, good.dueAt) < daysBetween(t0, easy.dueAt));
  assert.ok(easy.difficulty < good.difficulty && good.difficulty < again.difficulty);
  assert.equal(again.lapses, 1);
  assert.equal(good.lapses, 0);
});

test('repeated good answers on time grow the interval until the 1-year cap', () => {
  let s = schedule(null, 'good', t0);
  const intervals = [Math.round(daysBetween(t0, s.dueAt))];
  for (let i = 0; i < 5; i++) {
    const now = s.dueAt;
    s = schedule(s, 'good', now);
    intervals.push(Math.round(daysBetween(now, s.dueAt)));
  }
  // FSRS-4.5 defaults: 4d -> 15d -> 50d -> 149d -> capped at a year.
  assert.deepEqual(intervals, [4, 15, 50, 149, 365, 365]);
  assert.equal(s.reps, 6);
});

test('forgetting a well-known item shrinks stability and counts a lapse', () => {
  let s = schedule(null, 'good', t0);
  s = schedule(s, 'good', s.dueAt);
  const before = s.stability;
  const lapsed = schedule(s, 'again', s.dueAt);
  assert.ok(lapsed.stability < before);
  assert.equal(lapsed.lapses, 1);
  assert.ok(lapsed.difficulty > s.difficulty);
});

test('remembering after a long gap boosts stability more than reviewing early', () => {
  const s = schedule(schedule(null, 'good', t0), 'good', daysAfter(t0, 3));
  const early = schedule(s, 'good', daysAfter(s.lastReviewAt, 1));
  const late = schedule(s, 'good', daysAfter(s.lastReviewAt, 20));
  assert.ok(late.stability > early.stability);
});

test('values stay inside the bounds the database enforces', () => {
  let s = schedule(null, 'again', t0);
  for (let i = 0; i < 30; i++) s = schedule(s, i % 2 ? 'again' : 'hard', daysAfter(t0, i));
  assert.ok(s.difficulty >= 1 && s.difficulty <= 10);
  assert.ok(s.stability > 0);
  for (let i = 0; i < 30; i++) s = schedule(s, 'easy', s.dueAt);
  assert.ok(s.difficulty >= 1 && s.difficulty <= 10);
  assert.ok(daysBetween(s.lastReviewAt, s.dueAt) <= 365);
  assert.equal(intervalDays(100000), 365);
});

const cand = (id: string, state: QueueCandidate['state'], extra: Partial<QueueCandidate> = {}): QueueCandidate => ({
  itemId: id,
  goalId: 'g',
  state,
  createdAt: t0,
  goalExamAt: null,
  ...extra,
});

test('queue: due items before new ones, most-forgotten first, future items excluded', () => {
  const now = daysAfter(t0, 10);
  const mk = (stability: number, lastDaysAgo: number, dueInDays: number) => ({
    difficulty: 5,
    stability,
    lastReviewAt: daysAfter(now, -lastDaysAgo),
    dueAt: daysAfter(now, dueInDays),
    reps: 2,
    lapses: 0,
  });
  const q = buildQueue(
    [
      cand('new', null),
      cand('slightly-due', mk(5, 5, 0)),
      cand('very-overdue', mk(2, 9, -7)),
      cand('not-due', mk(30, 1, 29)),
    ],
    now,
    10
  );
  assert.deepEqual(
    q.map((c) => c.itemId),
    ['very-overdue', 'slightly-due', 'new']
  );
});

test('queue: respects the time budget and the daily new-item cap', () => {
  const many = Array.from({ length: 50 }, (_, i) => cand(`n${i}`, null, { createdAt: daysAfter(t0, i) }));
  assert.equal(buildQueue(many, t0, 2).length, 4, '2 minutes ≈ 4 items');
  assert.equal(buildQueue(many, t0, 30).length, 10, 'no more than 10 new per day');
  assert.equal(buildQueue(many, t0, 30, 7).length, 3, '7 already introduced today');
  assert.equal(buildQueue(many, t0, 30)[0].itemId, 'n0', 'oldest new items first');
});

test('queue: an exam within two weeks pulls its items forward', () => {
  const now = t0;
  const s = { difficulty: 5, stability: 5, lastReviewAt: daysAfter(now, -5), dueAt: now, reps: 1, lapses: 0 };
  const q = buildQueue(
    [cand('other', s), cand('exam', s, { goalId: 'e', goalExamAt: daysAfter(now, 3) })],
    now,
    10
  );
  assert.equal(q[0].itemId, 'exam');
});
