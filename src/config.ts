function required(env: NodeJS.ProcessEnv, name: string): string {
  const value = env[name];
  if (!value || value.trim() === '') {
    throw new Error(`Missing required environment variable ${name}. Copy .env.example to .env and fill it in.`);
  }

  return value.trim();
}

function optional(env: NodeJS.ProcessEnv, name: string, fallback: string): string {
  const value = env[name];
  return value && value.trim() !== '' ? value.trim() : fallback;
}

/** Placeholder ids from .env.example are not real snowflakes; treat them as unset. */
function snowflake(env: NodeJS.ProcessEnv, name: string): string | undefined {
  const value = (env[name] ?? '').trim();
  return /^[1-9]\d{16,19}$/.test(value) ? value : undefined;
}

/** Counts must be whole and positive; anything else falls back rather than disabling the limit. */
function positiveInt(env: NodeJS.ProcessEnv, name: string, fallback: number): number {
  const parsed = Number.parseInt((env[name] ?? '').trim(), 10);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
}

/** Reads the given environment and throws if a required variable is missing. Nothing runs on import. */
export function loadConfig(env: NodeJS.ProcessEnv = process.env) {
  return {
    token: required(env, 'DISCORD_TOKEN'),
    guildId: snowflake(env, 'GUILD_ID'),
    /** Slash commands are separate from button clicks */
    maxRequestsPerServer: positiveInt(env, 'MAX_REQUESTS_PER_SERVER_PER_MINUTE', 50),
    maxRequestsPerUser: positiveInt(env, 'MAX_REQUESTS_PER_USER_PER_MINUTE', 10),
    maxButtonClicksPerServer: positiveInt(env, 'MAX_BUTTON_CLICKS_PER_SERVER_PER_MINUTE', 75),
    maxButtonClicksPerUser: positiveInt(env, 'MAX_BUTTON_CLICKS_PER_USER_PER_MINUTE', 10),
    /** Suggestions are one call per keystroke, so they're limited apart from commands. */
    maxSuggestionsPerUser: positiveInt(env, 'MAX_SUGGESTIONS_PER_USER_PER_MINUTE', 60),
    imageBaseUrl: optional(env, 'IMAGE_BASE_URL', 'https://raw.githubusercontent.com/TowerDB/TowerHubDiscordBot/main/'),
    towerHubUrl: optional(env, 'TOWERHUB_URL', 'https://towerhub.io'),
    /** Lets TowerHub leave the bot's reads out of its per-address limits, as every server's traffic comes from one address. */
    towerHubBotKey: required(env, 'TOWERHUB_BOT_KEY'),
  } as const;
}

export type Config = ReturnType<typeof loadConfig>;

let loaded: Config | undefined;

/** The process's config, read from the environment on first use so importing a module never throws. */
export function getConfig(): Config {
  loaded ??= loadConfig();

  return loaded;
}
