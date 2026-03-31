import type { Act, Player, Sat, Season, PlayerStats, EloHistoryEntry } from '../types';

export const BASE_ELO = 1000;          // starting ELO for all players
export const SOFT_FLOOR = 800;         // losses start dampening below this point
export const MAX_PTS = 24;
export const K_BASE = 40;
export const PLACEMENT_ACTS = 4;       // overall ELO placement: first 4 ACTs get 2× K
export const SOFT_FLOOR_DAMP_RANGE = 200; // range below SOFT_FLOOR where dampening ramps in (800→600)
export const SOFT_FLOOR_DAMP_MAX = 0.6;   // max 60% loss reduction at the floor
export const CARRY = 0.3; // kept for reference
export const SAT_MULTI = 1.25;
export const SEASON_PLACEMENT_ACTS = 4; // placement period for season ELO only (2× K)
// Lobby quality multiplier on gains — based on avg global rank of bracket opponents
// Rank 1-7: 2.0×, 8-15: 1.5×, 16-25: 1.2×, 26+: 1.0× (no penalty for weak fields — just no bonus)
export const LOBBY_RANK_TIERS = [
  { maxRank: 7,  mult: 2.0 },
  { maxRank: 15, mult: 1.5 },
  { maxRank: 25, mult: 1.2 },
  { maxRank: Infinity, mult: 1.0 },
] as const;
export const SEASON_DECAY_PER = 0.1;   // 10% decay per season back in overall ELO
export const SEASON_DECAY_MIN = 0.5;   // minimum weight (oldest seasons, 5+ back)
export const SEASON_BASE_ELO = 800;        // everyone starts here each season (below leaderboard 1000)
export const SEASON_K_MULTI = 2.0;         // base amplifier on all season changes — creates spread over short seasons
export const SEASON_COMP_MMR_WEIGHT = 0.4; // how much opponent MMR vs season ELO affects competition level (0=season only, 1=MMR only)
export const MMR_SCALE = 400;              // gap between MMR and season ELO at which factors hit their extremes
export const MMR_GAIN_MAX = 2.0;    // max gain multiplier (high MMR, far below season ELO)
export const MMR_GAIN_MIN = 0.5;    // min gain multiplier (low MMR, far above season ELO)
export const MMR_LOSS_MAX = 1.75;   // max loss multiplier (low MMR, overranked in season)
export const MMR_LOSS_MIN = 0.5;    // min loss multiplier (high MMR, underranked in season)
export const SEASON_DAMP_AFTER = 12;  // ACTs in a season after which changes are dampened
export const SEASON_DAMP_FACTOR = 0.6; // multiplier applied to ch after SEASON_DAMP_AFTER ACTs
// Bracket rank protection:
// If the average global rank of all players in a bracket (slot 0 or slot 1) is ≤ COMP_ACT_AVG_RANK,
// any player in that bracket who scores ≥ COMP_TOP_SEED_PTS_MIN won't lose ELO —
// their saved loss is redistributed to their bracket peers.
export const COMP_ACT_AVG_RANK = 10;        // avg global rank threshold for a "high-skill" bracket
export const COMP_TOP_SEED_PTS_MIN = 14;    // must score at least this to get protection

export const SEASON_RANKS = [
  { key: 'diamond',  name: 'Diamond',  min: 1100, color: '#67e8f9', bg: 'rgba(103,232,249,0.12)', icon: '💎' },
  { key: 'platinum', name: 'Platinum', min: 1025, color: '#e2e8f0', bg: 'rgba(226,232,240,0.10)', icon: '🔹' },
  { key: 'gold',     name: 'Gold',     min: 960,  color: '#fbbf24', bg: 'rgba(251,191,36,0.12)',  icon: '🥇' },
  { key: 'silver',   name: 'Silver',   min: 900,  color: '#94a3b8', bg: 'rgba(148,163,184,0.10)', icon: '🥈' },
  { key: 'bronze',   name: 'Bronze',   min: 825,  color: '#cd7f32', bg: 'rgba(205,127,50,0.10)',  icon: '🥉' },
  { key: 'copper',   name: 'Copper',   min: 0,    color: '#b45309', bg: 'rgba(180,83,9,0.10)',    icon: '🪙' },
] as const;

