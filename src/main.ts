import 'dotenv/config';
import * as fs from 'fs';
import * as path from 'path';
import { getUpcomingMatch } from './fetch';
import { validateMatchData, hashContent } from './validate';
import { generateContent } from './generate';
import { ContentPackage } from './types';

const HASHES_FILE = path.join(__dirname, '..', 'output', '.hashes.json');
const OUTPUT_DIR = path.join(__dirname, '..', 'output');

function loadHashes(): string[] {
  try {
    if (fs.existsSync(HASHES_FILE)) {
      return JSON.parse(fs.readFileSync(HASHES_FILE, 'utf-8')) as string[];
    }
  } catch {
    // ignore
  }
  return [];
}

function saveHash(hash: string): void {
  const hashes = loadHashes();
  hashes.unshift(hash);
  const recent = hashes.slice(0, 10); // keep last 10
  fs.mkdirSync(path.dirname(HASHES_FILE), { recursive: true });
  fs.writeFileSync(HASHES_FILE, JSON.stringify(recent, null, 2));
}

function formatOutput(pkg: ContentPackage): string {
  const { matchData: d, validationReport: vr } = pkg;

  const lines: string[] = [
    `# ${d.homeTeam} vs ${d.awayTeam}`,
    `**${d.league}** · ${d.date} · ${d.venue}, ${d.country}`,
    '',
    '---',
    '',
    '## 📰 Превью',
    '',
    pkg.preview,
    '',
    '---',
    '',
    '## 🎯 Прогноз',
    '',
    pkg.forecast,
    '',
    '---',
    '',
    '## 🔍 SEO',
    '',
    `**Title:** ${pkg.seoTitle}`,
    `**Description:** ${pkg.seoDescription}`,
    '',
    '---',
    '',
    '## 📱 Telegram',
    '',
    pkg.telegram,
    '',
    '---',
    '',
    '## 📊 Источники данных',
    '',
    ...pkg.sources.map((s) => `- ${s}`),
    '',
    '---',
    '',
    '## ✅ Чеклист проверки',
    '',
  ];

  if (vr.errors.length > 0) {
    lines.push('### ❌ Ошибки (блокирующие)');
    vr.errors.forEach((e) => lines.push(`- ${e}`));
    lines.push('');
  }

  if (vr.flags.length > 0) {
    lines.push('### ⚠️ Предупреждения');
    vr.flags.forEach((f) => lines.push(`- ${f}`));
    lines.push('');
  }

  if (vr.errors.length === 0 && vr.flags.length === 0) {
    lines.push('✅ Все проверки пройдены — контент готов к публикации.');
    lines.push('');
  }

  lines.push(`*Сгенерировано: ${new Date().toISOString()}*`);

  return lines.join('\n');
}

async function main(): Promise<void> {
  console.log('[main] Fetching match data...');
  const matchData = await getUpcomingMatch();
  console.log(`[main] Match: ${matchData.homeTeam} vs ${matchData.awayTeam} on ${matchData.date}`);

  console.log('[main] Validating data...');
  const validation = validateMatchData(matchData);

  if (!validation.ok) {
    console.error('[main] Validation failed — cannot generate content:');
    validation.errors.forEach((e) => console.error(`  ❌ ${e}`));
    process.exit(1);
  }

  if (validation.flags.length > 0) {
    console.warn('[main] Validation warnings:');
    validation.flags.forEach((f) => console.warn(`  ⚠️  ${f}`));
  }

  console.log('[main] Generating content via Groq...');
  const pkg = await generateContent(matchData);

  // Merge validation flags from data validation into the content package
  pkg.validationReport.flags.push(...validation.flags);

  // Duplicate detection
  const contentHash = hashContent(pkg.preview);
  const recentHashes = loadHashes();
  if (recentHashes.includes(contentHash)) {
    console.warn('[main] ⚠️  Duplicate content detected — preview hash matches a recent output');
    pkg.validationReport.flags.push('ВНИМАНИЕ: хэш совпадает с недавним выводом — возможный дубликат контента');
  }
  saveHash(contentHash);

  // Write output file
  const slug = `${matchData.date}-${matchData.homeTeam.replace(/\s+/g, '-')}-vs-${matchData.awayTeam.replace(/\s+/g, '-')}`;
  const filename = path.join(OUTPUT_DIR, `${slug}.md`);
  fs.mkdirSync(OUTPUT_DIR, { recursive: true });
  fs.writeFileSync(filename, formatOutput(pkg), 'utf-8');

  console.log(`[main] ✅ Done! Output written to: output/${slug}.md`);

  if (pkg.validationReport.flags.length > 0) {
    console.log(`[main] ⚠️  ${pkg.validationReport.flags.length} warning(s) — review the output file`);
  } else {
    console.log('[main] ✅ No warnings — content ready to publish');
  }
}

main().catch((err) => {
  console.error('[main] Fatal error:', err instanceof Error ? err.message : String(err));
  process.exit(1);
});
