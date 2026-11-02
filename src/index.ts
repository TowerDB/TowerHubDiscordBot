import 'dotenv/config';
import { createBot } from './bot.js';
import { loadConfig } from './config.js';
import { logger } from './utils/logging.js';

const EXIT_OK = 0;
const EXIT_FAILURE = 1;

/** Don't let bad things happen. The show must go on */
process.on('unhandledRejection', (reason) => logger.error('Unhandled promise rejection:', reason));

/** A thrown error nothing caught leaves the bot in an unknown state, so it restarts clean (the host brings it back). */
process.on('uncaughtException', (error) => {
  logger.error('Uncaught exception, exiting:', error);
  process.exit(EXIT_FAILURE);
});

const bot = createBot(loadConfig());

/** Die gracefully */
for (const signal of ['SIGTERM', 'SIGINT'] as const) {
  process.once(signal, () => {
    logger.info(`Received ${signal}, logging out.`);
    void bot.client.destroy().finally(() => process.exit(EXIT_OK));
  });
}

bot.start().catch((error: unknown) => {
  logger.error('Failed to log in:', error);
  process.exit(EXIT_FAILURE);
});
