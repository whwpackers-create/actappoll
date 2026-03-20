export interface Player {
  name: string;
  id?: string;
  active?: boolean;
  retiredDate?: string | null;
  _id?: string;
}

export interface RaceResult {
  player: string;
  points: number;
}

export interface Race {
  raceNum?: number;
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
  type?: '12man' | '8man';
  teams: Team[];
  races: Race[];
  satId?: string;
  satRound?: number;
  tiebreaker?: string | null;
  jerseyTiebreaker?: string | null;
  penalties?: (number[] | number)[][];
  penaltiesJson?: string;
  grid?: unknown[][][];
  gridJson?: string;
  playerMap?: number[][][];
  playerMapJson?: string;
  raceOrder?: string;
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
  subs?: string[];
  seed?: number | null;
}

export interface SatHeatScore {
  name?: string;
  score?: number;
  seed?: number | null;
}

export interface SatHeat {
  actId?: string;
  round?: number;
  advanceCount?: number;
  teams?: SatHeatTeam[];
  advanced?: SatHeatTeam[];
  scores?: SatHeatScore[];
}

export interface SatRosterTeam {
  name: string;
  members: string[];
  subs?: string[];
  seed?: number | null;
}

export interface Sat extends Act {
  roster?: SatRosterTeam[];
  seeds?: Record<string, number>;
  rounds?: number;
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

export interface AppOps {
  addAct: (act: Act) => Promise<void>;
  deleteAct: (id: string) => Promise<void>;
  addPlayer: (p: AppData['players'][0]) => Promise<void>;
  removePlayer: (_: unknown, name: string) => Promise<void>;
  updatePlayer: (name: string, updates: Partial<AppData['players'][0]>) => Promise<void>;
  fixTeamNames: () => Promise<number>;
  renamePlayer: (oldName: string, newName: string) => Promise<void>;
  addSeason: (s: AppData['seasons'][0]) => Promise<void>;
  deleteSeason: (id: string) => Promise<void>;
  updateSeason: (id: string, updates: Partial<AppData['seasons'][0]>) => Promise<void>;
  addSat: (s: AppData['sats'][0]) => Promise<void>;
  updateSat: (id: string, updates: Partial<AppData['sats'][0]>) => Promise<void>;
  deleteSat: (id: string) => Promise<void>;
  updateAct: (id: string, updates: Partial<Act>) => Promise<void>;
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