export function getSeasonRank(elo: number) {
  return SEASON_RANKS.find((r) => elo >= r.min) ?? SEASON_RANKS[SEASON_RANKS.length - 1];
}
export const SAT_PLACEMENT_BONUS: Record<string, number> = {
  winner: 25,
  runnerUp: 15,
  finalist: 12,
  semi: 8,
  round2: 5,
};

function expectedScore(pE: number, oE: number): number {
  return 1 / (1 + Math.pow(10, (oE - pE) / 400));
}

function getLobbyMult(avgOppRank: number): number {
  for (const tier of LOBBY_RANK_TIERS) {
    if (avgOppRank <= tier.maxRank) return tier.mult;
  }
  return 0.8;
}

function eloChange(pE: number, oE: number, pts: number, avgOppRank?: number): number {
  const norm = pts / MAX_PTS;
  const exp = expectedScore(pE, oE);
  const diff = oE - pE;
  let k =
    K_BASE +
    (diff > 0 ? Math.min(diff / 20, 20) : Math.min(Math.abs(diff) / 30, 10));
  let ch = k * (norm - exp);
  // Soft floor: dampen losses when player is below SOFT_FLOOR (800), ramping up to 60% reduction at 600
  if (ch < 0 && pE < SOFT_FLOOR) {
    const damp = Math.min((SOFT_FLOOR - pE) / SOFT_FLOOR_DAMP_RANGE, 1) * SOFT_FLOOR_DAMP_MAX;
    ch *= (1 - damp);
  }
  // Lobby quality multiplier — only applies to gains
  if (ch > 0 && avgOppRank !== undefined) {
    ch *= getLobbyMult(avgOppRank);
  }
  ch = Math.max(ch, -30);
  return Math.min(Math.round(ch * 10) / 10, 60);
}

