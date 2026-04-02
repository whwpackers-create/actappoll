import type { Act, Player, Sat, Season, PlayerStats, EloHistoryEntry } from '../types';

// ─── VR System Constants ────────────────────────────────────────────────────
export const BASE_ELO = 5000;          // starting VR for all players
export const VR_MAX   = 9999;          // hard ceiling
export const VR_ELITE = 9000;          // diminishing returns kick in above this

// Base VR change by finishing position (index 0 = 1st place)
const VR_BASE_PTS = [20, 10, -10, -20];

// Skill modifier: adjustment = -(diff / K), clamped to ±CAP
// If you're rated higher than the room, you gain less and lose more
const VR_DIFF_K   = 180;
const VR_DIFF_CAP = 15;

// SAT gain multipliers — gains only, losses are normal
export const SAT_ROUND_MULTI: Record<number, number> = { 1: 1.1, 2: 1.2, 3: 1.5, 4: 2.0 };
export const SAT_ROUND_MULTI_DEFAULT = 1.1;

// Season base (everyone starts here for a fresh season calc)
export const SEASON_BASE_ELO = 5000;

// Rank thresholds scaled to VR range
export const SEASON_RANKS = [
  { key: 'diamond',  name: 'Diamond',  min: 8000, color: '#67e8f9', bg: 'rgba(103,232,249,0.12)', icon: '💎' },
  { key: 'platinum', name: 'Platinum', min: 7000, color: '#e2e8f0', bg: 'rgba(226,232,240,0.10)', icon: '🔹' },
  { key: 'gold',     name: 'Gold',     min: 6200, color: '#fbbf24', bg: 'rgba(251,191,36,0.12)',  icon: '🥇' },
  { key: 'silver',   name: 'Silver',   min: 5500, color: '#94a3b8', bg: 'rgba(148,163,184,0.10)', icon: '🥈' },
  { key: 'bronze',   name: 'Bronze',   min: 5000, color: '#cd7f32', bg: 'rgba(205,127,50,0.10)',  icon: '🥉' },
  { key: 'copper',   name: 'Copper',   min: 0,    color: '#b45309', bg: 'rgba(180,83,9,0.10)',    icon: '🪙' },
] as const;

export function getSeasonRank(vr: number) {
  return SEASON_RANKS.find((r) => vr >= r.min) ?? SEASON_RANKS[SEASON_RANKS.length - 1];
}

// ─── SAT placement bonus (kept for reference, not applied retroactively) ────
export const SAT_PLACEMENT_BONUS: Record<string, number> = {
  winner: 25, runnerUp: 15, finalist: 12, semi: 8, round2: 5,
};

// ─── Core VR change for a single race ───────────────────────────────────────
function vrChange(
  myVR: number,
  oppVRs: number[],
  pos: number,        // 0=1st, 1=2nd, 2=3rd, 3=4th
  satGainMult: number
): number {
  if (oppVRs.length === 0) return 0;

  const avgOppVR = oppVRs.reduce((s, v) => s + v, 0) / oppVRs.length;
  const diff     = myVR - avgOppVR;

  // Base points from finish position
  const base = VR_BASE_PTS[Math.min(pos, VR_BASE_PTS.length - 1)];

  // Skill modifier — being above the room reduces gains, increases losses
  const adj  = Math.max(-VR_DIFF_CAP, Math.min(VR_DIFF_CAP, -(diff / VR_DIFF_K)));
  let change = base + adj;

  // SAT day multiplier (gains only)
  if (change > 0) change *= satGainMult;

  // Diminishing returns above VR_ELITE (losses unaffected)
  if (change > 0 && myVR > VR_ELITE) {
    change *= Math.max(0, (VR_MAX - myVR) / (VR_MAX - VR_ELITE));
  }

  return change;
}

