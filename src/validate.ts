import { MatchData, ValidationReport } from './types';

export function validateMatchData(data: MatchData): ValidationReport {
  const errors: string[] = [];
  const flags: string[] = [];
  const now = new Date();

  // Blocking error 1: team names empty
  if (!data.homeTeam || !data.awayTeam) {
    errors.push('Team names are empty or missing');
  }

  // Blocking error 2 + Warning: match date checks
  if (data.date) {
    const matchDate = new Date(data.date);
    if (isNaN(matchDate.getTime())) {
      errors.push('Match date is invalid or unparseable');
    } else {
      const diffDays = (now.getTime() - matchDate.getTime()) / (1000 * 60 * 60 * 24);
      if (diffDays > 3) {
        errors.push(`Match date ${data.date} is more than 3 days in the past`);
      }
      const futureDiffDays = (matchDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24);
      if (futureDiffDays > 30) {
        flags.push('Match is more than 30 days in the future — data may be limited');
      }
    }
  }

  // Blocking error 3: data freshness
  if (data.fetchedAt) {
    const fetchedAt = new Date(data.fetchedAt);
    if (isNaN(fetchedAt.getTime())) {
      errors.push('fetchedAt timestamp is invalid');
    } else {
      const ageHours = (now.getTime() - fetchedAt.getTime()) / (1000 * 60 * 60);
      if (ageHours > 2) {
        errors.push(`Data is stale: fetched ${ageHours.toFixed(1)}h ago (max 2h)`);
      }
    }
  }

  // Warning: form data incomplete
  if (data.homeForm.last5.length < 3) {
    flags.push(`Limited form data for ${data.homeTeam}: only ${data.homeForm.last5.length} recent matches`);
  }
  if (data.awayForm.last5.length < 3) {
    flags.push(`Limited form data for ${data.awayTeam}: only ${data.awayForm.last5.length} recent matches`);
  }

  // Warning: no H2H data
  if (data.h2h.length === 0) {
    flags.push('No head-to-head data available — forecast will be based on form only');
  }

  // Warning: unknown match time
  if (!data.time || data.time === '00:00') {
    flags.push('Match time is unknown — may be TBC');
  }

  // Warning: unknown venue
  if (data.venue === 'Unknown Venue') {
    flags.push('Venue is unknown — may look odd in generated content');
  }

  return {
    ok: errors.length === 0,
    flags,
    errors,
  };
}

export function formatMatchForPrompt(data: MatchData): string {
  const lines: string[] = [
    `MATCH: ${data.homeTeam} vs ${data.awayTeam}`,
    `COMPETITION: ${data.league}`,
    `DATE: ${data.date} at ${data.time} UTC`,
    `VENUE: ${data.venue}, ${data.country}`,
    '',
  ];

  // Home team form
  lines.push(`${data.homeTeam} RECENT FORM (last ${data.homeForm.last5.length} matches):`);
  if (data.homeForm.last5.length === 0) {
    lines.push('  No recent match data available');
  } else {
    for (const m of data.homeForm.last5) {
      const ha = m.isHome ? 'H' : 'A';
      lines.push(`  ${m.date}: vs ${m.opponent} (${ha}) — ${m.score} (${m.result})`);
    }
  }
  lines.push('');

  // Away team form
  lines.push(`${data.awayTeam} RECENT FORM (last ${data.awayForm.last5.length} matches):`);
  if (data.awayForm.last5.length === 0) {
    lines.push('  No recent match data available');
  } else {
    for (const m of data.awayForm.last5) {
      const ha = m.isHome ? 'H' : 'A';
      lines.push(`  ${m.date}: vs ${m.opponent} (${ha}) — ${m.score} (${m.result})`);
    }
  }
  lines.push('');

  // H2H
  if (data.h2h.length === 0) {
    lines.push('HEAD-TO-HEAD: No H2H data available');
  } else {
    lines.push(`HEAD-TO-HEAD (last ${data.h2h.length} meetings):`);
    for (const h of data.h2h) {
      lines.push(`  ${h.date}: ${h.homeTeam} ${h.score} ${h.awayTeam} — Winner: ${h.winner}`);
    }
  }

  return lines.join('\n');
}

export function hashContent(text: string): string {
  let hash = 5381;
  for (let i = 0; i < text.length; i++) {
    hash = ((hash << 5) + hash) + text.charCodeAt(i);
    hash = hash & hash;
  }
  return Math.abs(hash).toString(16);
}