export function computeAllElos(
  players: Player[],
  acts: Act[],
  _sats: Sat[] | null | undefined,
  seasons?: Season[]
): { elos: Record<string, number>; hist: Record<string, EloHistoryEntry[]> } {
  // Build a sorted list of seasons (oldest first) for decay weighting.
  // The most recent season = weight 1.0, each season further back loses SEASON_DECAY_PER,
  // floored at SEASON_DECAY_MIN. ACTs outside any season use weight 1.0 (same as current).
  const sortedSeasons = seasons
    ? [...seasons].sort((a, b) => a.startDate.localeCompare(b.startDate))
    : [];
  const totalSeasons = sortedSeasons.length;

  const getDecayWeight = (actDate: string): number => {
    if (sortedSeasons.length === 0) return 1.0;
    // Find which season index this act belongs to (0 = oldest)
    const si = sortedSeasons.findIndex(
      (s) => actDate >= s.startDate && actDate <= s.endDate
    );
    if (si === -1) return 1.0; // outside any season → full weight
    const seasonsBack = totalSeasons - 1 - si; // 0 = most recent
    return Math.max(SEASON_DECAY_MIN, 1.0 - seasonsBack * SEASON_DECAY_PER);
  };

  // Also need global rank order for top-seed protection.
  // We compute ranks on the fly from current elos at the time of each ACT.
  const getGlobalRank = (name: string, currentElos: Record<string, number>): number => {
    const allElos = Object.values(currentElos);
    const myElo = currentElos[name] ?? BASE_ELO;
    return allElos.filter((e) => e > myElo).length + 1;
  };

  const elos: Record<string, number> = {};
  const hist: Record<string, EloHistoryEntry[]> = {};
  const actCounts: Record<string, number> = {};

  players.forEach((p) => {
    elos[p.name] = BASE_ELO;
    hist[p.name] = [];
    actCounts[p.name] = 0;
  });

  [...acts]
    .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime())
    .forEach((act) => {
      const subMap: Record<string, string> = {};
      act.teams.forEach((t) => {
        if (t.subs) {
          t.members.forEach((m, i) => {
            if (t.subs?.[i]) subMap[m] = t.subs[i];
          });
        }
      });

      const remapName = (n: string) => subMap[n] ?? n;
      const teamMembers = act.teams.flatMap((t) => t.members);
      const effectivePlayers = new Set<string>();
      teamMembers.forEach((m) => effectivePlayers.add(remapName(m)));
      act.races.forEach((r) =>
        r.results.forEach((res) => {
          if (res.player) effectivePlayers.add(remapName(res.player));
        })
      );

      const ap = [...effectivePlayers];
      const pp: Record<string, number> = {};
      ap.forEach((p) => {
        pp[p] = 0;
      });
      act.races.forEach((r) =>
        r.results.forEach((res) => {
          const pn = remapName(res.player);
          if (pn in pp) pp[pn] += res.points;
        })
      );

      const multi = act.satId ? SAT_MULTI : 1;

      const soloPlayers = new Set<string>();
      act.teams.forEach((t) => {
        const rm = t.members.map((m) => remapName(m));
        if (rm.length >= 2 && rm[0] === rm[1]) soloPlayers.add(rm[0]);
        if (
          rm.length >= 3 &&
          (rm[0] === rm[1] || rm[0] === rm[2] || rm[1] === rm[2])
        ) {
          rm.forEach((m) => {
            if (rm.filter((x) => x === m).length > 1) soloPlayers.add(m);
          });
        }
      });

      // Map each non-solo player to their slot (0 = top bracket, 1 = bottom bracket)
      const posMap: Record<string, 0 | 1> = {};
      act.teams.forEach((t) => {
        const rm = t.members.map((m) => remapName(m));
        if (rm.length >= 2 && rm[0] !== rm[1]) {
          posMap[rm[0]] = 0;
          posMap[rm[1]] = 1;
        }
      });

      // Classify each race as top (0) or bottom (1) bracket based on non-solo participants
      const racePos: (0 | 1 | null)[] = act.races.map((r) => {
        const nonSolo = r.results
          .map((res) => remapName(res.player))
          .filter((p) => !soloPlayers.has(p) && p in posMap);
        if (nonSolo.length === 0) return null;
        const c0 = nonSolo.filter((p) => posMap[p] === 0).length;
        const c1 = nonSolo.filter((p) => posMap[p] === 1).length;
        return c0 >= c1 ? 0 : 1;
      });

      // Phase 1: compute raw ELO changes with lobby-quality multiplier on gains
      const rawCh: Record<string, number> = {};
      ap.forEach((name) => {
        if (!(name in elos)) { elos[name] = BASE_ELO; actCounts[name] = 0; }
        let ch: number;
        if (soloPlayers.has(name)) {
          const pos0Opps = Object.entries(posMap).filter(([, v]) => v === 0).map(([k]) => k);
          const pos1Opps = Object.entries(posMap).filter(([, v]) => v === 1).map(([k]) => k);
          let pts0 = 0, pts1 = 0;
          act.races.forEach((r, i) => {
            const res = r.results.find((res) => remapName(res.player) === name);
            if (!res) return;
            if (racePos[i] === 0) pts0 += res.points;
            else if (racePos[i] === 1) pts1 += res.points;
          });
          const oAvg0 = pos0Opps.length > 0
            ? pos0Opps.reduce((s, o) => s + (elos[o] ?? BASE_ELO), 0) / pos0Opps.length : BASE_ELO;
          const oAvg1 = pos1Opps.length > 0
            ? pos1Opps.reduce((s, o) => s + (elos[o] ?? BASE_ELO), 0) / pos1Opps.length : BASE_ELO;
          // Avg rank of opponents across both brackets
          const allOpps = [...pos0Opps, ...pos1Opps].filter(o => o !== name);
          const avgOppRank = allOpps.length > 0
            ? allOpps.reduce((s, o) => s + getGlobalRank(o, elos), 0) / allOpps.length : 20;
          ch = ((eloChange(elos[name], oAvg0, pts0, avgOppRank) + eloChange(elos[name], oAvg1, pts1, avgOppRank)) / 2) * multi;
        } else {
          const mySlot = posMap[name];
          // Bracket opponents: same slot on other teams
          const bracketOpps = mySlot !== undefined
            ? ap.filter(p => p !== name && posMap[p] === mySlot)
            : ap.filter(p => p !== name);
          const oAvg = bracketOpps.length > 0
            ? bracketOpps.reduce((s, o) => s + (elos[o] ?? BASE_ELO), 0) / bracketOpps.length
            : BASE_ELO;
          const avgOppRank = bracketOpps.length > 0
            ? bracketOpps.reduce((s, o) => s + getGlobalRank(o, elos), 0) / bracketOpps.length
            : 20;
          ch = eloChange(elos[name], oAvg, pp[name] ?? 0, avgOppRank) * multi;
        }
        rawCh[name] = ch;
      });

      // Phase 2: bracket-rank protection
      const decayW = getDecayWeight(act.date);
      for (const slot of [0, 1] as const) {
        const bracketPlayers = ap.filter((n) => posMap[n] === slot);
        if (bracketPlayers.length === 0) continue;
        const avgRank = bracketPlayers.reduce((s, n) => s + getGlobalRank(n, elos), 0) / bracketPlayers.length;
        if (avgRank > COMP_ACT_AVG_RANK) continue;
        bracketPlayers.forEach((name) => {
          if ((pp[name] ?? 0) >= COMP_TOP_SEED_PTS_MIN && rawCh[name] < 0) {
            const savedLoss = -rawCh[name];
            rawCh[name] = 0;
            const peers = bracketPlayers.filter((n) => n !== name);
            if (peers.length > 0) {
              const extra = savedLoss / peers.length;
              peers.forEach((n) => { rawCh[n] += extra; });
            }
          }
        });
      }

      // Phase 3: placement multiplier + season decay + commit
      ap.forEach((name) => {
        let ch = rawCh[name] * decayW;
        // 2× K during first PLACEMENT_ACTS overall ACTs
        if ((actCounts[name] ?? 0) < PLACEMENT_ACTS) ch *= 2;
        elos[name] = (elos[name] ?? BASE_ELO) + ch;
        actCounts[name] = (actCounts[name] ?? 0) + 1;
        if (!hist[name]) hist[name] = [];
        hist[name].push({
          actId: act.id ?? act._id ?? '',
          actName: act.name,
          date: act.date,
          elo: Math.round(elos[name]),
          change: ch,
          points: pp[name] ?? 0,
          isSat: !!act.satId,
        });
      });
    });
    // SAT placement bonus removed — not applied retroactively or going forward

  return { elos, hist };
}