// ─── Main VR computation ────────────────────────────────────────────────────
export function computeAllElos(
  players: Player[],
  acts: Act[],
  _sats?: Sat[] | null,
  _seasons?: Season[]
): { elos: Record<string, number>; hist: Record<string, EloHistoryEntry[]> } {
  const vrs:  Record<string, number>           = {};
  const hist: Record<string, EloHistoryEntry[]> = {};

  players.forEach((p) => { vrs[p.name] = BASE_ELO; hist[p.name] = []; });

  [...acts]
    .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime())
    .forEach((act) => {
      // Build substitution name map
      const subMap: Record<string, string> = {};
      act.teams.forEach((t) => {
        if (t.subs) t.members.forEach((m, i) => { if (t.subs?.[i]) subMap[m] = t.subs[i]; });
      });
      const remap = (n: string) => subMap[n] ?? n;

      const satGainMult = act.satId
        ? (SAT_ROUND_MULTI[act.satRound ?? 1] ?? SAT_ROUND_MULTI_DEFAULT) : 1;

      // Collect all players in this act and initialise any new ones
      const actPlayers = new Set<string>();
      act.teams.forEach((t) => t.members.forEach((m) => actPlayers.add(remap(m))));
      act.races.forEach((r) => r.results.forEach((res) => { if (res.player) actPlayers.add(remap(res.player)); }));

      const startVR:   Record<string, number> = {};
      const totalPts:  Record<string, number> = {};
      actPlayers.forEach((name) => {
        if (!(name in vrs)) { vrs[name] = BASE_ELO; hist[name] = []; }
        startVR[name]  = vrs[name];
        totalPts[name] = 0;
      });

      // Process each race individually — VR updates carry into subsequent races
      act.races.forEach((race) => {
        const raceResults = race.results
          .map((res) => ({ name: remap(res.player), pts: res.points }))
          .filter((r) => r.name);

        // Accumulate total points for the history entry
        raceResults.forEach((r) => { totalPts[r.name] = (totalPts[r.name] ?? 0) + r.pts; });

        if (raceResults.length < 2) return;

        // Sort descending by race points → position 0 = 1st place
        const sorted = [...raceResults].sort((a, b) => b.pts - a.pts);

        sorted.forEach(({ name }, pos) => {
          if (!(name in vrs)) { vrs[name] = BASE_ELO; hist[name] = []; startVR[name] = BASE_ELO; totalPts[name] = 0; }

          const oppVRs = sorted.filter((_, i) => i !== pos).map(({ name: opp }) => vrs[opp] ?? BASE_ELO);
          const change = vrChange(vrs[name], oppVRs, pos, satGainMult);
          vrs[name] = Math.max(1, Math.min(VR_MAX, vrs[name] + change));
        });
      });

      // One history entry per act (net VR change across all races)
      actPlayers.forEach((name) => {
        if (!hist[name]) hist[name] = [];
        hist[name].push({
          actId:   act.id ?? act._id ?? '',
          actName: act.name,
          date:    act.date,
          elo:     Math.round(vrs[name]),
          change:  Math.round((vrs[name] - startVR[name]) * 10) / 10,
          points:  totalPts[name] ?? 0,
          isSat:   !!act.satId,
        });
      });
    });

  return { elos: vrs, hist };
}

// ─── Season VR computation ──────────────────────────────────────────────────
export function computeSeasonElos(
  players: Player[],
  acts: Act[],
  season: Season
): { seasonElos: Record<string, number>; seasonHistory: Record<string, EloHistoryEntry[]>; actCount: number } {
  const sActs = acts
    .filter((a) => {
      const d = new Date(a.date);
      return d >= new Date(season.startDate) && d <= new Date(season.endDate);
    })
    .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

  const sVRs: Record<string, number>            = {};
  const sH:   Record<string, EloHistoryEntry[]> = {};
  players.forEach((p) => { sVRs[p.name] = SEASON_BASE_ELO; sH[p.name] = []; });

  sActs.forEach((act) => {
    const subMap: Record<string, string> = {};
    act.teams.forEach((t) => {
      if (t.subs) t.members.forEach((m, i) => { if (t.subs?.[i]) subMap[m] = t.subs[i]; });
    });
    const remap = (n: string) => subMap[n] ?? n;

    const satGainMult = act.satId
      ? (SAT_ROUND_MULTI[act.satRound ?? 1] ?? SAT_ROUND_MULTI_DEFAULT) : 1;

    const actPlayers = new Set<string>();
    act.teams.forEach((t) => t.members.forEach((m) => actPlayers.add(remap(m))));
    act.races.forEach((r) => r.results.forEach((res) => { if (res.player) actPlayers.add(remap(res.player)); }));

    const startVR:  Record<string, number> = {};
    const totalPts: Record<string, number> = {};
    actPlayers.forEach((name) => {
      if (!(name in sVRs)) { sVRs[name] = SEASON_BASE_ELO; sH[name] = []; }
      startVR[name]  = sVRs[name];
      totalPts[name] = 0;
    });

    act.races.forEach((race) => {
      const raceResults = race.results
        .map((res) => ({ name: remap(res.player), pts: res.points }))
        .filter((r) => r.name);

      raceResults.forEach((r) => { totalPts[r.name] = (totalPts[r.name] ?? 0) + r.pts; });
      if (raceResults.length < 2) return;

      const sorted = [...raceResults].sort((a, b) => b.pts - a.pts);
      sorted.forEach(({ name }, pos) => {
        if (!(name in sVRs)) { sVRs[name] = SEASON_BASE_ELO; sH[name] = []; startVR[name] = SEASON_BASE_ELO; totalPts[name] = 0; }
        const oppVRs = sorted.filter((_, i) => i !== pos).map(({ name: opp }) => sVRs[opp] ?? SEASON_BASE_ELO);
        const change = vrChange(sVRs[name], oppVRs, pos, satGainMult);
        sVRs[name] = Math.max(1, Math.min(VR_MAX, sVRs[name] + change));
      });
    });

    actPlayers.forEach((name) => {
      if (!sH[name]) sH[name] = [];
      sH[name].push({
        actId:   act.id ?? act._id ?? '',
        actName: act.name,
        date:    act.date,
        elo:     Math.round(sVRs[name]),
        change:  Math.round((sVRs[name] - startVR[name]) * 10) / 10,
        points:  totalPts[name] ?? 0,
        isSat:   !!act.satId,
      });
    });
  });

  return { seasonElos: sVRs, seasonHistory: sH, actCount: sActs.length };
}

