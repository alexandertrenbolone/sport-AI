import { MatchData, ValidationReport } from './types';

export function validateMatchData(data: MatchData): ValidationReport {
  const errors: string[] = [];
  const flags: string[] = [];
  const now = new Date();

  // Blocking error 1: team names empty
  if (!data.homeTeam || !data.awayTeam) {
    errors.push('Названия команд отсутствуют или пустые');
  }

  // Blocking error 2 + Warning: match date checks
  if (data.date) {
    const matchDate = new Date(data.date);
    if (isNaN(matchDate.getTime())) {
      errors.push('Некорректная дата матча — не удалось разобрать');
    } else {
      const diffDays = (now.getTime() - matchDate.getTime()) / (1000 * 60 * 60 * 24);
      if (diffDays > 3) {
        errors.push(`Дата матча ${data.date} более чем на 3 дня в прошлом`);
      }
      const futureDiffDays = (matchDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24);
      if (futureDiffDays > 30) {
        flags.push('Матч более чем через 30 дней — данных по форме может быть мало');
      }
    }
  }

  // Blocking error 3: data freshness
  if (data.fetchedAt) {
    const fetchedAt = new Date(data.fetchedAt);
    if (isNaN(fetchedAt.getTime())) {
      errors.push('Некорректная метка времени fetchedAt');
    } else {
      const ageHours = (now.getTime() - fetchedAt.getTime()) / (1000 * 60 * 60);
      if (ageHours > 2) {
        errors.push(`Данные устарели: получены ${ageHours.toFixed(1)}ч назад (лимит 2ч)`);
      }
    }
  }

  // Warning: form data incomplete
  if (data.homeForm.last5.length < 3) {
    flags.push(`Мало данных о форме ${data.homeTeam}: только ${data.homeForm.last5.length} последних матча`);
  }
  if (data.awayForm.last5.length < 3) {
    flags.push(`Мало данных о форме ${data.awayTeam}: только ${data.awayForm.last5.length} последних матча`);
  }

  // Warning: no H2H data
  if (data.h2h.length === 0) {
    flags.push('Нет данных об очных встречах — прогноз строится только по форме');
  }

  // Warning: unknown match time
  if (!data.time || data.time === '00:00') {
    flags.push('Время матча неизвестно — уточните перед публикацией');
  }

  // Warning: unknown venue
  if (data.venue === 'Unknown Venue') {
    flags.push('Стадион не указан — может выглядеть странно в тексте');
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
