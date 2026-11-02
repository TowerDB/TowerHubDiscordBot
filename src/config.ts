import 'dotenv/config';

function required(name: string): string {
  const value = process.env[name];
  if (!value || value.trim() === '') {
    throw new Error(`Missing required environment variable ${name}. Copy .env.example to .env and fill it in.`);
  }
  
  return value.trim();
}

function optional(name: string, fallback: string): string {
  const value = process.env[name];
  return value && value.trim() !== '' ? value.trim() : fallback;
}

/** Placeholder ids from .env.example are not real snowflakes; treat them as unset. */
function snowflake(name: string): string | undefined {
  const value = (process.env[name] ?? '').trim();
  return /^[1-9]\d{16,19}$/.test(value) ? value : undefined;
}

/** Counts must be whole and positive; anything else falls back rather than disabling the limit. */
function positiveInt(name: string, fallback: number): number {
  const parsed = Number.parseInt((process.env[name] ?? '').trim(), 10);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
}

export const config = {
  token: required('DISCORD_TOKEN'),
  guildId: snowflake('GUILD_ID'),
  /** Slash commands are separate from button clicks */
  maxRequestsPerServer: positiveInt('MAX_REQUESTS_PER_SERVER_PER_MINUTE', 50),
  maxRequestsPerUser: positiveInt('MAX_REQUESTS_PER_USER_PER_MINUTE', 10),
  maxButtonClicksPerServer: positiveInt('MAX_BUTTON_CLICKS_PER_SERVER_PER_MINUTE', 75),
  maxButtonClicksPerUser: positiveInt('MAX_BUTTON_CLICKS_PER_USER_PER_MINUTE', 10),
  /** Suggestions are one call per keystroke, so they're limited apart from commands. */
  maxSuggestionsPerUser: positiveInt('MAX_SUGGESTIONS_PER_USER_PER_MINUTE', 60),
  imageBaseUrl: optional('IMAGE_BASE_URL', 'https://raw.githubusercontent.com/TowerDB/TowerHubDiscordBot/main/'),
  towerHubUrl: optional('TOWERHUB_URL', 'https://towerhub.io'),
  /** Lets TowerHub leave the bot's reads out of its per-address limits, as every server's traffic comes from one address. */
  towerHubBotKey: required('TOWERHUB_BOT_KEY'),
} as const;
