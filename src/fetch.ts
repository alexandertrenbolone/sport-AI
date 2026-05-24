import axios from 'axios';
import { MatchData, MatchResult, TeamForm, H2HMatch } from './types';

const SPORTSDB_KEY = process.env.SPORTSDB_API_KEY ?? '3';
const BASE_URL = `https://www.thesportsdb.com/api/v1/json/${SPORTSDB_KEY}`;

interface SportsDBEvent {
  idEvent: string;
  strEvent: string;
  dateEvent: string | null;
  strTime: string | null;
  idHomeTeam: string;
  strHomeTeam: string | null;
  idAwayTeam: string;
  strAwayTeam: string | null;
  strLeague: string | null;
  idLeague: string;
  strVenue: string | null;
  strCountry: string | null;
  intHomeScore: string | null;
  intAwayScore: string | null;
}

interface SportsDBEventsResponse {
  events: SportsDBEvent[] | null;
}

function daysAgo(n: number): string {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d.toISOString().split('T')[0];
}

function getFallbackMatch(): MatchData {
  const matchDate = new Date();
  matchDate.setDate(matchDate.getDate() + 7);
  const dateStr = matchDate.toISOString().split('T')[0];

  const homeForm: TeamForm = {
    teamId: '133604',
    teamName: 'Arsenal',
    last5: [
      { date: daysAgo(14), opponent: 'Chelsea', score: '2-0', result: 'W', isHome: true },
      { date: daysAgo(20), opponent: 'Man City', score: '1-1', result: 'D', isHome: false },
      { date: daysAgo(27), opponent: 'Tottenham', score: '3-1', result: 'W', isHome: true },
      { date: daysAgo(34), opponent: 'Newcastle', score: '0-1', result: 'L', isHome: false },
      { date: daysAgo(41), opponent: 'Everton', score: '2-0', result: 'W', isHome: true },
    ],
  };

  const awayForm: TeamForm = {
    teamId: '133602',
    teamName: 'Liverpool',
    last5: [
      { date: daysAgo(13), opponent: 'Man United', score: '3-0', result: 'W', isHome: true },
      { date: daysAgo(19), opponent: 'Brighton', score: '2-2', result: 'D', isHome: false },
      { date: daysAgo(26), opponent: 'Aston Villa', score: '1-0', result: 'W', isHome: true },
      { date: daysAgo(33), opponent: 'Wolves', score: '2-1', result: 'W', isHome: false },
      { date: daysAgo(40), opponent: 'Fulham', score: '0-0', result: 'D', isHome: true },
    ],
  };

  const h2h: H2HMatch[] = [
    { date: '2024-12-26', homeTeam: 'Liverpool', awayTeam: 'Arsenal', score: '2-1', winner: 'Liverpool' },
    { date: '2024-08-17', homeTeam: 'Arsenal', awayTeam: 'Liverpool', score: '0-0', winner: 'Draw' },
    { date: '2024-02-04', homeTeam: 'Liverpool', awayTeam: 'Arsenal', score: '1-2', winner: 'Arsenal' },
    { date: '2023-12-23', homeTeam: 'Arsenal', awayTeam: 'Liverpool', score: '1-1', winner: 'Draw' },
    { date: '2023-04-09', homeTeam: 'Liverpool', awayTeam: 'Arsenal', score: '2-2', winner: 'Draw' },
  ];

  return {
    matchId: 'fallback-arsenal-liverpool',
    date: dateStr,
    time: '16:30',
    homeTeam: 'Arsenal',
    homeTeamId: '133604',
    awayTeam: 'Liverpool',
    awayTeamId: '133602',
    league: 'English Premier League',
    leagueId: '4328',
    venue: 'Emirates Stadium',
    country: 'England',
    homeForm,
    awayForm,
    h2h,
    fetchedAt: new Date().toISOString(),
  };
}