export function computeSeasonElos(
  players: Player[],
  acts: Act[],
  season: Season
): {
  seasonElos: Record<string, number>;
  seasonHistory: Record<string, EloHistoryEntry[]>;
  actCount: number;
} {
  const sActs = acts
    .filter((a) => {
      const d = new Date(a.date);
      return (
        d >= new Date(season.startDate) && d <= new Date(season.endDate)
      );
    })
    .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

  const { elos: atE } = computeAllElos(players, acts, []);
  const sE: Record<string, number> = {};
  const sH: Record<string, EloHistoryEntry[]> = {};

  players.forEach((p) => {
    sE[p.name] = SEASON_BASE_ELO; // flat start — no carryover; MMR influences gain/loss rates instead
    sH[p.name] = [];
  });
  const sActCounts: Record<string, number> = {}; // per-player ACT count within this season

  sActs.forEach((act) => {
    const subMap: Record<string, string> = {};
    act.teams.forEach((t) => {
      if (t.subs) {
        t.members.forEach((m, i) => {
          if (t.subs?.[i]) subMap[m] = t.subs[i];
        });
      }
    });
    const remapName = (n: string) => subMap[n] ?? n;

    const ap = [...new Set(act.teams.flatMap((t) => t.members).map(remapName))];
    const pp: Record<string, number> = {};
    ap.forEach((p) => { pp[p] = 0; });
    act.races.forEach((r) =>
      r.results.forEach((res) => {
        const pn = remapName(res.player);
        if (pn in pp) pp[pn] += res.points;
      })
    );
    const multi = act.satId ? SAT_MULTI : 1;

    const soloPlayers = new Set<string>();
    act.teams.forEach((t) => {
      const rm = t.members.map((m) => remapName(m));
      if (rm.length >= 2 && rm[0] === rm[1]) soloPlayers.add(rm[0]);
    });

    const posMap: Record<string, 0 | 1> = {};
    act.teams.forEach((t) => {
      const rm = t.members.map((m) => remapName(m));
      if (rm.length >= 2 && rm[0] !== rm[1]) {
        posMap[rm[0]] = 0;
        posMap[rm[1]] = 1;
      }
    });

    const racePos: (0 | 1 | null)[] = act.races.map((r) => {
      const nonSolo = r.results
        .map((res) => remapName(res.player))
        .filter((p) => !soloPlayers.has(p) && p in posMap);
      if (nonSolo.length === 0) return null;
      const c0 = nonSolo.filter((p) => posMap[p] === 0).length;
      const c1 = nonSolo.filter((p) => posMap[p] === 1).length;
      return c0 >= c1 ? 0 : 1;
    });

    // Helper: blend an opponent's MMR and season ELO for competition level
    const blendOpp = (o: string) =>
      (atE[o] ?? BASE_ELO) * SEASON_COMP_MMR_WEIGHT +
      (sE[o] ?? SEASON_BASE_ELO) * (1 - SEASON_COMP_MMR_WEIGHT);

    // Phase 1: compute raw season changes
    const sRawCh: Record<string, number> = {};
    ap.forEach((name) => {
      if (!(name in sE)) sE[name] = SEASON_BASE_ELO;
      let ch: number;
      if (soloPlayers.has(name)) {
        const pos0Opps = Object.entries(posMap).filter(([, v]) => v === 0).map(([k]) => k);
        const pos1Opps = Object.entries(posMap).filter(([, v]) => v === 1).map(([k]) => k);
        let pts0 = 0, pts1 = 0;
        act.races.forEach((r, i) => {
          const res = r.results.find((res) => remapName(res.player) === name);
          if (!res) return;
          if (racePos[i] === 0) pts0 += res.points;
          else if (racePos[i] === 1) pts1 += res.points;
        });
        // Blend MMR + season ELO for opponent strength
        const oAvg0 = pos0Opps.length > 0
          ? pos0Opps.reduce((s, o) => s + blendOpp(o), 0) / pos0Opps.length
          : BASE_ELO;
        const oAvg1 = pos1Opps.length > 0
          ? pos1Opps.reduce((s, o) => s + blendOpp(o), 0) / pos1Opps.length
          : BASE_ELO;
        ch = ((eloChange(sE[name], oAvg0, pts0) + eloChange(sE[name], oAvg1, pts1)) / 2) * multi;
      } else {
        // Position-based opponents: compare against same-slot players from other teams only
        const playerTeam = act.teams.find((t) => t.members.map(remapName).includes(name));
        const playerPos = playerTeam ? playerTeam.members.map(remapName).indexOf(name) : -1;
        const posOpps = playerPos >= 0
          ? act.teams
              .filter((t) => t !== playerTeam)
              .map((t) => remapName(t.members[playerPos]))
              .filter((n) => n && n !== name)
          : ap.filter((p) => p !== name); // fallback: all opponents
        const oAvg = posOpps.length > 0
          ? posOpps.reduce((s, o) => s + blendOpp(o), 0) / posOpps.length
          : BASE_ELO;
        ch = eloChange(sE[name], oAvg, pp[name] ?? 0) * multi;
      }
      ch *= SEASON_K_MULTI;
      const mmr = atE[name] ?? BASE_ELO;
      const mmrDiff = mmr - sE[name];
      const gainFactor = Math.max(MMR_GAIN_MIN, Math.min(MMR_GAIN_MAX, 1 + mmrDiff / MMR_SCALE));
      const lossFactor = Math.max(MMR_LOSS_MIN, Math.min(MMR_LOSS_MAX, 1 - mmrDiff / MMR_SCALE));
      if (ch > 0) ch *= gainFactor;
      else if (ch < 0) ch *= lossFactor;
      sRawCh[name] = ch;
    });

    // Phase 2: bracket-rank protection (same rule as overall ELO)
    // For each bracket (slot 0/1), if avg global rank ≤ COMP_ACT_AVG_RANK,
    // any player scoring 14+ has their loss zeroed and redistributed to bracket peers.
    for (const slot of [0, 1] as const) {
      const bracketPlayers = ap.filter((n) => posMap[n] === slot);
      if (bracketPlayers.length === 0) continue;
      const avgRank = bracketPlayers.reduce((s, n) => {
        const myElo = atE[n] ?? BASE_ELO;
        const rank = Object.values(atE).filter((e) => e > myElo).length + 1;
        return s + rank;
      }, 0) / bracketPlayers.length;
      if (avgRank > COMP_ACT_AVG_RANK) continue;
      bracketPlayers.forEach((name) => {
        if ((pp[name] ?? 0) >= COMP_TOP_SEED_PTS_MIN && sRawCh[name] < 0) {
          const savedLoss = -sRawCh[name];
          sRawCh[name] = 0;
          const peers = bracketPlayers.filter((n) => n !== name);
          if (peers.length > 0) {
            const extra = savedLoss / peers.length;
            peers.forEach((n) => { sRawCh[n] += extra; });
          }
        }
      });
    }

    // Phase 3: apply placement boost, dampen late-season, and commit
    ap.forEach((name) => {
      let ch = sRawCh[name];
      // 2× K-factor for first SEASON_PLACEMENT_ACTS ACTs in this season
      if ((sActCounts[name] ?? 0) < SEASON_PLACEMENT_ACTS) ch *= 2;
      // Dampen changes after SEASON_DAMP_AFTER ACTs — rating stabilises late in the season
      else if ((sActCounts[name] ?? 0) >= SEASON_DAMP_AFTER) ch *= SEASON_DAMP_FACTOR;
      sE[name] += ch;
      sActCounts[name] = (sActCounts[name] ?? 0) + 1;
      if (!sH[name]) sH[name] = [];
      sH[name].push({
        actId: act.id ?? act._id ?? '',
        actName: act.name,
        date: act.date,
        elo: Math.round(sE[name]),
        change: ch,
        points: pp[name] ?? 0,
      });
    });
  });

  return { seasonElos: sE, seasonHistory: sH, actCount: sActs.length };
}

