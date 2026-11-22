import { Client, Events, GatewayIntentBits } from 'discord.js';
import { createRegistry } from './commands/registry.js';
import type { Config } from './config.js';
import { createContent } from './content.js';
import { GameDataCache } from './gameData.js';
import { createInteractionRouter } from './interactions.js';
import { logger } from './utils/logging.js';

const EXIT_FAILURE = 1;
/** Only gateway lifecycle lines of Discord's debug output are logged. Heartbeats and the rest would drown the log. */
const GATEWAY_LIFECYCLE = /Destroying shard|Resuming|Identifying|Connecting to|network error|closed with|Invalid session|Session timed out/i;
/** Discord gives a command 3 seconds, so one this old when it arrives is already close to expiring. */
const LATE_INTERACTION_MS = 1500;

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
  // A routine gateway reconnect, not a fault, so it isn't a warning.
  client.on(Events.ShardReconnecting, (id) => logger.info(`Shard ${id} is reconnecting.`));
  client.on(Events.ShardReady, (id) => logger.info(`Shard ${id} ready.`));
  client.on(Events.ShardResume, (id, replayed) => logger.info(`Shard ${id} resumed, replaying ${replayed} events (ping ${client.ws.ping}ms).`));
  client.on(Events.ShardError, (error, id) => logger.error(`Shard ${id} error:`, error));
  client.on(Events.Warn, (message) => logger.warn(`Discord client warning: ${message}`));
  // Says why a shard reconnected, e.g. a zombie connection after a missed heartbeat ack.
  client.on(Events.Debug, (message) => {
    if (GATEWAY_LIFECYCLE.test(message)) {
      logger.info(message.replace(/\s*\n\s*/g, ' | '));
    }
  });
  // A stalled connection delivers nothing, so a command that arrives late was held up on the way.
  client.on(Events.InteractionCreate, (interaction) => {
    const age = Date.now() - interaction.createdTimestamp;
    if (age > LATE_INTERACTION_MS) {
      logger.warn(`Interaction ${interaction.id} reached the bot ${age}ms after Discord sent it (ping ${client.ws.ping}ms).`);
    }
  });
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