// ─── computeStats (wraps computeAllElos, computes per-player aggregates) ────
export function computeStats(
  players: Player[],
  acts: Act[],
  sats: Sat[] | null | undefined,
  seasons?: Season[]
): PlayerStats[] {
  const { elos, hist } = computeAllElos(players, acts, sats ?? [], seasons);

  return players.map((p) => {
    let tR = 0, tP = 0, aC = 0, jW = 0, jC = 0, w = 0;

    acts.forEach((act) => {
      const inTeam = act.teams.find(
        (t) => t.members.includes(p.name) || (t.subs ?? []).includes(p.name)
      );
      const sMap2: Record<string, string> = {};
      act.teams.forEach((t) => {
        if (t.subs) t.members.forEach((m, i) => { if (t.subs?.[i]) sMap2[m] = t.subs[i]; });
      });
      const inRaces = act.races.some((r) =>
        r.results.some(
          (res) => res.player === p.name || (sMap2[res.player] ?? res.player) === p.name
        )
      );
      if (!inTeam && !inRaces) return;
      aC++;

      const sMap: Record<string, string> = {};
      act.teams.forEach((t) => {
        if (t.subs) t.members.forEach((m, i) => { if (t.subs?.[i]) sMap[m] = t.subs[i]; });
      });

      act.races.forEach((r) => {
        const e = r.results.find(
          (x) => (sMap[x.player] ?? x.player) === p.name || x.player === p.name
        );
        if (e) { tR++; tP += e.points; }
      });

      let pen = act.penalties;
      if (!pen && act.penaltiesJson) {
        try { pen = JSON.parse(act.penaltiesJson) as Act['penalties']; } catch { /* ignore */ }
      }

      const ts = teamScores(act);
      const t2 = ts.slice(0, 2);
      const playerTeam = act.teams.find(
        (t) => t.members.includes(p.name) || (t.subs ?? []).includes(p.name)
      );
      if (playerTeam && t2.find((x) => x.team.name === playerTeam.name)) {
        jC++;
        if (t2[0].team.name === playerTeam.name) { jW++; w++; }
      }
    });

    const eloH = hist[p.name] ?? [];
    let change30d = 0;
    if (eloH.length > 0) {
      const d30 = new Date(Date.now() - 30 * 86400000);
      change30d = eloH.filter((h) => new Date(h.date) >= d30).reduce((s, h) => s + h.change, 0);
    }

    return {
      ...p,
      elo:          Math.round(elos[p.name] ?? BASE_ELO),
      eloHistory:   eloH,
      totalRaces:   tR,
      totalPoints:  tP,
      pts:          tP,
      raceCount:    tR,
      actCount:     aC,
      avgPtsAct:    aC > 0 ? tP / aC : 0,
      avgPtsRace:   tR > 0 ? tP / tR : 0,
      winRate:      aC > 0 ? w / aC : 0,
      jsPct:        jC > 0 ? jW / jC : 0,
      jsW:          jC,
      jsC:          jC,
      jerseySwaps:  jC,
      wins:         w,
      change30d:    Math.round(change30d),
    };
  });
}

