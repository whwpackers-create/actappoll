// SAT dry run — simulates full SATs of different sizes against the real bracket + VR code and
// fails loudly if any rule in SAT_RULES.md is broken. Run before every SAT:  npm run test:sat
import assert from 'node:assert/strict';
import {
  playInInfo, stageSizes, stageRounds, defaultAdvance, snake, advanceTeams, applyTimeRequests,
  roundSessions, teamVR, byTeamRank, choosePlayIn, TEAMS_PER_HEAT, type RankedTeam,
} from '../src/utils/satBracket';
import { satMultiFor, vrChange } from '../src/utils/VR';

let passed = 0;
const check = (name: string, fn: () => void) => {
  try { fn(); passed++; } catch (e) { console.error(`✗ ${name}\n  ${(e as Error).message}`); process.exitCode = 1; }
};

// Deterministic pseudo-random so failures reproduce
let seed = 42;
const rand = () => ((seed = (seed * 1103515245 + 12345) % 2 ** 31) / 2 ** 31);

const makeTeams = (n: number) => Array.from({ length: n }, (_, i) => ({
  name: `T${i + 1}a & T${i + 1}b`, members: [`T${i + 1}a`, `T${i + 1}b`], seed: i + 1,
}));
// Race a heat: stronger seeds tend to score more
const raceHeat = (heat: { name: string; members: string[]; seed: number }[]): RankedTeam[] =>
  heat.map((t) => ({ name: t.name, members: t.members, score: Math.round(48 - t.seed + rand() * 20) }))
    .sort((a, b) => b.score - a.score);

// ─── Format ──────────────────────────────────────────────────────────────────
for (const n of [16, 18, 20, 23, 24, 25, 27, 28, 29, 30, 32, 33, 36, 40]) {
  check(`${n} teams: play-in, 4 rounds of 4-team heats (16 → 8 → 4 after Round 1)`, () => {
    const p = playInInfo(n);
    assert.equal(p.fieldSize % 4, 0, 'field must be a multiple of 4');
    assert.equal(p.fieldSize, n - (n % 4));
    if (n % 4 === 1) assert.deepEqual([p.size, p.advance], [2, 1]);
    if (n % 4 === 2) assert.deepEqual([p.size, p.advance], [4, 2]);
    if (n % 4 === 3) assert.deepEqual([p.size, p.advance], [4, 1]);
    const sizes = stageSizes(p.fieldSize, n);
    assert.deepEqual(sizes, [p.fieldSize, 16, 8, 4]);
    assert.deepEqual(stageRounds(sizes), [0, 1, 2, 3]);
    assert.equal(defaultAdvance(0, n), n >= 24 ? 3 : 2, 'Round 1 sends 3 per heat at 24+ teams');
    assert.equal(defaultAdvance(1, n), 2);
  });

  check(`${n} teams: full SAT simulation`, () => {
    const p = playInInfo(n);
    const field = makeTeams(p.fieldSize);
    const sizes = stageSizes(p.fieldSize, n);
    let heats = snake(field, p.fieldSize / TEAMS_PER_HEAT);
    let round = 0;
    for (let i = 1; i < sizes.length; i++) {
      heats.forEach((h) => assert.equal(h.length, 4, `round ${round} heat has ${h.length} teams`));
      const results = heats.map(raceHeat);
      const counts = results.map(() => defaultAdvance(round, n));
      const { teams, alternates } = advanceTeams(results, sizes[i], (a, b) => a.name.localeCompare(b.name), counts);
      assert.equal(teams.length, sizes[i], `round ${i} should have ${sizes[i]} teams`);
      // Anyone cut scored no more than the lowest advancer from the guaranteed group
      const minAdv = Math.min(...teams.map((t) => t.score));
      if (results.flatMap((r, hi) => r.slice(0, counts[hi])).length > sizes[i]) {
        alternates.filter((a) => results.some((r, hi) => r.slice(0, counts[hi]).some((x) => x.name === a.name)))
          .forEach((a) => assert.ok(a.score <= minAdv, `${a.name} cut with ${a.score} > ${minAdv}`));
      }
      const byName = Object.fromEntries(field.map((t) => [t.name, t]));
      heats = snake(teams.map((t) => byName[t.name]), sizes[i] / TEAMS_PER_HEAT);
      round = stageRounds(sizes)[i];
    }
    assert.equal(heats.length, 1, 'Final is one heat');
    assert.equal(heats[0].length, 4, 'Final has 4 teams');
  });
}

// ─── Sessions ────────────────────────────────────────────────────────────────
check('sessions: Thu/Fri 6:30 & 8:00 split evenly (play-in counts as 6:30), Semis 11 AM, Final 8 PM', () => {
  assert.deepEqual(roundSessions(0, 7, undefined, true), ['6:30', '6:30', '6:30', '8:00', '8:00', '8:00', '8:00']);
  assert.deepEqual(roundSessions(0, 8, undefined, false), ['6:30', '6:30', '6:30', '6:30', '8:00', '8:00', '8:00', '8:00']);
  assert.deepEqual(roundSessions(1, 4, undefined), ['6:30', '6:30', '8:00', '8:00']);
  assert.deepEqual(roundSessions(2, 2, undefined), ['11:00 AM', '11:00 AM']);
  assert.deepEqual(roundSessions(3, 1, undefined), ['8:00 PM']);
});