export function computeStats(
  players: Player[],
  acts: Act[],
  sats: Sat[] | null | undefined,
  seasons?: Season[]
): PlayerStats[] {
  const { elos, hist } = computeAllElos(players, acts, sats ?? [], seasons);

  return players.map((p) => {
    let tR = 0;
    let tP = 0;
    let aC = 0;
    let jW = 0;
    let jC = 0;
    let w = 0;

    acts.forEach((act) => {
      const inTeam = act.teams.find(
        (t) =>
          t.members.includes(p.name) || (t.subs ?? []).includes(p.name)
      );
      const sMap2: Record<string, string> = {};
      act.teams.forEach((t) => {
        if (t.subs)
          t.members.forEach((m, i) => {
            if (t.subs?.[i]) sMap2[m] = t.subs[i];
          });
      });
      const inRaces = act.races.some((r) =>
        r.results.some(
          (res) =>
            res.player === p.name ||
            (sMap2[res.player] ?? res.player) === p.name
        )
      );
      if (!inTeam && !inRaces) return;
      aC++;

      const sMap: Record<string, string> = {};
      act.teams.forEach((t) => {
        if (t.subs)
          t.members.forEach((m, i) => {
            if (t.subs?.[i]) sMap[m] = t.subs[i];
          });
      });

      act.races.forEach((r) => {
        const e = r.results.find(
          (x) =>
            (sMap[x.player] ?? x.player) === p.name || x.player === p.name
        );
        if (e) {
          tR++;
          tP += e.points;
        }
      });

      let pen = act.penalties;
      if (!pen && act.penaltiesJson) {
        try {
          pen = JSON.parse(act.penaltiesJson) as Act['penalties'];
        } catch {
          // ignore
        }
      }

      const ts = act.teams
        .map((t, ti) => {
          let s = 0;
          act.races.forEach((r) =>
            r.results.forEach((x) => {
              if (t.members.includes(x.player)) s += x.points;
            })
          );
          if (pen) {
            pen.forEach((round) => {
              const v = round[ti];
              if (Array.isArray(v)) {
                s += v.reduce((s2, x) => s2 + x * -2, 0);
              } else {
                s += (v ?? 0) * -2;
              }
            });
          }
          return { team: t, score: s };
        })
        .sort((a, b) => b.score - a.score);

      const t2 = ts.slice(0, 2);
      const playerTeam = act.teams.find(
        (t) =>
          t.members.includes(p.name) || (t.subs ?? []).includes(p.name)
      );
      if (
        playerTeam &&
        t2.find((x) => x.team.name === playerTeam.name)
      ) {
        jC++;
        if (t2[0].team.name === playerTeam.name) {
          jW++;
          w++;
        }
      }
    });

    const eloH = hist[p.name] ?? [];
    let change30d = 0;
    if (eloH.length > 0) {
      const now = new Date();
      const d30 = new Date(now.getTime() - 30 * 86400000);
      const recent = eloH.filter((h) => new Date(h.date) >= d30);
      change30d = recent.reduce((s, h) => s + h.change, 0);
    }

    return {
      ...p,
      elo: Math.round(elos[p.name] ?? BASE_ELO),
      eloHistory: eloH,
      totalRaces: tR,
      totalPoints: tP,
      pts: tP,
      raceCount: tR,
      actCount: aC,
      avgPtsAct: aC > 0 ? tP / aC : 0,
      avgPtsRace: tR > 0 ? tP / tR : 0,
      winRate: aC > 0 ? w / aC : 0,
      jsPct: jC > 0 ? jW / jC : 0,
      jsW: jC,
      jsC: jC,
      jerseySwaps: jC,
      wins: w,
      change30d: Math.round(change30d),
    };
  });
}

