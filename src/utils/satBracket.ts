// SAT bracket structure — every heat has exactly 4 teams.
//
// Play-in (decided manually) trims the field to a multiple of 4:
//   1 extra team  → 2 lowest seeds play in, 1 advances
//   2 extra teams → 4 lowest seeds play in, 2 advance
//   3 extra teams → 4 lowest seeds play in, 1 advances
// After Day 1, each round takes the top 2 from every heat, plus the best 3rd-placers
// only when needed to make the next round a multiple of 4. Rounds continue until 4 teams (Finals).

export const TEAMS_PER_HEAT = 4;

// Stage round indexes stored on heats / acts: 0=Day 1, 1=Day 2, 2=Semis, 3=Finals
export const STAGE_LABEL: Record<number, string> = { 0: 'Round 1', 1: 'Round 2', 2: 'Semifinals', 3: 'Finals' };

export function playInInfo(nTeams: number): { size: number; advance: number; fieldSize: number } {
  const extra = nTeams % TEAMS_PER_HEAT;
  if (extra === 0 || nTeams < TEAMS_PER_HEAT * 2) return { size: 0, advance: 0, fieldSize: nTeams - extra };
  const size = extra === 1 ? 2 : 4;
  return { size, advance: size - extra, fieldSize: nTeams - extra };
}

// Team count per round, starting from the Day 1 field, e.g. 28 → [28, 16, 8, 4]
export function stageSizes(fieldSize: number): number[] {
  const sizes = [fieldSize];
  let t = fieldSize;
  while (t > TEAMS_PER_HEAT) {
    const adv = 2 * (t / TEAMS_PER_HEAT);
    t = Math.ceil(adv / TEAMS_PER_HEAT) * TEAMS_PER_HEAT;
    sizes.push(t);
  }
  // Very large fields (36+) would need 5+ rounds — cap at Day 1 → 16 → 8 → 4
  return sizes.length > 4 ? [fieldSize, 16, 8, 4] : sizes;
}

// Map each stage to its stored round index. Finals is always 3, Semis 2; Day 2 only exists for 4-stage SATs.
export function stageRounds(sizes: number[]): number[] {
  const n = sizes.length;
  if (n === 1) return [3];
  if (n === 2) return [0, 3];
  if (n === 3) return [0, 2, 3];
  return [0, 1, 2, 3];
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
// Returns seeded advancing teams + unused 3rd-placers (alternates, best first).
export function advanceTeams(
  heatRankings: RankedTeam[][],
  targetSize: number,
  seedTie: (a: RankedTeam, b: RankedTeam) => number
): { teams: StageTeam[]; alternates: StageTeam[] } {
  const norm = (t: RankedTeam) => ({ name: t.name, members: t.members, subs: t.subs ?? [], score: t.score });
  const adv = heatRankings.flatMap((r) => r.slice(0, 2).map(norm));
  const thirds = heatRankings.filter((r) => r[2]).map((r) => norm(r[2]))
    .sort((a, b) => b.score - a.score || seedTie(a, b));
  const fill = Math.max(0, targetSize - adv.length);
  const ranked = [...adv, ...thirds.slice(0, fill)].sort((a, b) => b.score - a.score || seedTie(a, b));
  const teams = ranked.slice(0, targetSize).map((t, i) => ({ ...t, seed: i + 1 }));
  const alternates = [...ranked.slice(targetSize), ...thirds.slice(fill)].map((t, i) => ({ ...t, seed: targetSize + 1 + i }));
  return { teams, alternates };
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
