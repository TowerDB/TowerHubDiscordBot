import { Client, Events, GatewayIntentBits } from 'discord.js';
import { createRegistry } from './commands/registry.js';
import type { Config } from './config.js';
import { createContent } from './content.js';
import { GameDataCache } from './gameData.js';
import { createInteractionRouter } from './interactions.js';
import { logger } from './utils/logging.js';

const EXIT_FAILURE = 1;

export interface Bot {
  client: Client;
  /** Logs in and starts loading game data. Resolves once Discord accepts the token. */
  start(): Promise<void>;
}

/** Wires the client, commands and game data together without connecting to anything. */
export function createBot(config: Config): Bot {
  const gameData = new GameDataCache();
  const registry = createRegistry(gameData, createContent());
  const route = createInteractionRouter(registry, config);

  const client = new Client({ intents: [GatewayIntentBits.Guilds] });
  client.on(Events.Error, (error) => logger.error('Discord client error:', error));
  client.on(Events.ShardDisconnect, (event, id) => logger.warn(`Shard ${id} disconnected (code ${event.code}).`));
  client.on(Events.ShardReconnecting, (id) => logger.warn(`Shard ${id} is reconnecting.`));
  client.on(Events.ShardResume, (id) => logger.info(`Shard ${id} resumed.`));
  client.on(Events.ShardError, (error, id) => logger.error(`Shard ${id} error:`, error));
  client.on(Events.Invalidated, () => {
    logger.error('Discord invalidated the session, exiting.');
    process.exit(EXIT_FAILURE);
  });

  client.once(Events.ClientReady, async (ready) => {
    const payload = registry.commands.map((command) => command.data);

    try {
      if (config.guildId) {
        const guild = await ready.guilds.fetch(config.guildId);
        await guild.commands.set(payload);
        logger.info(`Registered ${payload.length} commands to ${guild.name}.`);
      }
      else {
        await ready.application.commands.set(payload);
        logger.info(`Registered ${payload.length} commands globally (may take up to an hour to appear).`);
      }
    }
    catch (error) {
      logger.error(`Failed to register commands ${config.guildId ? `to server ${config.guildId}` : 'globally'}:`, error);
    }

    logger.info(`Logged in as ${ready.user.tag}.`);
  });

  client.on(Events.InteractionCreate, route);

  return {
    client,
    async start() {
      // Fills the game data without holding up login. Until it's in, game commands say it's loading, and if TowerHub is
      // down it keeps trying by itself. /faq, /socials and /help don't need it.
      void gameData.refresh();

      await client.login(config.token);
    },
  };
}
