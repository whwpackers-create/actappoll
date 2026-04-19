import type { Act, Player, Sat, Season, PlayerStats, EloHistoryEntry } from '../types';

// ─── VR System Constants ────────────────────────────────────────────────────
export const BASE_ELO    = 5000;       // starting VR for all players
export const STARTING_VR = BASE_ELO;   // alias kept for display fallbacks
export const VR_MAX      = 9999;       // hard ceiling
export const VR_ELITE    = 9000;       // diminishing returns kick in above this

// Base VR change by finishing position (index 0 = 1st place)
const VR_BASE_PTS = [30, 15, -15, -30];

// Skill modifier: adjustment = -(diff / K), clamped to ±CAP
// If you're rated higher than the room, you gain less and lose more
const VR_DIFF_K   = 120;
const VR_DIFF_CAP = 20;

// Floor loss dampening: players below 5000 VR lose less based on ACTs played
//  0–8 ACTs:  no protection (new players find their level fast)
//  9–20 ACTs: 30% loss reduction below 5000
//  21+ ACTs:  50% loss reduction below 5000
const FLOOR_VR              = 5000;
const FLOOR_MID_ACTS        = 8;    // must have played MORE than this for mid-tier protection
const FLOOR_VET_ACTS        = 20;   // must have played MORE than this for full protection
const FLOOR_MID_REDUCTION   = 0.30;
const FLOOR_VET_REDUCTION   = 0.50;

// Provisional period: first N all-time ACTs get reduced gains (not losses)
const PROVISIONAL_ACTS      = 10;
const PROVISIONAL_GAIN_MULT = 0.60;

// Underdog protection thresholds
// When a player is this many VR below room average, losses start being reduced
const UNDERDOG_FLOOR  = 300;   // deficit at which protection starts
const UNDERDOG_SCALE  = 900;   // deficit at which protection is at max
const UNDERDOG_MAX    = 0.85;  // maximum loss reduction (85%)

// SAT gain multipliers — gains only, losses are normal
export const SAT_ROUND_MULTI: Record<number, number> = { 1: 1.1, 2: 1.2, 3: 1.5, 4: 2.0 };
export const SAT_ROUND_MULTI_DEFAULT = 1.1;

// Season base floor (no one starts below this)
export const SEASON_BASE_ELO = 5000;

// Number of ACTs that count as placements (boosted gains)
export const SEASON_PLACEMENT_ACTS = 4;
export const SEASON_PLACEMENT_MULT = 2.0;

// Minimum ACTs to be ranked; below this shows as Unranked
export const SEASON_RANKED_THRESHOLD = 4;