// ─── Bracket breakdown for double-up players in ActDetail ───────────────────
export interface BracketBreakdown {
  pts0: number; pts1: number;
  ch0:  number; ch1:  number;
}

export function computeActBracketBreakdown(
  act: Act,
  vrsBefore: Record<string, number>
): Record<string, BracketBreakdown> {
  const result: Record<string, BracketBreakdown> = {};

  const subMap: Record<string, string> = {};
  act.teams.forEach((t) => {
    if (t.subs) t.members.forEach((m, i) => { if (t.subs?.[i]) subMap[m] = t.subs[i]; });
  });
  const remap = (n: string) => subMap[n] ?? n;

  // Find double-up (solo) players
  const soloPlayers = new Set<string>();
  act.teams.forEach((t) => {
    const rm = t.members.map((m) => remap(m));
    if (rm.length >= 2 && rm[0] === rm[1]) soloPlayers.add(rm[0]);
  });
  if (soloPlayers.size === 0) return result;

  const posMap: Record<string, 0 | 1> = {};
  act.teams.forEach((t) => {
    const rm = t.members.map((m) => remap(m));
    if (rm.length >= 2 && rm[0] !== rm[1]) { posMap[rm[0]] = 0; posMap[rm[1]] = 1; }
  });

  // Determine which bracket each race belongs to
  const racePos: (0 | 1 | null)[] = act.races.map((r) => {
    const nonSolo = r.results.map((res) => remap(res.player)).filter((p) => !soloPlayers.has(p) && p in posMap);
    if (nonSolo.length === 0) return null;
    const c0 = nonSolo.filter((p) => posMap[p] === 0).length;
    const c1 = nonSolo.filter((p) => posMap[p] === 1).length;
    return c0 >= c1 ? 0 : 1;
  });

  const satGainMult = act.satId
    ? (SAT_ROUND_MULTI[act.satRound ?? 1] ?? SAT_ROUND_MULTI_DEFAULT) : 1;

  soloPlayers.forEach((name) => {
    let pts0 = 0, pts1 = 0, ch0 = 0, ch1 = 0;

    act.races.forEach((race, i) => {
      const raceResults = race.results
        .map((res) => ({ name: remap(res.player), pts: res.points }))
        .filter((r) => r.name);

      const sorted = [...raceResults].sort((a, b) => b.pts - a.pts);
      const pos = sorted.findIndex((r) => r.name === name);
      if (pos === -1) return;

      const oppVRs = sorted.filter((_, j) => j !== pos).map(({ name: opp }) => vrsBefore[opp] ?? BASE_ELO);
      const change = vrChange(vrsBefore[name] ?? BASE_ELO, oppVRs, pos, satGainMult);
      const pts = sorted[pos].pts;

      if (racePos[i] === 0)      { pts0 += pts; ch0 += change; }
      else if (racePos[i] === 1) { pts1 += pts; ch1 += change; }
    });

    result[name] = { pts0, pts1, ch0, ch1 };
  });

  return result;
}

// ─── Team scores (unchanged — used for win/loss display) ────────────────────
export interface TeamScore {
  team: Act['teams'][0];
  score: number;
}

export function teamScores(act: Act): TeamScore[] {
  let pen = act.penalties;
  if (!pen && act.penaltiesJson) {
    try { pen = JSON.parse(act.penaltiesJson) as Act['penalties']; } catch { /* ignore */ }
  }

  return act.teams
    .map((t, ti) => {
      let s = 0;
      act.races.forEach((r) =>
        r.results.forEach((x) => {
          if (t.members.includes(x.player) || (t.subs ?? []).includes(x.player)) s += x.points;
        })
      );
      if (pen) {
        pen.forEach((round) => {
          const v = round[ti];
          if (Array.isArray(v)) s += v.reduce((s2, x) => s2 + x * -2, 0);
          else s += (v ?? 0) * -2;
        });
      }
      return { team: t, score: s };
    })
    .sort((a, b) => b.score - a.score);
}