export interface BracketBreakdown {
  pts0: number;
  pts1: number;
  ch0: number;
  ch1: number;
}

export function computeActBracketBreakdown(
  act: Act,
  elosBefore: Record<string, number>
): Record<string, BracketBreakdown> {
  const result: Record<string, BracketBreakdown> = {};

  const subMap: Record<string, string> = {};
  act.teams.forEach((t) => {
    if (t.subs) {
      t.members.forEach((m, i) => {
        if (t.subs?.[i]) subMap[m] = t.subs[i];
      });
    }
  });
  const remapName = (n: string) => subMap[n] ?? n;

  const soloPlayers = new Set<string>();
  act.teams.forEach((t) => {
    const rm = t.members.map((m) => remapName(m));
    if (rm.length >= 2 && rm[0] === rm[1]) soloPlayers.add(rm[0]);
  });

  if (soloPlayers.size === 0) return result;

  const posMap: Record<string, 0 | 1> = {};
  act.teams.forEach((t) => {
    const rm = t.members.map((m) => remapName(m));
    if (rm.length >= 2 && rm[0] !== rm[1]) {
      posMap[rm[0]] = 0;
      posMap[rm[1]] = 1;
    }
  });

  const racePos: (0 | 1 | null)[] = act.races.map((r) => {
    const nonSolo = r.results
      .map((res) => remapName(res.player))
      .filter((p) => !soloPlayers.has(p) && p in posMap);
    if (nonSolo.length === 0) return null;
    const c0 = nonSolo.filter((p) => posMap[p] === 0).length;
    const c1 = nonSolo.filter((p) => posMap[p] === 1).length;
    return c0 >= c1 ? 0 : 1;
  });

  const multi = act.satId ? SAT_MULTI : 1;

  soloPlayers.forEach((name) => {
    const pos0Opps = Object.entries(posMap).filter(([, v]) => v === 0).map(([k]) => k);
    const pos1Opps = Object.entries(posMap).filter(([, v]) => v === 1).map(([k]) => k);
    let pts0 = 0, pts1 = 0;
    act.races.forEach((r, i) => {
      const res = r.results.find((res) => remapName(res.player) === name);
      if (!res) return;
      if (racePos[i] === 0) pts0 += res.points;
      else if (racePos[i] === 1) pts1 += res.points;
    });
    const oAvg0 = pos0Opps.length > 0
      ? pos0Opps.reduce((s, o) => s + (elosBefore[o] ?? BASE_ELO), 0) / pos0Opps.length
      : BASE_ELO;
    const oAvg1 = pos1Opps.length > 0
      ? pos1Opps.reduce((s, o) => s + (elosBefore[o] ?? BASE_ELO), 0) / pos1Opps.length
      : BASE_ELO;
    const ch0 = (eloChange(elosBefore[name] ?? BASE_ELO, oAvg0, pts0) / 2) * multi;
    const ch1 = (eloChange(elosBefore[name] ?? BASE_ELO, oAvg1, pts1) / 2) * multi;
    result[name] = { pts0, pts1, ch0, ch1 };
  });

  return result;
}