// Season ranks — compressed scale so Diamond/Platinum are achievable within a season
export const SEASON_RANKS = [
  { key: 'diamond',  name: 'Diamond',  min: 6500, color: '#67e8f9', bg: 'rgba(103,232,249,0.12)', icon: '💎' },
  { key: 'platinum', name: 'Platinum', min: 5900, color: '#e2e8f0', bg: 'rgba(226,232,240,0.10)', icon: '🔹' },
  { key: 'gold',     name: 'Gold',     min: 5500, color: '#fbbf24', bg: 'rgba(251,191,36,0.12)',  icon: '🥇' },
  { key: 'silver',   name: 'Silver',   min: 5200, color: '#94a3b8', bg: 'rgba(148,163,184,0.10)', icon: '🥈' },
  { key: 'bronze',   name: 'Bronze',   min: 4900, color: '#cd7f32', bg: 'rgba(205,127,50,0.10)',  icon: '🥉' },
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
  pos: number,           // 0=1st, 1=2nd, 2=3rd, 3=4th
  satGainMult: number,
  provMult: number = 1.0,  // provisional period multiplier (gains only)
  actCount: number = 0     // all-time ACTs played (for floor dampening tier)
): number {
  if (oppVRs.length === 0) return 0;

  const avgOppVR = oppVRs.reduce((s, v) => s + v, 0) / oppVRs.length;
  const diff     = myVR - avgOppVR;

  // Base points from finish position
  const base = VR_BASE_PTS[Math.min(pos, VR_BASE_PTS.length - 1)];

  // Skill modifier — being above the room reduces gains, increases losses
  const adj  = Math.max(-VR_DIFF_CAP, Math.min(VR_DIFF_CAP, -(diff / VR_DIFF_K)));
  let change = base + adj;

  // SAT day multiplier + provisional dampening (gains only)
  if (change > 0) {
    change *= satGainMult;
    change *= provMult;
  }

  // Underdog protection: reduce losses when substantially below room average
  if (change < 0 && diff < -UNDERDOG_FLOOR) {
    const deficit = Math.abs(diff) - UNDERDOG_FLOOR;
    const reductionFactor = Math.min(UNDERDOG_MAX, (deficit / UNDERDOG_SCALE) * UNDERDOG_MAX);
    change *= (1 - reductionFactor);
  }

  // Floor loss dampening: players below 5000 lose less based on ACTs played
  if (change < 0 && myVR < FLOOR_VR) {
    let floorReduction = 0;
    if (actCount > FLOOR_VET_ACTS)      floorReduction = FLOOR_VET_REDUCTION;
    else if (actCount > FLOOR_MID_ACTS) floorReduction = FLOOR_MID_REDUCTION;
    if (floorReduction > 0) change *= (1 - floorReduction);
  }

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
  const provActCount: Record<string, number>    = {};  // all-time ACTs played per player

  players.forEach((p) => { vrs[p.name] = STARTING_VR; hist[p.name] = []; provActCount[p.name] = 0; });

  [...acts]
    .sort((a, b) => {
      const dt = new Date(a.date).getTime() - new Date(b.date).getTime();
      if (dt !== 0) return dt;
      return (a.satRound ?? 0) - (b.satRound ?? 0);
    })
    .forEach((act) => {
      // Build substitution name map
      const subMap: Record<string, string> = {};
      act.teams.forEach((t) => {
        if (t.subs) t.members.forEach((m, i) => { if (t.subs?.[i]) subMap[m] = t.subs[i]; });
      });
      const remap = (n: string) => subMap[n] ?? n;

      const satGainMult = act.satId
        ? (SAT_ROUND_MULTI[act.satRound ?? 1] ?? SAT_ROUND_MULTI_DEFAULT) : 1;

      // For 16-man acts: if act.races is missing TV2 data, reconstruct TV2 races
      // from gridJson+playerMapJson so TV2 players get proper VR changes.
      // TV1 and TV2 each race only against their own TV peers — just like two 8-mans.
      let effectiveRaces = act.races as { raceNum?: number; results: { player: string; points: number }[] }[];
      if (act.gridJson && act.playerMapJson) {
        try {
          const sg: (number | null)[][][] = JSON.parse(act.gridJson);
          const spm: number[][][] = JSON.parse(act.playerMapJson);
          const gridWidth = sg?.[0]?.[0]?.length ?? 0;
          // 16-man grid has 8 slots per cell; expect 32 races (4 rounds × 8 heats).
          // If fewer than 32, TV2 races are missing — reconstruct them from the grid.
          if (gridWidth === 8 && act.races.length < 32) {
            const extra: typeof effectiveRaces = [];
            let n = act.races.length + 1;
            for (let ri = 0; ri < 4; ri++) {
              for (let h = 4; h < 8; h++) {   // TV2 heat positions only
                const res: { player: string; points: number }[] = [];
                for (let ti = 0; ti < act.teams.length && ti < 4; ti++) {
                  const miRaw = spm[ri]?.[ti]?.[h];
                  const mi = miRaw !== undefined && miRaw !== null
                    ? miRaw
                    : (h % 2 === 0 ? 1 : 3);   // default TV2 slots: 1 and 3
                  const memberName = act.teams[ti]?.members[mi] ?? '';
                  if (!memberName.trim()) continue;
                  const pts = sg[ri]?.[ti]?.[h] ?? 0;
                  res.push({ player: memberName, points: pts });
                }
                if (res.length >= 2) extra.push({ raceNum: n++, results: res });
              }
            }
            effectiveRaces = [...act.races, ...extra];
          }
        } catch { /* ignore malformed grid data */ }
      }

      // Collect all players in this act and initialise any new ones
      const actPlayers = new Set<string>();
      act.teams.forEach((t) => t.members.forEach((m) => { if (m.trim()) actPlayers.add(remap(m)); }));
      effectiveRaces.forEach((r) => r.results.forEach((res) => { if (res.player) actPlayers.add(remap(res.player)); }));

      const startVR:   Record<string, number> = {};
      const totalPts:  Record<string, number> = {};
      // Snapshot provisional counts at act start so all races in this act share the same prov status
      const actProvSnapshot: Record<string, number> = {};
      actPlayers.forEach((name) => {
        if (!(name in vrs)) { vrs[name] = STARTING_VR; hist[name] = []; provActCount[name] = 0; }
        startVR[name]  = vrs[name];
        totalPts[name] = 0;
        actProvSnapshot[name] = provActCount[name] ?? 0;
      });

      // Process each race individually — VR updates carry into subsequent races
      effectiveRaces.forEach((race) => {
        const raceResults = race.results
          .map((res) => ({ name: remap(res.player), pts: res.points }))
          .filter((r) => r.name);

        // Accumulate total points for the history entry
        raceResults.forEach((r) => { totalPts[r.name] = (totalPts[r.name] ?? 0) + r.pts; });

        if (raceResults.length < 2) return;

        // Sort descending by race points → position 0 = 1st place
        const sorted = [...raceResults].sort((a, b) => b.pts - a.pts);

        sorted.forEach(({ name }, pos) => {
          if (!(name in vrs)) { vrs[name] = STARTING_VR; hist[name] = []; startVR[name] = STARTING_VR; totalPts[name] = 0; actProvSnapshot[name] = 0; }

          const oppVRs = sorted.filter((_, i) => i !== pos).map(({ name: opp }) => vrs[opp] ?? STARTING_VR);
          const snap = actProvSnapshot[name] ?? 0;
          const provMult = snap < PROVISIONAL_ACTS ? PROVISIONAL_GAIN_MULT : 1.0;
          const change = vrChange(vrs[name], oppVRs, pos, satGainMult, provMult, snap);
          vrs[name] = Math.max(1, Math.min(VR_MAX, vrs[name] + change));
        });
      });

      // One history entry per act (net VR change across all races)
      actPlayers.forEach((name) => {
        if (!hist[name]) hist[name] = [];
        hist[name].push({
          actId:   act.id || act._id || '',
          actName: act.name,
          date:    act.date,
          elo:     Math.round(vrs[name]),
          change:  Math.round((vrs[name] - startVR[name]) * 10) / 10,
          points:  totalPts[name] ?? 0,
          isSat:   !!act.satId,
        });
        // Increment provisional ACT count after the act is processed
        provActCount[name] = (provActCount[name] ?? 0) + 1;
      });
    });

  return { elos: vrs, hist };
}

