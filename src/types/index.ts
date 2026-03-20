export interface Player {
  name: string;
  id?: string;
  active?: boolean;
  retiredDate?: string;
  _id?: string;
}

export interface RaceResult {
  player: string;
  points: number;
}

export interface Race {
  results: RaceResult[];
}

export interface Team {
  name: string;
  members: string[];
  subs?: string[];
}

export interface Act {
  id?: string;
  _id?: string;
  name: string;
  date: string;
  teams: Team[];
  races: Race[];
  satId?: string;
  satRound?: number;
  tiebreaker?: string;
  jerseyTiebreaker?: string;
  penalties?: (number[] | number)[][];
  penaltiesJson?: string;
  grid?: unknown[][][];
  gridJson?: string;
}

export interface Season {
  id?: string;
  _id?: string;
  name: string;
  startDate: string;
  endDate: string;
  sortOrder?: number;
  isPreset?: boolean;
}

export interface PlacementTeam {
  members?: string[];
  subs?: string[];
}

export interface SatHeatTeam {
  members?: string[];
  name?: string;
}

export interface SatHeatScore {
  name?: string;
}

export interface SatHeat {
  actId?: string;
  teams?: SatHeatTeam[];
  advanced?: SatHeatTeam[];
  scores?: SatHeatScore[];
}

export interface Sat extends Act {
  placements?: Record<string, PlacementTeam[]>;
  heats?: SatHeat[];
}

export interface AppData {
  acts: Act[];
  players: Player[];
  seasons: Season[];
  sats: Sat[];
}

export interface EloHistoryEntry {
  actId: string;
  actName: string;
  date: string;
  elo: number;
  change: number;
  points: number;
  isSat?: boolean;
}

export interface PlayerStats extends Player {
  elo: number;
  eloHistory: EloHistoryEntry[];
  totalRaces: number;
  totalPoints: number;
  pts: number;
  raceCount: number;
  actCount: number;
  avgPtsAct: number;
  avgPtsRace: number;
  winRate: number;
  jsPct: number;
  jsW: number;
  jsC: number;
  jerseySwaps: number;
  wins: number;
  change30d: number;
}
