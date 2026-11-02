import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['tests/**/*.test.ts'],
    // Reading the config throws without a token or bot key.
    env: { DISCORD_TOKEN: 'test-token', TOWERHUB_BOT_KEY: 'test-bot-key' },
  },
});