// ─── Season VR computation ──────────────────────────────────────────────────
export function computeSeasonElos(
  players: Player[],
  acts: Act[],
  season: Season,
  allTimeElos?: Record<string, number>  // optional: each player's all-time VR at season start
): { seasonElos: Record<string, number>; seasonHistory: Record<string, EloHistoryEntry[]>; actCount: number } {
  const sActs = acts
    .filter((a) => {
      const d = new Date(a.date);
      return d >= new Date(season.startDate) && d <= new Date(season.endDate);
    })
    .sort((a, b) => {
      const dt = new Date(a.date).getTime() - new Date(b.date).getTime();
      if (dt !== 0) return dt;
      return (a.satRound ?? 0) - (b.satRound ?? 0);
    });

  // Starting VR = midpoint between SEASON_BASE_ELO and the player's all-time VR
  // e.g. 7000 all-time → 6000 season start; 5000 all-time → 5000 season start
  const seasonStart = (name: string): number => {
    const allTime = allTimeElos?.[name] ?? SEASON_BASE_ELO;
    return Math.round((SEASON_BASE_ELO + allTime) / 2);
  };

  const sVRs: Record<string, number>            = {};
  const sH:   Record<string, EloHistoryEntry[]> = {};
  const actCount: Record<string, number>         = {}; // ACTs played in season per player (for placement)
  players.forEach((p) => { sVRs[p.name] = seasonStart(p.name); sH[p.name] = []; actCount[p.name] = 0; });

  sActs.forEach((act) => {
    const subMap: Record<string, string> = {};
    act.teams.forEach((t) => {
      if (t.subs) t.members.forEach((m, i) => { if (t.subs?.[i]) subMap[m] = t.subs[i]; });
    });
    const remap = (n: string) => subMap[n] ?? n;

    const satGainMult = act.satId
      ? (SAT_ROUND_MULTI[act.satRound ?? 1] ?? SAT_ROUND_MULTI_DEFAULT) : 1;

    // Reconstruct missing TV2 races for 16-man acts (same logic as computeAllElos)
    let effectiveRaces = act.races as { raceNum?: number; results: { player: string; points: number }[] }[];
    if (act.gridJson && act.playerMapJson) {
      try {
        const sg: (number | null)[][][] = JSON.parse(act.gridJson);
        const spm: number[][][] = JSON.parse(act.playerMapJson);
        const gridWidth = sg?.[0]?.[0]?.length ?? 0;
        if (gridWidth === 8 && act.races.length < 32) {
          const extra: typeof effectiveRaces = [];
          let n = act.races.length + 1;
          for (let ri = 0; ri < 4; ri++) {
            for (let h = 4; h < 8; h++) {
              const res: { player: string; points: number }[] = [];
              for (let ti = 0; ti < act.teams.length && ti < 4; ti++) {
                const miRaw = spm[ri]?.[ti]?.[h];
                const mi = miRaw !== undefined && miRaw !== null ? miRaw : (h % 2 === 0 ? 1 : 3);
                const memberName = act.teams[ti]?.members[mi] ?? '';
                if (!memberName.trim()) continue;
                res.push({ player: memberName, points: sg[ri]?.[ti]?.[h] ?? 0 });
              }
              if (res.length >= 2) extra.push({ raceNum: n++, results: res });
            }
          }
          effectiveRaces = [...act.races, ...extra];
        }
      } catch { /* ignore */ }
    }

    const actPlayers = new Set<string>();
    act.teams.forEach((t) => t.members.forEach((m) => { if (m.trim()) actPlayers.add(remap(m)); }));
    effectiveRaces.forEach((r) => r.results.forEach((res) => { if (res.player) actPlayers.add(remap(res.player)); }));

    const startVR:  Record<string, number> = {};
    const totalPts: Record<string, number> = {};
    actPlayers.forEach((name) => {
      if (!(name in sVRs)) { sVRs[name] = seasonStart(name); sH[name] = []; actCount[name] = 0; }
      startVR[name]  = sVRs[name];
      totalPts[name] = 0;
    });

    effectiveRaces.forEach((race) => {
      const raceResults = race.results
        .map((res) => ({ name: remap(res.player), pts: res.points }))
        .filter((r) => r.name);

      raceResults.forEach((r) => { totalPts[r.name] = (totalPts[r.name] ?? 0) + r.pts; });
      if (raceResults.length < 2) return;

      const sorted = [...raceResults].sort((a, b) => b.pts - a.pts);
      sorted.forEach(({ name }, pos) => {
        if (!(name in sVRs)) { sVRs[name] = seasonStart(name); sH[name] = []; startVR[name] = seasonStart(name); totalPts[name] = 0; actCount[name] = 0; }

        // Placement boost: first N races get a gain multiplier
        const isPlacement = (actCount[name] ?? 0) < SEASON_PLACEMENT_ACTS;
        const placementMult = isPlacement ? SEASON_PLACEMENT_MULT : 1;

        const oppVRs = sorted.filter((_, i) => i !== pos).map(({ name: opp }) => sVRs[opp] ?? seasonStart(opp));
        const change = vrChange(sVRs[name], oppVRs, pos, satGainMult * placementMult);
        sVRs[name] = Math.max(1, Math.min(VR_MAX, sVRs[name] + change));
      });
    });

    // Increment ACT count once per ACT (not per race)
    actPlayers.forEach((name) => { actCount[name] = (actCount[name] ?? 0) + 1; });

    actPlayers.forEach((name) => {
      if (!sH[name]) sH[name] = [];
      sH[name].push({
        actId:   act.id || act._id || '',
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
      elo:          Math.round(elos[p.name] ?? STARTING_VR),
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

      const oppVRs = sorted.filter((_, j) => j !== pos).map(({ name: opp }) => vrsBefore[opp] ?? STARTING_VR);
      const change = vrChange(vrsBefore[name] ?? STARTING_VR, oppVRs, pos, satGainMult);
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