async function getTeamForm(teamId: string, teamName: string): Promise<TeamForm> {
  try {
    const url = `${BASE_URL}/eventslast5.php?id=${teamId}`;
    const response = await axios.get<SportsDBEventsResponse>(url, { timeout: 10000 });
    const events: SportsDBEvent[] = response.data?.events ?? [];

    const last5: MatchResult[] = [];
    for (const event of events.slice(0, 5)) {
      const homeScore = parseInt(event.intHomeScore ?? '0', 10);
      const awayScore = parseInt(event.intAwayScore ?? '0', 10);
      if (isNaN(homeScore) || isNaN(awayScore)) continue;

      const isHome = event.idHomeTeam === teamId;
      const teamScore = isHome ? homeScore : awayScore;
      const opponentScore = isHome ? awayScore : homeScore;

      let result: 'W' | 'D' | 'L';
      if (teamScore > opponentScore) result = 'W';
      else if (teamScore === opponentScore) result = 'D';
      else result = 'L';

      const opponent = isHome ? (event.strAwayTeam ?? 'Unknown') : (event.strHomeTeam ?? 'Unknown');
      const score = `${teamScore}-${opponentScore}`;

      last5.push({
        date: event.dateEvent ?? '',
        opponent,
        score,
        result,
        isHome,
      });
    }

    return { teamId, teamName, last5 };
  } catch (err) {
    console.warn(`[fetch] getTeamForm failed for teamId=${teamId}:`, err instanceof Error ? err.message : String(err));
    return { teamId, teamName, last5: [] };
  }
}

async function getH2H(team1Id: string, team2Id: string): Promise<H2HMatch[]> {
  try {
    const url = `${BASE_URL}/eventsh2h.php?idHomeTeam=${team1Id}&idAwayTeam=${team2Id}`;
    const response = await axios.get<SportsDBEventsResponse>(url, { timeout: 10000 });
    const events: SportsDBEvent[] = response.data?.events ?? [];

    const results: H2HMatch[] = [];
    for (const event of events.slice(0, 5)) {
      const homeScore = parseInt(event.intHomeScore ?? '0', 10);
      const awayScore = parseInt(event.intAwayScore ?? '0', 10);
      if (isNaN(homeScore) || isNaN(awayScore)) continue;

      const score = `${homeScore}-${awayScore}`;

      let winner: string;
      if (homeScore > awayScore) winner = event.strHomeTeam ?? 'Unknown';
      else if (awayScore > homeScore) winner = event.strAwayTeam ?? 'Unknown';
      else winner = 'Draw';

      results.push({
        date: event.dateEvent ?? '',
        homeTeam: event.strHomeTeam ?? 'Unknown',
        awayTeam: event.strAwayTeam ?? 'Unknown',
        score,
        winner,
      });
    }

    return results;
  } catch (err) {
    console.warn(`[fetch] getH2H failed for ${team1Id} vs ${team2Id}:`, err instanceof Error ? err.message : String(err));
    return [];
  }
}

async function getUpcomingMatch(leagueId: string = '4328'): Promise<MatchData> {
  try {
    const url = `${BASE_URL}/eventsnextleague.php?id=${leagueId}`;
    const response = await axios.get<SportsDBEventsResponse>(url, { timeout: 10000 });
    const events: SportsDBEvent[] = response.data?.events ?? [];

    if (events.length === 0) {
      console.warn('[fetch] No upcoming events returned from API, using fallback.');
      return getFallbackMatch();
    }

    const event = events[0];

    if (!event.idHomeTeam || !event.idAwayTeam) {
      console.warn('[fetch] Event missing team IDs, using fallback.');
      return getFallbackMatch();
    }

    const [homeForm, awayForm, h2h] = await Promise.all([
      getTeamForm(event.idHomeTeam, event.strHomeTeam ?? 'Unknown'),
      getTeamForm(event.idAwayTeam, event.strAwayTeam ?? 'Unknown'),
      getH2H(event.idHomeTeam, event.idAwayTeam),
    ]);

    return {
      matchId: event.idEvent,
      date: event.dateEvent ?? '',
      time: event.strTime ?? '00:00',
      homeTeam: event.strHomeTeam ?? 'Unknown',
      homeTeamId: event.idHomeTeam,
      awayTeam: event.strAwayTeam ?? 'Unknown',
      awayTeamId: event.idAwayTeam,
      league: event.strLeague ?? 'Unknown League',
      leagueId: event.idLeague,
      venue: event.strVenue ?? 'Unknown Venue',
      country: event.strCountry ?? 'England',
      homeForm,
      awayForm,
      h2h,
      fetchedAt: new Date().toISOString(),
    };
  } catch (err) {
    console.warn('[fetch] getUpcomingMatch failed, using fallback:', err instanceof Error ? err.message : String(err));
    return getFallbackMatch();
  }
}

export { getUpcomingMatch, getTeamForm, getH2H, getFallbackMatch };
