import type { Act, Player, Sat, Season, PlayerStats, EloHistoryEntry } from '../types';

export const BASE_ELO = 1000;
export const MAX_PTS = 24;
export const K_BASE = 40;
export const LOSS_DAMP = 0.55;
export const CARRY = 0.3;
export const SAT_MULTI = 1.25;
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

function eloChange(pE: number, oE: number, pts: number): number {
  const norm = pts / MAX_PTS;
  const exp = expectedScore(pE, oE);
  const diff = oE - pE;
  let k =
    K_BASE +
    (diff > 0 ? Math.min(diff / 20, 20) : Math.min(Math.abs(diff) / 30, 10));
  let ch = k * (norm - exp);
  if (ch < 0) {
    ch *= LOSS_DAMP;
    ch = Math.max(ch, -25);
  }
  return Math.min(Math.round(ch * 10) / 10, 45);
}

export function computeAllElos(
  players: Player[],
  acts: Act[],
  sats: Sat[] | null | undefined
): { elos: Record<string, number>; hist: Record<string, EloHistoryEntry[]> } {
  const elos: Record<string, number> = {};
  const hist: Record<string, EloHistoryEntry[]> = {};

  players.forEach((p) => {
    elos[p.name] = BASE_ELO;
    hist[p.name] = [];
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

      ap.forEach((name) => {
        if (!(name in elos)) elos[name] = BASE_ELO;
        let ch: number;
        if (soloPlayers.has(name)) {
          // Calculate ELO separately for each bracket then sum
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
            ? pos0Opps.reduce((s, o) => s + (elos[o] ?? BASE_ELO), 0) / pos0Opps.length
            : BASE_ELO;
          const oAvg1 = pos1Opps.length > 0
            ? pos1Opps.reduce((s, o) => s + (elos[o] ?? BASE_ELO), 0) / pos1Opps.length
            : BASE_ELO;
          ch = ((eloChange(elos[name], oAvg0, pts0) + eloChange(elos[name], oAvg1, pts1)) / 4) * multi;
        } else {
          const opp = ap.filter((p) => p !== name);
          const oAvg =
            opp.length > 0
              ? opp.reduce((s, o) => s + (elos[o] ?? BASE_ELO), 0) / opp.length
              : BASE_ELO;
          ch = eloChange(elos[name], oAvg, pp[name] ?? 0) * multi;
        }
        elos[name] += ch;
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

  if (sats) {
    sats.forEach((sat) => {
      if (!sat.placements) return;
      Object.entries(sat.placements).forEach(([pl, teams]) => {
        const b = SAT_PLACEMENT_BONUS[pl] ?? 0;
        if (!b) return;
        (teams ?? []).forEach((tm) => {
          [
            ...(tm.members ?? []),
            ...(tm.subs ?? []).filter(Boolean),
          ].forEach((name) => {
            if (!(name in elos)) elos[name] = BASE_ELO;
            elos[name] += b;
            if (!hist[name]) hist[name] = [];
            hist[name].push({
              actId: sat.id ?? sat._id ?? '',
              actName: sat.name + ' (' + pl + ')',
              date: sat.date ?? '',
              elo: Math.round(elos[name]),
              change: b,
              points: 0,
              isSat: true,
            });
          });
        });
      });
    });
  }

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
    sE[p.name] = Math.round(
      BASE_ELO * (1 - CARRY) + (atE[p.name] ?? BASE_ELO) * CARRY
    );
    sH[p.name] = [];
  });

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

    ap.forEach((name) => {
      if (!(name in sE))
        sE[name] = Math.round(
          BASE_ELO * (1 - CARRY) + (atE[name] ?? BASE_ELO) * CARRY
        );
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
          ? pos0Opps.reduce((s, o) => s + (sE[o] ?? BASE_ELO), 0) / pos0Opps.length
          : BASE_ELO;
        const oAvg1 = pos1Opps.length > 0
          ? pos1Opps.reduce((s, o) => s + (sE[o] ?? BASE_ELO), 0) / pos1Opps.length
          : BASE_ELO;
        ch = ((eloChange(sE[name], oAvg0, pts0) + eloChange(sE[name], oAvg1, pts1)) / 4) * multi;
      } else {
        const opp = ap.filter((p) => p !== name);
        const oAvg =
          opp.length > 0
            ? opp.reduce((s, o) => s + (sE[o] ?? BASE_ELO), 0) / opp.length
            : BASE_ELO;
        ch = eloChange(sE[name], oAvg, pp[name] ?? 0) * multi;
      }
      sE[name] += ch;
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
  sats: Sat[] | null | undefined
): PlayerStats[] {
  const { elos, hist } = computeAllElos(players, acts, sats ?? []);

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
    const ch0 = (eloChange(elosBefore[name] ?? BASE_ELO, oAvg0, pts0) / 4) * multi;
    const ch1 = (eloChange(elosBefore[name] ?? BASE_ELO, oAvg1, pts1) / 4) * multi;
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