check('time requests: every request placed, heats stay balanced', () => {
  const field = makeTeams(28);
  const slots = roundSessions(0, 7, undefined, true);
  const req: Record<string, string> = { T3a: '6:30', T12a: '8:00', T4b: '6:30', T26a: '8:00', T11a: '8:00' };
  const { heats, unmet } = applyTimeRequests(snake(field, 7), slots, (t) => t.members.map((m) => req[m]).find(Boolean) ?? null, (t) => t.seed);
  assert.equal(unmet.length, 0);
  heats.forEach((h, hi) => {
    assert.equal(h.length, 4);
    h.forEach((t) => { const r = t.members.map((m) => req[m]).find(Boolean); if (r) assert.equal(slots[hi], r, `${t.name} needs ${r}`); });
    const total = h.reduce((s, t) => s + t.seed, 0);
    assert.ok(Math.abs(total - 58) <= 3, `heat ${hi + 1} seed total ${total} too far from 58`);
  });
});

// ─── Seeding ─────────────────────────────────────────────────────────────────
check('unrated players: no VR, their teams rank below every fully-rated team', () => {
  const vr: Record<string, number> = { A: 6000, B: 5000, C: 4400, D: 4300 };
  const teams = [['A', 'New1'], ['C', 'D'], ['New2', 'New3'], ['B', 'A']].map((m) => teamVR(m, (n) => vr[n])).sort(byTeamRank);
  assert.deepEqual(teams.map((t) => t.members.join('+')), ['A+B', 'C+D', 'A+New1', 'New2+New3']);
  assert.equal(teams[2].avgVR, null);
  assert.equal(teams[0].members[0], 'A', 'higher-VR player is player 1');
});

check('play-in: admin pick is honored, default is the lowest seeds', () => {
  const ranked = ['a', 'b', 'c', 'd', 'e'].map((x, i) => ({ name: x, newCount: i >= 2 ? 1 : 0 }));
  assert.deepEqual(choosePlayIn(ranked, 2).map((t) => t.name), ['d', 'e']);
  assert.deepEqual(choosePlayIn(ranked, 2, JSON.stringify(['c', 'e'])).map((t) => t.name), ['c', 'e']);
});

// ─── VR ──────────────────────────────────────────────────────────────────────
check('SAT multipliers: Fall 2026 = 1.5x (2x Final); every other SAT = 1.1/1.2/1.5/2.0; ACTs = 1', () => {
  assert.equal(satMultiFor({ satId: 's', satRound: 1, date: '2026-10-15' }), 1.5);
  assert.equal(satMultiFor({ satId: 's', satRound: 4, date: '2026-10-17' }), 2.0);
  assert.equal(satMultiFor({ satId: 's', satRound: 1, date: '2027-04-15' }), 1.1);
  assert.equal(satMultiFor({ satId: 's', satRound: 2, date: '2027-04-16' }), 1.2);
  assert.equal(satMultiFor({ satId: 's', satRound: 3, date: '2027-04-17' }), 1.5);
  assert.equal(satMultiFor({ satId: 's', satRound: 4, date: '2027-04-17' }), 2.0);
  assert.equal(satMultiFor({ date: '2027-04-17' }), 1);
});

const night = (me: number, opp: number, places: number[], isSat: boolean, mult: number) => {
  let v = me;
  places.forEach((pos) => { v += vrChange(v, [opp, opp, opp], pos, mult, 1, 30, true, isSat); });
  return Math.round(v - me);
};
check('VR: a favorite with a good night (mostly 1sts/2nds) never loses VR', () => {
  // 19/24-ish: 5 firsts, 2 seconds, 1 third
  assert.ok(night(6850, 4700, [0, 0, 0, 0, 0, 1, 1, 2], true, 1.5) > 0);
  assert.ok(night(6850, 4700, [0, 0, 0, 0, 0, 1, 1, 2], false, 1) > 0);
});
check('VR: no farming — a perfect night vs players 2000 VR weaker earns < 100 (< 150 in a 2x Final)', () => {
  assert.ok(night(6500, 4500, Array(8).fill(0), true, 1.5) < 100);
  assert.ok(night(6500, 4500, Array(8).fill(0), true, 2.0) < 150);
});
check('VR: SAT losses are cushioned for non-favorites, full for favorites who flop', () => {
  const evenSat = night(5200, 5200, Array(8).fill(3), true, 1.5);
  const evenAct = night(5200, 5200, Array(8).fill(3), false, 1);
  assert.ok(evenSat > evenAct * 0.6, `even-room SAT flop ${evenSat} should be ~half of ACT flop ${evenAct}`);
  const favSat = night(6500, 5200, Array(8).fill(3), true, 1.5);
  assert.ok(favSat < evenSat, 'a favorite flopping vs a weak room should lose more than an even matchup');
});

console.log(`${passed} SAT checks passed${process.exitCode ? ' — SOME FAILED (see above)' : ''}`);
