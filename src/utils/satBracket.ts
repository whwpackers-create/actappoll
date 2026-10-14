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