export interface TeamScore {
  team: Act['teams'][0];
  score: number;
}

export function teamScores(act: Act): TeamScore[] {
  let pen = act.penalties;
  if (!pen && act.penaltiesJson) {
    try {
      pen = JSON.parse(act.penaltiesJson) as Act['penalties'];
    } catch {
      // ignore
    }
  }

  const scored: TeamScore[] = act.teams.map((t, ti) => {
    let s = 0;
    act.races.forEach((r) =>
      r.results.forEach((x) => {
        if (
          t.members.includes(x.player) ||
          (t.subs ?? []).includes(x.player)
        )
          s += x.points;
      })
    );
    if (pen) {
      pen.forEach((round) => {
        const v = round[ti];
        if (Array.isArray(v)) {
          s += v.reduce((s2, x) => s2 + x * -2, 0);
        } else {
          s += (v ?? 0) * -2;
        }
      });
    }
    return { team: t, score: s };
  });

  scored.sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    if (act.tiebreaker) {
      if (a.team.name === act.tiebreaker) return -1;
      if (b.team.name === act.tiebreaker) return 1;
    }
    if (act.jerseyTiebreaker) {
      if (a.team.name === act.jerseyTiebreaker) return -1;
      if (b.team.name === act.jerseyTiebreaker) return 1;
    }
    return 0;
  });

  return scored;
}
