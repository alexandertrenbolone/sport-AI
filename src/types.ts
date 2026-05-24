export interface MatchResult {
  date: string;       // YYYY-MM-DD
  opponent: string;
  score: string;      // "2-1"
  result: 'W' | 'D' | 'L';
  isHome: boolean;
}

export interface TeamForm {
  teamId: string;
  teamName: string;
  last5: MatchResult[];
}

export interface H2HMatch {
  date: string;
  homeTeam: string;
  awayTeam: string;
  score: string;
  winner: string; // team name or "Draw"
}

export interface MatchData {
  matchId: string;
  date: string;           // ISO date string, exact from API
  time: string;           // HH:MM UTC
  homeTeam: string;
  homeTeamId: string;
  awayTeam: string;
  awayTeamId: string;
  league: string;
  leagueId: string;
  venue: string;
  country: string;
  homeForm: TeamForm;
  awayForm: TeamForm;
  h2h: H2HMatch[];
  fetchedAt: string;      // ISO timestamp of when data was fetched
}

export interface ValidationReport {
  ok: boolean;
  flags: string[];        // warnings and errors
  errors: string[];       // blocking errors
}

export interface ContentPackage {
  matchData: MatchData;
  preview: string;
  forecast: string;
  seoTitle: string;
  seoDescription: string;
  telegram: string;
  sources: string[];
  validationReport: ValidationReport;
}
