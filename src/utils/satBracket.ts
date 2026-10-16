// SAT bracket structure — every heat has exactly 4 teams.
//
// Play-in (decided manually) trims the field to a multiple of 4:
//   1 extra team  → 2 lowest seeds play in, 1 advances
//   2 extra teams → 4 lowest seeds play in, 2 advance
//   3 extra teams → 4 lowest seeds play in, 1 advances
// Every SAT has 4 rounds: Round 1 (Thursday, field/4 heats) → Round 2 (Friday, 4 heats / 16 teams)
// → Semis (Saturday morning, 2 heats / 8) → Final (Saturday night, 1 heat / 4).
// Round 1 sends 3 per heat when 24+ teams entered (else 2); later rounds send 2. Extra advancers
// are cut lowest points first; if short, the best remaining finishers fill in (3rds, then 4ths).

export const TEAMS_PER_HEAT = 4;

// Stage round indexes stored on heats / acts: 0=Day 1, 1=Day 2, 2=Semis, 3=Finals
export const STAGE_LABEL: Record<number, string> = { 0: 'Round 1', 1: 'Round 2', 2: 'Semifinals', 3: 'Finals' };

export function playInInfo(nTeams: number): { size: number; advance: number; fieldSize: number } {
  const extra = nTeams % TEAMS_PER_HEAT;
  if (extra === 0 || nTeams < TEAMS_PER_HEAT * 2) return { size: 0, advance: 0, fieldSize: nTeams - extra };
  const size = extra === 1 ? 2 : 4;
  return { size, advance: size - extra, fieldSize: nTeams - extra };
}

export const BIG_FIELD_TEAMS = 24;
export const ROUND_SIZES = [16, 8, 4]; // Round 2, Semis, Final

// Default teams advancing from each heat of a round
export function defaultAdvance(round: number, teamCount: number): number {
  return round === 0 && teamCount >= BIG_FIELD_TEAMS ? 3 : 2;
}

// Team count per round, e.g. 29 teams (28 after play-in) → [28, 16, 8, 4]
export function stageSizes(fieldSize: number, _teamCount = fieldSize): number[] {
  return [fieldSize, ...ROUND_SIZES.map((n) => Math.min(n, fieldSize))];
}

// Map each stage to its stored round index. Finals is always 3, Semis 2; Day 2 only exists for 4-stage SATs.
export function stageRounds(sizes: number[]): number[] {
  const n = sizes.length;
  return n === 4 ? [0, 1, 2, 3] : n === 3 ? [0, 2, 3] : n === 2 ? [0, 3] : [3];
}

// Snake seeding: 1→H1, 2→H2 … H→HH, H+1→HH, …
export function snake<T>(teams: T[], numHeats: number): T[][] {
  const heats: T[][] = Array.from({ length: numHeats }, () => []);
  teams.forEach((t, i) => {
    const r = Math.floor(i / numHeats), p = i % numHeats;
    heats[r % 2 === 0 ? p : numHeats - 1 - p].push(t);
  });
  return heats;
}

export interface RankedTeam { name: string; members: string[]; subs?: string[]; score: number }
export interface StageTeam { name: string; members: string[]; subs: string[]; score: number; seed: number }

// Teams advancing from a completed round into a round of `targetSize`.
// Each heat sends its top `counts[i]` (default 2). Extra advancers beyond `targetSize` are
// dropped lowest score first; if heats send fewer, the next finisher from each heat
// competes on score for the open spots.
// Returns seeded advancing teams + everyone left out (alternates, best first).
export function advanceTeams(
  heatRankings: RankedTeam[][],
  targetSize: number,
  seedTie: (a: RankedTeam, b: RankedTeam) => number,
  counts: number[] = []
): { teams: StageTeam[]; alternates: StageTeam[] } {
  const norm = (t: RankedTeam) => ({ name: t.name, members: t.members, subs: t.subs ?? [], score: t.score });
  const byScore = (a: RankedTeam, b: RankedTeam) => b.score - a.score || seedTie(a, b);
  const nOf = (i: number) => counts[i] ?? 2;
  const adv = heatRankings.flatMap((r, i) => r.slice(0, nOf(i)).map(norm)).sort(byScore);
  // Fill pool: everyone who didn't advance, best finishing position first, then points
  const next = heatRankings
    .flatMap((r, i) => r.slice(nOf(i)).map((t, k) => ({ t: norm(t), place: k })))
    .sort((a, b) => a.place - b.place || byScore(a.t, b.t))
    .map((x) => x.t);
  const fill = Math.max(0, targetSize - adv.length);
  const ranked = [...adv.slice(0, targetSize), ...next.slice(0, fill)].sort(byScore);
  const left = [...adv.slice(targetSize), ...next.slice(fill)];
  return {
    teams: ranked.map((t, i) => ({ ...t, seed: i + 1 })),
    alternates: left.map((t, i) => ({ ...t, seed: targetSize + 1 + i })),
  };
}

