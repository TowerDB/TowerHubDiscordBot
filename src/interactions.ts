import type { AutocompleteInteraction, ChatInputCommandInteraction, Interaction, MessageComponentInteraction } from 'discord.js';
import type { CommandRegistry } from './commands/registry.js';
import type { Config } from './config.js';
import { slowDown } from './embeds/general.js';
import { GameDataNotLoadedError } from './gameData.js';
import { Cooldown, RateLimiter } from './rateLimit.js';
import { handleShare, isShareComponent } from './share.js';
import { describeCommand, describePlace, logger, MS_PER_SECOND } from './utils/logging.js';
import { replyWithFailure } from './utils/replies.js';

/** One public Slow down notice per server per minute, so a raid can't turn the notices into spam of their own. */
const CHANNEL_NOTICE_COOLDOWN_MS = 60_000;

/** Routes each interaction to its command, suggestions or button, behind the rate limits. */
export function createInteractionRouter(registry: CommandRegistry, config: Config): (interaction: Interaction) => Promise<void> {
  const commandRateLimiter = new RateLimiter({
    perServer: config.maxRequestsPerServer,
    perUser: config.maxRequestsPerUser,
  });
  /** Suggestions are a TowerHub call per keystroke, so one person can't be allowed to type endlessly. Past the limit they get none. */
  const suggestionRateLimiter = new RateLimiter({
    perServer: Infinity,
    perUser: config.maxSuggestionsPerUser,
  });
  const buttonRateLimiter = new RateLimiter({
    perServer: config.maxButtonClicksPerServer,
    perUser: config.maxButtonClicksPerUser,
  });
  const channelNotices = new Cooldown();

  async function handleAutocomplete(interaction: AutocompleteInteraction): Promise<void> {
    const command = registry.find(interaction.commandName);
    try {
      if (suggestionRateLimiter.check(interaction.user.id, interaction.guildId).allowed) {
        await command?.autocomplete?.(interaction);
      }
      else {
        await interaction.respond([]);
      }
    }
    catch (error) {
      if (error instanceof GameDataNotLoadedError) {
        logger.warn(`Autocomplete for "${interaction.commandName}" skipped: game data has not loaded yet.`);
      }
      else {
        logger.error(`Autocomplete for "${interaction.commandName}" in ${describePlace(interaction)} failed:`, error);
      }
      await interaction.respond([]).catch(() => undefined);
    }
  }

  async function handleCommand(interaction: ChatInputCommandInteraction): Promise<void> {
    const command = registry.find(interaction.commandName);
    if (!command) {
      return;
    }

    // Every command gets one line, ending in how it went
    const described = describeCommand(interaction);

    const limit = commandRateLimiter.check(interaction.user.id, interaction.guildId);
    if (!limit.allowed) {
      const seconds = Math.ceil(limit.retryAfterMs / MS_PER_SECOND);
      logger.warn(`${described}: throttled (${limit.scope} limit, ${seconds}s until a slot frees up)`);

      const inChannel = limit.scope === 'server' && interaction.guildId !== null &&
        channelNotices.assign(interaction.guildId, CHANNEL_NOTICE_COOLDOWN_MS);
      await warnThrottled(interaction, inChannel ? 'channel' : 'ephemeral');

      return;
    }

    const started = Date.now();
    try {
      await command.execute(interaction);
      logger.info(`${described}: done in ${Date.now() - started}ms`);
    }
    catch (error) {
      logger.error(`${described}: failed after ${Date.now() - started}ms`, error);
      await replyWithFailure(
        interaction,
        error instanceof GameDataNotLoadedError
          ? 'Game data is still loading from TowerHub. Try again in a minute.'
          : 'That command failed. Try again in a moment.',
      );
    }
  }

  /** Post to channel buttons. Only the clicker needs to know they were throttled, so they're told privately, whichever limit it was. */
  async function handleComponent(interaction: MessageComponentInteraction): Promise<void> {
    if (!isShareComponent(interaction.customId)) {
      return;
    }

    const limit = buttonRateLimiter.check(interaction.user.id, interaction.guildId);
    if (!limit.allowed) {
      logger.warn(
        `Throttled a button click from ${interaction.user.tag} in ${describePlace(interaction)} ` +
          `(${limit.scope} limit, ${Math.ceil(limit.retryAfterMs / MS_PER_SECOND)}s until a slot frees up).`,
      );
      await warnThrottled(interaction, 'ephemeral');

      return;
    }

    try {
      await handleShare(interaction);
    }
    catch (error) {
      logger.error(`Button "${interaction.customId}" in ${describePlace(interaction)} failed:`, error);
      await replyWithFailure(interaction, 'That didn\'t work. Try again in a moment.');
    }
  }

  return async (interaction) => {
    if (interaction.isAutocomplete()) {
      await handleAutocomplete(interaction);
    }
    else if (interaction.isMessageComponent()) {
      await handleComponent(interaction);
    }
    else if (interaction.isChatInputCommand()) {
      await handleCommand(interaction);
    }
  };
}

async function warnThrottled(
  interaction: ChatInputCommandInteraction | MessageComponentInteraction,
  where: 'channel' | 'ephemeral',
): Promise<void> {
  await interaction.reply(slowDown(where))
    .catch((error: unknown) => logger.error('Failed to send the slow down notice:', error));
}
