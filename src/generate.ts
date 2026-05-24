import 'dotenv/config';
import OpenAI from 'openai';
import { MatchData, ContentPackage, ValidationReport } from './types';
import { formatMatchForPrompt } from './validate';

const groq = new OpenAI({
  apiKey: process.env.GROQ_API_KEY ?? '',
  baseURL: 'https://api.groq.com/openai/v1',
});

const MODEL = 'llama-3.3-70b-versatile';

async function chat(systemPrompt: string, userPrompt: string, maxTokens = 1024): Promise<string> {
  try {
    const response = await groq.chat.completions.create({
      model: MODEL,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt },
      ],
      max_tokens: maxTokens,
      temperature: 0.7,
    });
    return response.choices[0]?.message?.content?.trim() ?? '';
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    throw new Error(`[groq] API call failed: ${msg}`);
  }
}

async function generatePreview(data: MatchData, factBlock: string): Promise<string> {
  return chat(
    `You are a Russian sports journalist. Write vivid, professional match previews.
Rules:
- Use ONLY the facts provided below. Do not add any injuries, transfers, player ratings, or statistics not listed in the data.
- No clichés: forbidden phrases include "захватывающее противостояние", "принципиальная дуэль", "горячий поединок", "судьбоносный матч"
- Write in Russian. Natural, lively language — not stiff or bureaucratic.
- Do not start with "Вот" or "Сегодня рассмотрим". Just start writing.
- Length: 350-450 words.`,
    `${factBlock}\n\nWrite a match preview based only on the data above.`,
    1200,
  );
}

async function generateForecast(data: MatchData, factBlock: string): Promise<string> {
  return chat(
    `You are a sports analyst making calibrated predictions.
Rules:
- Base your forecast ONLY on the form and H2H data provided. Do not invent player injuries or transfers.
- FORBIDDEN words: "очевидно", "явный фаворит", "гарантированно", "несомненно", "однозначно", "без сомнений"
- Always express uncertainty. Use phrases like "скорее всего", "с вероятностью около X%", "возможен вариант"
- Give probability estimates for: home win / draw / away win (must sum to 100%)
- Suggest a specific bet (e.g., "П1 за 1.9") with reasoning
- Write in Russian. 200-300 words.`,
    `${factBlock}\n\nProvide a match forecast with probability breakdown and a suggested bet.`,
    900,
  );
}

async function generateSEO(data: MatchData): Promise<{ title: string; description: string }> {
  const raw = await chat(
    `You are an SEO specialist for a Russian sports website.
Rules:
- Title: 50-65 characters including spaces. Must contain both team names and the word "прогноз" or "превью". No clickbait.
- Description: 140-165 characters. Include match date, key form insight, and a call to read more. No keyword stuffing.
- Output ONLY valid JSON: {"title": "...", "description": "..."}
- Write in Russian.`,
    `Match: ${data.homeTeam} vs ${data.awayTeam}\nDate: ${data.date}\nCompetition: ${data.league}\n\nGenerate SEO title and description.`,
    256,
  );

  try {
    const cleaned = raw.replace(/```(?:json)?\n?/g, '').replace(/```/g, '').trim();
    const start = cleaned.indexOf('{');
    const end = cleaned.lastIndexOf('}');
    if (start !== -1 && end !== -1 && end > start) {
      const parsed = JSON.parse(cleaned.slice(start, end + 1)) as { title?: string; description?: string };
      if (parsed.title && parsed.description) {
        return { title: parsed.title, description: parsed.description };
      }
    }
  } catch {
    // fall through to defaults
  }

  return {
    title: `${data.homeTeam} — ${data.awayTeam}: прогноз на матч`,
    description: `Прогноз и превью матча ${data.homeTeam} против ${data.awayTeam} ${data.date}. Анализ формы команд и ставка.`,
  };
}

async function generateTelegram(data: MatchData, factBlock: string): Promise<string> {
  return chat(
    `You are a Telegram channel editor for a Russian sports channel.
Rules:
- Maximum 280 characters total including emojis and hashtags
- Start with a relevant emoji (⚽ or 🏆 or 🔥)
- One sentence about the match + one sentence with the key insight or prediction
- End with 2-3 relevant hashtags in Russian (e.g., #АПЛ #прогноз)
- Write in Russian.`,
    `${factBlock}\n\nWrite a Telegram post for this match. Stay under 280 characters.`,
    200,
  );
}

async function humanizeText(text: string, context: string): Promise<string> {
  return chat(
    `You are a Russian text editor. Your job is to remove AI-generated writing patterns.
Remove or rewrite:
- Bureaucratic phrases: "в рамках данного", "следует отметить", "важно подчеркнуть", "на сегодняшний день"
- English calques: "имплементировать", "релевантный", "в данном контексте"
- Inflated importance: "ключевой", "принципиально важный", "фундаментальный" (unless genuinely appropriate)
- Chatbot artifacts: "Конечно!", "Безусловно!", "Разумеется,", "Итак,"
- Passive voice where active is more natural
Keep the meaning and length roughly the same. Return only the edited text, no explanations.`,
    `Context: ${context}\nText to edit:\n${text}`,
    1200,
  );
}

export async function generateContent(data: MatchData): Promise<ContentPackage> {
  const factBlock = formatMatchForPrompt(data);
  const flags: string[] = [];

  console.log('[generate] Starting parallel generation...');

  const [previewRaw, forecastRaw, telegram] = await Promise.all([
    generatePreview(data, factBlock),
    generateForecast(data, factBlock),
    generateTelegram(data, factBlock),
  ]);

  const seo = await generateSEO(data);

  console.log('[generate] Humanizing preview and forecast...');
  const [preview, forecast] = await Promise.all([
    humanizeText(previewRaw, 'sports match preview'),
    humanizeText(forecastRaw, 'sports match forecast'),
  ]);

  // Validate that team names appear in output (hallucination check)
  if (!preview.includes(data.homeTeam) || !preview.includes(data.awayTeam)) {
    flags.push(`WARNING: Team name(s) missing in preview — possible hallucination (expected "${data.homeTeam}" and "${data.awayTeam}")`);
  }
  if (!forecast.includes(data.homeTeam) || !forecast.includes(data.awayTeam)) {
    flags.push(`WARNING: Team name(s) missing in forecast — possible hallucination (expected "${data.homeTeam}" and "${data.awayTeam}")`);
  }

  const sources = [
    `TheSportsDB — match data for event ${data.matchId}`,
    `TheSportsDB — ${data.homeTeam} last 5 matches (team ID: ${data.homeTeamId})`,
    `TheSportsDB — ${data.awayTeam} last 5 matches (team ID: ${data.awayTeamId})`,
    `TheSportsDB — head-to-head history`,
  ];

  const validationReport: ValidationReport = {
    ok: true,
    flags,
    errors: [],
  };

  return {
    matchData: data,
    preview,
    forecast,
    seoTitle: seo.title,
    seoDescription: seo.description,
    telegram,
    sources,
    validationReport,
  };
}