// ─── Time requests ───────────────────────────────────────────────────────────
// "6:15", "6:15 PM", "Thu 6:15pm" → "6:15"; "8" → "8:00"
export function normalizeTime(s: string | undefined | null): string {
  const m = (s ?? '').match(/(\d{1,2})(?::(\d{2}))?/);
  return m ? `${parseInt(m[1], 10)}:${m[2] ?? '00'}` : '';
}

// "Will & Mug" and "Mug & Will" refer to the same team
export function teamKey(name: string): string {
  return name.split('&').map((p) => p.trim().toLowerCase()).sort().join('&');
}

// Move teams with a requested time into a heat with that time, swapping with the
// closest-seeded team that can take their spot, so heats stay as balanced as the snake seeding.
export function applyTimeRequests<T extends { name: string }>(
  startHeats: T[][],
  heatTimes: (string | undefined)[],
  requestOf: (t: T) => string | null,
  seedOf: (t: T) => number
): { heats: T[][]; unmet: { team: string; time: string }[] } {
  const heats = startHeats.map((h) => [...h]);
  const allowed = (t: T): number[] | null => {
    const req = normalizeTime(requestOf(t));
    if (!req) return null;
    return heats.map((_, i) => i).filter((i) => normalizeTime(heatTimes[i]) === req);
  };
  const okIn = (t: T, hi: number) => { const a = allowed(t); return !a || a.includes(hi); };
  const heatOf = (t: T) => heats.findIndex((h) => h.includes(t));
  const locked = new Set<T>();
  const unmet: { team: string; time: string }[] = [];

  const requested = heats.flat().filter((t) => allowed(t) !== null).sort((a, b) => seedOf(a) - seedOf(b));
  requested.forEach((t) => { if (okIn(t, heatOf(t))) locked.add(t); });

  for (const a of requested) {
    if (locked.has(a)) continue;
    const ha = heatOf(a);
    let best: { hb: number; bi: number; diff: number } | null = null;
    for (const hb of allowed(a) ?? []) {
      heats[hb].forEach((b, bi) => {
        if (locked.has(b) || !okIn(b, ha)) return;
        const diff = Math.abs(seedOf(a) - seedOf(b));
        if (!best || diff < best.diff) best = { hb, bi, diff };
      });
    }
    if (!best) { unmet.push({ team: a.name, time: requestOf(a) ?? '' }); continue; }
    const { hb, bi } = best as { hb: number; bi: number; diff: number };
    const b = heats[hb][bi];
    heats[hb][bi] = a;
    heats[ha][heats[ha].indexOf(a)] = b;
    locked.add(a);
    if (allowed(b)) locked.add(b);
  }

  // Rebalance: swap close seeds (≤3 apart) between heats while it evens out heat seed totals,
  // never moving a requested team out of an allowed heat
  const total = (h: T[]) => h.reduce((s, t) => s + seedOf(t), 0);
  const target = heats.flat().reduce((s, t) => s + seedOf(t), 0) / heats.length;
  const spread = () => heats.reduce((s, h) => s + (total(h) - target) ** 2, 0);
  for (let improved = true, guard = 0; improved && guard < 200; guard++) {
    improved = false;
    let bestSwap: { i: number; a: number; j: number; b: number; score: number } | null = null;
    const cur = spread();
    for (let i = 0; i < heats.length; i++) for (let j = i + 1; j < heats.length; j++) {
      heats[i].forEach((x, a) => heats[j].forEach((y, b) => {
        if (Math.abs(seedOf(x) - seedOf(y)) > 3 || !okIn(x, j) || !okIn(y, i)) return;
        heats[i][a] = y; heats[j][b] = x;
        const sc = spread();
        heats[i][a] = x; heats[j][b] = y;
        if (sc < cur - 1e-9 && (!bestSwap || sc < bestSwap.score)) bestSwap = { i, a, j, b, score: sc };
      }));
    }
    if (bestSwap) {
      const { i, a, j, b } = bestSwap as { i: number; a: number; j: number; b: number; score: number };
      [heats[i][a], heats[j][b]] = [heats[j][b], heats[i][a]];
      improved = true;
    }
  }
  heats.forEach((h) => h.sort((x, y) => seedOf(x) - seedOf(y)));
  return { heats, unmet };
}

// Round 1 runs in two sessions
export const SAT_TIME_SLOTS = ['6:30', '8:00'];

