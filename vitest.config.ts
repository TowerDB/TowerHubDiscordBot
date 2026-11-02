import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['tests/**/*.test.ts'],
    setupFiles: ['tests/setup.ts'],
    // config.ts throws without a token or bot key, and the embeds import it for image URLs. Tests never log in.
    env: { DISCORD_TOKEN: 'test-token', TOWERHUB_BOT_KEY: 'test-bot-key' },
  },
});
