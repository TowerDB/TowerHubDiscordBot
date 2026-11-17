import { describe, expect, it } from 'vitest';

import { loadConfig } from '../src/config.js';

const SNOWFLAKE = '123456789012345678';

/** The two variables that must be set, plus whatever a test adds. */
const read = (env: NodeJS.ProcessEnv = {}) => loadConfig({ DISCORD_TOKEN: 'token', TOWERHUB_BOT_KEY: 'key', ...env });

describe('config', () => {
  it('reads the token and bot key, trimmed', () => {
    const config = read({ DISCORD_TOKEN: '  secret  ', TOWERHUB_BOT_KEY: ' key ' });

    expect(config.token).toBe('secret');
    expect(config.towerHubBotKey).toBe('key');
  });

  it.each(['DISCORD_TOKEN', 'TOWERHUB_BOT_KEY'])('refuses to start without %s', async (name) => {
    expect(() => read({ [name]: '   ' })).toThrow(`Missing required environment variable ${name}`);
  });

  it('falls back to the limits and addresses when nothing is set', () => {
    const config = read({ MAX_REQUESTS_PER_USER_PER_MINUTE: '', TOWERHUB_URL: '', IMAGE_BASE_URL: '' });

    expect(config.maxRequestsPerUser).toBe(10);
    expect(config.towerHubUrl).toBe('https://towerhub.io');
    expect(config.imageBaseUrl).toContain('raw.githubusercontent.com');
  });

  it('takes the limits and addresses that are set', () => {
    const config = read({ MAX_REQUESTS_PER_SERVER_PER_MINUTE: '7', TOWERHUB_URL: ' http://localhost:5080 ' });

    expect(config.maxRequestsPerServer).toBe(7);
    expect(config.towerHubUrl).toBe('http://localhost:5080');
  });

  it.each(['0', '-3', 'abc', ''])('ignores a limit of "%s" rather than disabling it', async (value) => {
    const config = read({ MAX_SUGGESTIONS_PER_USER_PER_MINUTE: value });

    expect(config.maxSuggestionsPerUser).toBe(60);
  });

  it('keeps a real server id', () => {
    expect(read({ GUILD_ID: ` ${SNOWFLAKE} ` }).guildId).toBe(SNOWFLAKE);
  });

  it.each(['', 'your-server-id', '12345', '0123456789012345678'])('treats the placeholder "%s" as no server', async (value) => {
    expect(read({ GUILD_ID: value }).guildId).toBeUndefined();
  });

  it('reads nothing until asked, so importing it is safe', async () => {
    await expect(import('../src/config.js')).resolves.toBeDefined();
  });
});