// Snap any time to the nearest session ("8:30" → "8:00"); '' if no time
export function toSlot(s: string | undefined | null): string {
  const n = normalizeTime(s);
  if (!n) return '';
  const mins = (t: string) => { const [h, m] = t.split(':').map(Number); return h * 60 + m; };
  return SAT_TIME_SLOTS.reduce((best, slot) => (Math.abs(mins(slot) - mins(n)) < Math.abs(mins(best) - mins(n)) ? slot : best));
}

// Session for each Round 1 heat: saved heat time if set, else an even split of time slots.
// The play-in (if any) takes one 6:30 slot, so its winner can race at 8:00.
export function round1Slots(numHeats: number, heatTimes: (string | undefined)[] | undefined, hasPlayIn = false): string[] {
  const early = Math.ceil((numHeats + (hasPlayIn ? 1 : 0)) / 2) - (hasPlayIn ? 1 : 0);
  return Array.from({ length: numHeats }, (_, hi) =>
    toSlot(heatTimes?.[hi]) || (hi < early ? SAT_TIME_SLOTS[0] : SAT_TIME_SLOTS[1]));
}

// ─── Team ranking ────────────────────────────────────────────────────────────
// Players who haven't raced yet have no VR. Teams with them rank below every
// fully-rated team (fewest unrated players first, then by their known VR).
export interface TeamVR {
  members: string[];      // higher-VR player first, unrated last
  vr1: number | null;
  vr2: number | null;
  avgVR: number | null;   // null when any member is unrated
  newCount: number;       // unrated members
  sortVR: number;         // average of the rated members (0 if none)
}

export function teamVR(members: string[], vrOf: (name: string) => number | undefined): TeamVR {
  const ordered = [...members].sort((a, b) => (vrOf(b) ?? -1) - (vrOf(a) ?? -1));
  const vrs = ordered.map((m) => vrOf(m));
  const known = vrs.filter((v): v is number => v !== undefined);
  const avg = known.length ? known.reduce((s, v) => s + v, 0) / known.length : 0;
  return {
    members: ordered,
    vr1: vrs[0] ?? null,
    vr2: vrs[1] ?? null,
    avgVR: known.length === vrs.length && known.length > 0 ? Math.round(avg) : null,
    newCount: vrs.length - known.length,
    sortVR: avg,
  };
}

export const byTeamRank = (a: TeamVR, b: TeamVR) => a.newCount - b.newCount || b.sortVR - a.sortVR;

export const fmtVR = (v: number | null | undefined) => (v == null ? '—' : String(Math.round(v)));

// Average VR of the rated players in a set of teams (for heat averages)
export function avgRated(teams: { members: string[] }[], vrOf: (name: string) => number | undefined): number | null {
  const vs = teams.flatMap((t) => t.members.map(vrOf)).filter((v): v is number => v !== undefined);
  return vs.length ? Math.round(vs.reduce((s, v) => s + v, 0) / vs.length) : null;
}

// ─── Play-in selection ───────────────────────────────────────────────────────
// Teams eligible for the play-in: any team with an unrated player, plus the lowest
// seeds if there aren't enough of those. `ranked` must be in seed order.
export function playInCandidates<T extends { name: string; newCount: number }>(ranked: T[], size: number): T[] {
  if (!size) return [];
  const bottom = ranked.slice(ranked.length - size);
  return ranked.filter((t) => t.newCount > 0 || bottom.includes(t));
}

// The play-in teams: the admin's saved pick if it's still valid, else the lowest seeds
export function choosePlayIn<T extends { name: string; newCount: number }>(ranked: T[], size: number, savedJson?: string): T[] {
  if (!size) return [];
  try {
    const keys: string[] = (savedJson ? JSON.parse(savedJson) : []).map(teamKey);
    const picked = ranked.filter((t) => keys.includes(teamKey(t.name)));
    if (picked.length === size) return picked;
  } catch { /* fall through */ }
  return ranked.slice(ranked.length - size);
}

// ─── Sessions per round ──────────────────────────────────────────────────────
// Thu Round 1 and Fri Round 2: 6:30 / 8:00 split evenly · Sat morning Semis: 11:00 AM · Sat night Final: 8:00 PM
export const ROUND_TIME_BASE: Record<number, number> = { 0: 0, 1: 20, 2: 30, 3: 34 }; // index into sat.heatTimes
export const SEMIS_TIME = '11:00 AM';
export const FINAL_TIME = '8:00 PM';

export function roundSessions(round: number, numHeats: number, heatTimes: (string | undefined)[] | undefined, hasPlayIn = false): string[] {
  const base = ROUND_TIME_BASE[round] ?? 0;
  const saved = Array.from({ length: numHeats }, (_, hi) => heatTimes?.[base + hi]);
  if (round === 0) return round1Slots(numHeats, saved, hasPlayIn);
  if (round === 1) return round1Slots(numHeats, saved, false);
  return saved.map((t) => t || (round === 2 ? SEMIS_TIME : FINAL_TIME));
}
